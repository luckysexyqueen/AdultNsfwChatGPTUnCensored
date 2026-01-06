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

    const isGuest = user.isGuest === true;

    // 오프라인 체크
    if (!isOnline) {
      if (!isGuest && currentConversationId) {
        messageQueue.addToQueue(currentConversationId, content);
        toast.info('메시지가 큐에 추가되었습니다. 온라인 상태가 되면 자동 전송됩니다.');
      } else {
        toast.error(isGuest ? '게스트 모드에서는 오프라인 전송이 지원되지 않습니다' : '인터넷에 연결된 후 사용할 수 있습니다');
      }
      return;
    }

    let conversationId = currentConversationId;
    let userMessageId: string | null = null;
    const tempUserId = `temp-${Date.now()}`;

    try {
      // GPT 설정 가져오기
      let systemPrompt = currentGPT?.system_prompt;
      let instructions = currentGPT?.instructions;

      if (conversationId && !currentGPT) {
        const conv = conversations.find(c => c.id === conversationId);
        if (conv) {
          systemPrompt = conv.system_prompt;
          instructions = conv.instructions;
        }
      }

      // 새 대화 생성
      if (!conversationId) {
        const title = content.slice(0, 50);
        if (isGuest) {
          const newConv = {
            id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

      // 사용자 메시지 UI에 표시 (임시 ID)
      const userMessage = {
        id: tempUserId,
        conversation_id: conversationId!,
        role: 'user' as const,
        content,
        created_at: new Date().toISOString(),
      };

      addMessage(userMessage);
      setIsStreaming(true);
      setStreamingMessage('');

      const chatMessages = [...messages, userMessage];

      // AI 응답 스트리밍
      const stream = await streamChat(chatMessages, systemPrompt, instructions, currentGPTFiles);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      // 사용자 메시지 저장
      if (isGuest) {
        userMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const savedUserMsg = { ...userMessage, id: userMessageId };
        await cacheMessage(savedUserMsg).catch(console.error);
        // UI 업데이트
        const updatedMessages = messages.map(m => m.id === tempUserId ? savedUserMsg : m);
        useChatStore.getState().setMessages([...updatedMessages, savedUserMsg]);
      } else {
        const savedMsg = await withRetry(() => saveMessage(conversationId!, 'user', content));
        userMessageId = savedMsg.id;
        await cacheMessage(savedMsg).catch(console.error);
      }

      // 스트림 읽기
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
          } catch (e) {
            // 파싱 에러 무시
          }
        }
      }

      if (!fullResponse.trim()) {
        throw new Error('AI가 응답을 생성하지 못했습니다');
      }

      // AI 응답 저장
      const assistantMessage = {
        id: isGuest ? `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : `temp-${Date.now()}`,
        conversation_id: conversationId!,
        role: 'assistant' as const,
        content: fullResponse,
        created_at: new Date().toISOString(),
      };

      if (isGuest) {
        addMessage(assistantMessage);
        await cacheMessage(assistantMessage).catch(console.error);
      } else {
        const savedMsg = await withRetry(() => saveMessage(conversationId!, 'assistant', fullResponse));
        assistantMessage.id = savedMsg.id;
        addMessage(assistantMessage);
        await cacheMessage(savedMsg).catch(console.error);
      }

      // 첫 메시지인 경우 제목 업데이트
      if (messages.length === 0) {
        const title = content.slice(0, 50);
        const updatedConv = { title, updated_at: new Date().toISOString() };
        if (!isGuest) {
          await withRetry(() => updateConversationTitle(conversationId!, title)).catch(console.error);
        }
        updateConversation(conversationId!, updatedConv);
        const conv = conversations.find(c => c.id === conversationId!);
        if (conv) {
          await cacheConversation({ ...conv, ...updatedConv }).catch(console.error);
        }
      }

      setStreamingMessage('');
      setIsStreaming(false);
    } catch (error: any) {
      console.error('메시지 전송 실패:', error);

      // 상태 초기화
      setIsStreaming(false);
      setStreamingMessage('');

      // 임시 메시지 제거 (저장되지 않은 경우)
      if (!userMessageId) {
        const filteredMessages = messages.filter(m => m.id !== tempUserId);
        useChatStore.getState().setMessages(filteredMessages);
      }

      // 사용자 친화적 에러 메시지
      let errorMsg = '메시지 전송에 실패했습니다';
      if (error?.message?.includes('AI')) {
        errorMsg = error.message;
      } else if (error?.message?.includes('네트워크') || error?.message?.includes('network')) {
        errorMsg = '네트워크 연결을 확인해주세요';
      } else if (error?.message?.includes('인증') || error?.message?.includes('auth')) {
        errorMsg = '인증에 실패했습니다. 다시 로그인해주세요';
      }
      
      toast.error(errorMsg);
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
