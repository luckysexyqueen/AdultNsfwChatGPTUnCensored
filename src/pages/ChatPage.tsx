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

    // 오프라인이면 큐에 추가 (게스트는 불가)
    if (!isOnline) {
      if (!isGuest && currentConversationId) {
        messageQueue.addToQueue(currentConversationId, content);
      } else {
        toast.error(isGuest ? '게스트 모드에서는 오프라인 전송이 지원되지 않습니다' : '인터넷에 연결된 후 사용할 수 있습니다');
      }
      return;
    }

    let conversationId = currentConversationId;
    let userMessageObj: any = null;
    let savedUserMessage = false;

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

      // 새 대화 생성
      if (!conversationId) {
        const title = content.slice(0, 50);
        if (isGuest) {
          // 게스트: 로컬 대화 생성 (타임스탬프 기반 고유 ID)
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
          await cacheConversation(newConv).catch(err => console.error('Cache conversation failed:', err));
        } else {
          // 일반 사용자: 서버에 저장
          const newConv = await withRetry(() =>
            createConversation(user.id, title, currentGPT?.id, systemPrompt, instructions)
          );
          conversationId = newConv.id;
          addConversation(newConv);
          setCurrentConversation(conversationId);
          await cacheConversation(newConv).catch(err => console.error('Cache conversation failed:', err));
        }
      }

      // 사용자 메시지 생성 (먼저 객체 생성)
      userMessageObj = {
        id: isGuest ? `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : `temp-${Date.now()}`,
        conversation_id: conversationId!,
        role: 'user' as const,
        content,
        created_at: new Date().toISOString(),
      };

      // 스트리밍 시작 (메시지 저장 전에 시작)
      setIsStreaming(true);
      setStreamingMessage('');
      addMessage(userMessageObj); // UI에 먼저 표시

      const chatMessages = [...messages, userMessageObj];
      
      // 스트리밍 호출 (에러가 나면 바로 catch로 감)
      const stream = await streamChat(chatMessages, systemPrompt, instructions, currentGPTFiles);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      // 스트리밍 성공 후 사용자 메시지 저장
      if (isGuest) {
        await cacheMessage(userMessageObj).catch(err => console.error('Cache message failed:', err));
        savedUserMessage = true;
      } else {
        const savedMsg = await withRetry(() => saveMessage(conversationId!, 'user', content));
        userMessageObj.id = savedMsg.id; // 실제 ID로 업데이트
        await cacheMessage(savedMsg).catch(err => console.error('Cache message failed:', err));
        savedUserMessage = true;
      }

      let fullResponse = '';
      let buffer = '';

      // 스트림 읽기 (단순화된 로직)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 마지막 불완전한 줄은 버퍼에 유지

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
            // 파싱 실패 무시
          }
        }
      }

      // 응답 저장
      if (!fullResponse.trim()) {
        throw new Error('AI 응답이 비어있습니다');
      }

      const assistantMessage = {
        id: isGuest ? `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : `temp-${Date.now()}`,
        conversation_id: conversationId!,
        role: 'assistant' as const,
        content: fullResponse,
        created_at: new Date().toISOString(),
      };

      if (isGuest) {
        addMessage(assistantMessage);
        await cacheMessage(assistantMessage).catch(err => console.error('Cache message failed:', err));
      } else {
        const savedMsg = await withRetry(() => saveMessage(conversationId!, 'assistant', fullResponse));
        assistantMessage.id = savedMsg.id;
        addMessage(assistantMessage);
        await cacheMessage(savedMsg).catch(err => console.error('Cache message failed:', err));
      }

      // 첫 메시지인 경우 제목 업데이트
      if (messages.length === 0) {
        const title = content.slice(0, 50);
        const updatedConv = { title, updated_at: new Date().toISOString() };
        if (!isGuest) {
          await withRetry(() => updateConversationTitle(conversationId!, title)).catch(err => 
            console.error('Update title failed:', err)
          );
        }
        updateConversation(conversationId!, updatedConv);
        const conv = conversations.find(c => c.id === conversationId!);
        if (conv) {
          await cacheConversation({ ...conv, ...updatedConv }).catch(err => 
            console.error('Cache updated conversation failed:', err)
          );
        }
      }

      // 성공 완료
      setStreamingMessage('');
      setIsStreaming(false);
    } catch (error: any) {
      console.error('Failed to send message:', error);
      
      // 에러 시 상태 정리
      setIsStreaming(false);
      setStreamingMessage('');
      
      // 사용자 메시지가 저장되지 않았다면 UI에서도 제거
      if (!savedUserMessage && userMessageObj) {
        setMessages(messages.filter(m => m.id !== userMessageObj.id));
      }
      
      const errorMessage = error?.message || '메시지 전송에 실패했습니다';
      toast.error(errorMessage);
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
