import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { useCustomGPTs } from '@/hooks/useCustomGPTs';
import { useMessages } from '@/hooks/useMessages';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import {
  createConversation,
  saveMessage,
  updateConversationTitle,
  streamChat,
  fetchGPTFiles,
} from '@/lib/chat';
import { messageQueue } from '@/lib/offline-queue';
import { withRetry } from '@/lib/auto-repair';
import { cacheConversation, cacheMessage } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import {
  storeFile,
  getFileBlob,
  setMessageFiles,
} from '@/lib/fileStorage';
import { ChatFileAttachment } from '@/types';
import { toast } from 'sonner';

export function ChatPage() {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const {
    currentConversationId,
    messages,
    streamingMessage,
    isStreaming,
    currentGPT,
    currentGPTFiles,
    conversations,
    setCurrentConversation,
    addMessage,
    setStreamingMessage,
    setIsStreaming,
    addConversation,
    updateConversation,
    setCurrentGPTFiles,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useConversations(user?.id);
  useCustomGPTs(user?.id);
  useMessages(currentConversationId);

  // 온라인/오프라인 감지
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      toast.success('인터넷에 연결되었습니다');
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.error('오프라인 상태입니다');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // 커스텀 GPT 변경 시 파일 로드
  useEffect(() => {
    if (currentGPT) {
      fetchGPTFiles(currentGPT.id)
        .then(setCurrentGPTFiles)
        .catch((e) => console.error('GPT 파일 로드 실패:', e));
    } else {
      setCurrentGPTFiles([]);
    }
  }, [currentGPT?.id]);

  // 메시지 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // ── 파일 처리: localforage 저장 후 AI용 변환 ──────────────────
  const processAttachedFiles = async (
    files: File[],
    userId: string,
    isGuest: boolean,
    convId: string
  ): Promise<ChatFileAttachment[]> => {
    const attachments: ChatFileAttachment[] = [];

    for (const file of files) {
      try {
        // *** 모든 파일을 localforage에 Blob 그대로 저장 ***
        const storedMeta = await storeFile(file, { conversationId: convId });
        const localId = storedMeta.id;

        if (storedMeta.type === 'image') {
          if (isGuest || !navigator.onLine) {
            // 게스트/오프라인: localforage blob → base64 변환 (AI 전송용)
            const blob = await getFileBlob(localId);
            if (blob) {
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              attachments.push({ name: file.name, mimeType: file.type, type: 'image', base64, localId });
            }
          } else {
            // 인증 유저: Supabase Storage 업로드 → signed URL
            const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
            const path = `${userId}/chat/${Date.now()}_${safeName}`;
            const { data, error } = await supabase.storage
              .from('chat-files')
              .upload(path, file);

            if (error) {
              toast.error(`이미지 업로드 실패: ${file.name}`);
              // 폴백: localforage blob → base64
              const blob = await getFileBlob(localId);
              if (blob) {
                const base64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = (e) => resolve(e.target?.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
                attachments.push({ name: file.name, mimeType: file.type, type: 'image', base64, localId });
              }
              continue;
            }

            const { data: signed } = await supabase.storage
              .from('chat-files')
              .createSignedUrl(data.path, 3600);

            attachments.push({
              name: file.name,
              mimeType: file.type,
              type: 'image',
              url: signed?.signedUrl,
              localId,
            });
          }
        } else if (storedMeta.type === 'text') {
          // 텍스트: storeFile에서 이미 추출된 내용 사용
          attachments.push({
            name: file.name,
            mimeType: file.type,
            type: 'text',
            textContent: storedMeta.textContent,
            localId,
          });
        } else {
          // 기타 바이너리: localforage에 저장됨, 이름만 AI에 전달
          attachments.push({ name: file.name, mimeType: file.type, type: 'other', localId });
        }
      } catch (err) {
        console.error(`파일 처리 오류 (${file.name}):`, err);
        toast.error(`파일 처리 실패: ${file.name}`);
      }
    }

    return attachments;
  };

  // ── 메시지 전송 ─────────────────────────────────────────────
  const handleSend = async (content: string, attachedFiles: File[] = []) => {
    if (!user) {
      toast.error('게스트 모드로 먼저 시작하세요');
      return;
    }
    if (!content.trim() && attachedFiles.length === 0) return;

    const isGuest = user.isGuest === true;

    // 오프라인 큐
    if (!isOnline) {
      if (!isGuest && currentConversationId && attachedFiles.length === 0) {
        messageQueue.addToQueue(currentConversationId, content);
        toast.info('메시지가 큐에 추가되었습니다. 온라인 상태가 되면 자동 전송됩니다.');
      } else {
        toast.error('오프라인에서는 파일 첨부 메시지를 전송할 수 없습니다');
      }
      return;
    }

    let conversationId = currentConversationId;
    let savedUserMsgId: string | null = null;
    const tempId = `temp-${Date.now()}`;

    try {
      // GPT 설정 가져오기
      let systemPrompt = currentGPT?.system_prompt;
      let instructions = currentGPT?.instructions;

      if (conversationId && !currentGPT) {
        const conv = conversations.find((c) => c.id === conversationId);
        if (conv) {
          systemPrompt = conv.system_prompt;
          instructions = conv.instructions;
        }
      }

      // ── 1. 새 대화 생성 ──────────────────────────────────────
      if (!conversationId) {
        const title = content.slice(0, 50) || attachedFiles[0]?.name || '새 대화';
        if (isGuest) {
          const newConv = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            user_id: user.id,
            title,
            custom_gpt_id: currentGPT?.id || null,
            system_prompt: systemPrompt || '',
            instructions: instructions || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          conversationId = newConv.id;
          addConversation(newConv);
          setCurrentConversation(conversationId);
          await cacheConversation(newConv).catch(console.error);
        } else {
          const newConv = await withRetry(() =>
            createConversation(user.id, title, currentGPT?.id, systemPrompt, instructions)
          );
          conversationId = newConv.id;
          addConversation(newConv);
          setCurrentConversation(conversationId);
          await cacheConversation(newConv).catch(console.error);
        }
      }

      // ── 2. 파일 처리 (localforage + AI 변환) ─────────────────
      let chatAttachments: ChatFileAttachment[] = [];
      if (attachedFiles.length > 0) {
        chatAttachments = await processAttachedFiles(
          attachedFiles,
          user.id,
          isGuest,
          conversationId!
        );
      }

      // localforage 파일 ID 목록 추출
      const localFileIds = chatAttachments
        .map((a) => a.localId)
        .filter((id): id is string => Boolean(id));

      // ── 3. 표시용 내용 생성 ──────────────────────────────────
      const imgCount = chatAttachments.filter((a) => a.type === 'image').length;
      const displayContent =
        content.trim() ||
        (imgCount > 0 ? `📷 이미지 ${imgCount}개` : `📎 파일 ${attachedFiles.length}개`);

      const userMessage = {
        id: tempId,
        conversation_id: conversationId!,
        role: 'user' as const,
        content: displayContent,
        created_at: new Date().toISOString(),
        localFileIds: localFileIds.length > 0 ? localFileIds : undefined,
      };

      addMessage(userMessage);
      setIsStreaming(true);
      setStreamingMessage('');

      const chatMessages = [...messages, userMessage];

      // ── 4. 사용자 메시지 저장 ────────────────────────────────
      if (isGuest) {
        savedUserMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const savedMsg = { ...userMessage, id: savedUserMsgId };
        await cacheMessage(savedMsg).catch(console.error);
        useChatStore
          .getState()
          .setMessages(
            useChatStore.getState().messages.map((m) => (m.id === tempId ? savedMsg : m))
          );
      } else {
        const saved = await withRetry(() =>
          saveMessage(conversationId!, 'user', displayContent)
        );
        savedUserMsgId = saved.id;
        const savedMsg = {
          ...saved,
          localFileIds: localFileIds.length > 0 ? localFileIds : undefined,
        };
        await cacheMessage(savedMsg).catch(console.error);
        useChatStore
          .getState()
          .setMessages(
            useChatStore.getState().messages.map((m) => (m.id === tempId ? savedMsg : m))
          );
      }

      // ── 5. 파일 ID → 메시지 ID 연결 (localforage에 저장) ─────
      if (localFileIds.length > 0 && savedUserMsgId) {
        await setMessageFiles(savedUserMsgId, localFileIds).catch(console.error);
      }

      // ── 6. AI 스트리밍 ───────────────────────────────────────
      const stream = await streamChat(
        chatMessages,
        systemPrompt,
        instructions,
        currentGPTFiles,
        chatAttachments.length > 0 ? chatAttachments : undefined,
        content.trim()
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.includes('data: ')) continue;
          const jsonStr = line.replace(/^data:\s*/, '').trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullResponse += delta;
              setStreamingMessage(fullResponse);
            }
          } catch {
            // 파싱 오류 무시
          }
        }
      }

      if (!fullResponse.trim()) {
        throw new Error('AI가 응답을 생성하지 못했습니다');
      }

      // ── 7. AI 응답 저장 ──────────────────────────────────────
      const assistantMsg = {
        id: isGuest
          ? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
          : `temp-${Date.now()}`,
        conversation_id: conversationId!,
        role: 'assistant' as const,
        content: fullResponse,
        created_at: new Date().toISOString(),
      };

      if (isGuest) {
        addMessage(assistantMsg);
        await cacheMessage(assistantMsg).catch(console.error);
      } else {
        const saved = await withRetry(() =>
          saveMessage(conversationId!, 'assistant', fullResponse)
        );
        assistantMsg.id = saved.id;
        addMessage(assistantMsg);
        await cacheMessage(saved).catch(console.error);
      }

      // ── 8. 첫 메시지 제목 업데이트 ──────────────────────────
      if (messages.length === 0) {
        const newTitle = content.slice(0, 50) || displayContent.slice(0, 50);
        if (!isGuest) {
          await withRetry(() =>
            updateConversationTitle(conversationId!, newTitle)
          ).catch(console.error);
        }
        const updatedConv = { title: newTitle, updated_at: new Date().toISOString() };
        updateConversation(conversationId!, updatedConv);
        const conv = conversations.find((c) => c.id === conversationId);
        if (conv) await cacheConversation({ ...conv, ...updatedConv }).catch(console.error);
      }

      setStreamingMessage('');
      setIsStreaming(false);
    } catch (error: any) {
      console.error('메시지 전송 실패:', error);
      setIsStreaming(false);
      setStreamingMessage('');

      // 저장되지 않은 임시 메시지 제거
      if (!savedUserMsgId) {
        useChatStore
          .getState()
          .setMessages(useChatStore.getState().messages.filter((m) => m.id !== tempId));
      }

      let msg = '메시지 전송에 실패했습니다';
      if (error?.message?.includes('AI')) msg = error.message;
      else if (error?.message?.includes('네트워크') || error?.message?.includes('network'))
        msg = '네트워크 연결을 확인해주세요';
      else if (error?.message?.includes('인증') || error?.message?.includes('auth'))
        msg = '인증에 실패했습니다. 다시 로그인해주세요';
      else if (error?.message) msg = error.message;

      toast.error(msg);
    }
  };

  const showEmpty = !currentConversationId && messages.length === 0;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* 커스텀 GPT 배너 */}
      {currentGPT && (
        <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-b border-white/10 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              {currentGPT.avatar_url ? (
                <img
                  src={currentGPT.avatar_url}
                  alt={currentGPT.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-white text-sm font-bold">{currentGPT.name[0]}</span>
              )}
            </div>
            <div>
              <div className="text-white font-medium">{currentGPT.name}</div>
              {currentGPT.description && (
                <div className="text-white/60 text-sm">{currentGPT.description}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto">
        {showEmpty ? (
          <EmptyState />
        ) : (
          <div className="pb-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {streamingMessage && (
              <ChatMessage
                message={{
                  id: 'streaming',
                  conversation_id: currentConversationId!,
                  role: 'assistant',
                  content: streamingMessage,
                  created_at: new Date().toISOString(),
                }}
                isStreaming
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

// localforage를 통해 파일이 IndexedDB에 영구 보존됩니다.
