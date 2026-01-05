import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { useCustomGPTs } from '@/hooks/useCustomGPTs';
import { useMessages } from '@/hooks/useMessages';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { createConversation, saveMessage, updateConversationTitle, streamChat, fetchGPTFiles } from '@/lib/chat';
import { messageQueue } from '@/lib/offline-queue';
import { withRetry } from '@/lib/auto-repair';
import { cacheConversation, cacheMessage } from '@/lib/offline';
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

  // 온라인/오프라인 상태 감지
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('인터넷에 연결되었습니다');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('오프라인 상태입니다. 메시지 전송이 불가능합니다.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 커스텀 GPT 변경 시 파일 로드
  useEffect(() => {
    if (currentGPT) {
      loadGPTFiles();
    } else {
      setCurrentGPTFiles([]);
    }
  }, [currentGPT]);

  const loadGPTFiles = async () => {
    if (!currentGPT) return;
    try {
      const files = await fetchGPTFiles(currentGPT.id);
      setCurrentGPTFiles(files);
    } catch (error) {
      console.error('GPT 파일 로드 실패:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSend = async (content: string) => {
    if (!user) {
      toast.error('게스트 모드로 먼저 시작하세요');
      return;
    }

    // 게스트 사용자는 로컬 데이터만 사용
    const isGuest = user.isGuest === true;

    // 오프라인이면 큐에 추가
    if (!isOnline) {
      if (!isGuest) {
        const conversationId = currentConversationId || (await createConversation(user.id, content.slice(0, 50))).id;
        messageQueue.addToQueue(conversationId, content);
      } else {
        toast.error('게스트 모드에서는 오프라인 전송이 지원되지 않습니다');
      }
      return;
    }

    let conversationId = currentConversationId;
    let userMessageId: string | null = null;
    let userMessageObj: any = null;

    try {
      let systemPrompt = currentGPT?.system_prompt;
      let instructions = currentGPT?.instructions;

      // 현재 대화의 GPT 설정 가져오기
      if (conversationId && !currentGPT) {
        const conv = conversations.find(c => c.id === conversationId);
        if (conv) {
          systemPrompt = conv.system_prompt;
          instructions = conv.instructions;
        }
      }

      // 새 대화 생성 (게스트는 로컬만)
      if (!conversationId) {
        const title = content.slice(0, 50);
        if (isGuest) {
          // 게스트: 로컬 대화 생성
          const newConv = {
            id: `local-${Date.now()}`,
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
          // IndexedDB에 저장
          await cacheConversation(newConv);
        } else {
          // 일반 사용자: 서버에 저장
          const newConv = await withRetry(() =>
            createConversation(
              user.id,
              title,
              currentGPT?.id,
              systemPrompt,
              instructions
            )
          );
          conversationId = newConv.id;
          addConversation(newConv);
          setCurrentConversation(conversationId);
          // IndexedDB에도 캐시
          await cacheConversation(newConv);
        }
      }

      // 사용자 메시지 저장
      if (isGuest) {
        // 게스트: 로컬 메시지
        userMessageObj = {
          id: `msg-${Date.now()}`,
          conversation_id: conversationId!,
          role: 'user' as const,
          content,
          created_at: new Date().toISOString(),
        };
        userMessageId = userMessageObj.id;
        addMessage(userMessageObj);
        // IndexedDB에 저장
        await cacheMessage(userMessageObj);
      } else {
        // 일반 사용자: 서버에 저장
        userMessageObj = await withRetry(() => saveMessage(conversationId!, 'user', content));
        userMessageId = userMessageObj.id;
        addMessage(userMessageObj);
        // IndexedDB에도 캐시
        await cacheMessage(userMessageObj);
      }

      // 스트리밍 시작
      setIsStreaming(true);
      setStreamingMessage('');

      const chatMessages = [...messages, userMessageObj];
      const stream = await streamChat(chatMessages, systemPrompt, instructions, currentGPTFiles);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      let fullResponse = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // 마지막 라인은 불완전할 수 있으므로 버퍼에 유지
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            
            const data = trimmed.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                setStreamingMessage(fullResponse);
              }
            } catch (e) {
              // JSON 파싱 실패는 조용히 무시 (불완전한 청크일 수 있음)
              console.debug('Skipping unparseable chunk:', data.substring(0, 100));
            }
          }
        }

        // 버퍼에 남은 데이터 최종 처리
        if (buffer.trim()) {
          const finalLines = buffer.split('\n');
          for (const line of finalLines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                setStreamingMessage(fullResponse);
              }
            } catch (e) {
              console.debug('Final buffer parse skipped');
            }
          }
        }
      } catch (streamError: any) {
        console.error('Stream reading error:', streamError);
        throw new Error('스트리밍 중 연결이 끊어졌습니다. 다시 시도해주세요.');
      }

      // 응답 저장
      if (fullResponse.trim()) {
        if (isGuest) {
          // 게스트: 로컬 메시지
          const assistantMessage = {
            id: `msg-${Date.now() + 1}`,
            conversation_id: conversationId!,
            role: 'assistant' as const,
            content: fullResponse,
            created_at: new Date().toISOString(),
          };
          addMessage(assistantMessage);
          // IndexedDB에 저장
          await cacheMessage(assistantMessage);
        } else {
          // 일반 사용자: 서버에 저장
          const assistantMessage = await withRetry(() =>
            saveMessage(conversationId!, 'assistant', fullResponse)
          );
          addMessage(assistantMessage);
          // IndexedDB에도 캐시
          await cacheMessage(assistantMessage);
        }

        // 첫 메시지인 경우 제목 업데이트
        if (messages.length === 0 && userMessageObj) {
          const title = content.slice(0, 50);
          const updatedConv = { title, updated_at: new Date().toISOString() };
          if (!isGuest) {
            await withRetry(() => updateConversationTitle(conversationId!, title));
          }
          updateConversation(conversationId!, updatedConv);
          // IndexedDB 업데이트
          const conv = conversations.find(c => c.id === conversationId!);
          if (conv) {
            await cacheConversation({ ...conv, ...updatedConv });
          }
        }
      } else {
        toast.error('AI 응답이 비어있습니다');
      }

      setStreamingMessage('');
      setIsStreaming(false);
    } catch (error: any) {
      console.error('Failed to send message:', error);
      
      const errorMessage = error?.message || '메시지 전송에 실패했습니다';
      toast.error(errorMessage);
      
      setIsStreaming(false);
      setStreamingMessage('');
    }
  };

  const showEmpty = !currentConversationId && messages.length === 0;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {currentGPT && (
        <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-b border-white/10 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
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
                isStreaming={true}
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
