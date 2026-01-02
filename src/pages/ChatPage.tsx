import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { useCustomGPTs } from '@/hooks/useCustomGPTs';
import { useMessages } from '@/hooks/useMessages';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { createConversation, saveMessage, updateConversationTitle, streamChat } from '@/lib/chat';
import { toast } from 'sonner';

export function ChatPage() {
  const { user } = useAuth();
  const {
    currentConversationId,
    messages,
    streamingMessage,
    isStreaming,
    currentGPT,
    conversations,
    setCurrentConversation,
    addMessage,
    setStreamingMessage,
    setIsStreaming,
    addConversation,
    updateConversation,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useConversations(user?.id);
  useCustomGPTs(user?.id);
  useMessages(currentConversationId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSend = async (content: string) => {
    if (!user) return;

    try {
      let conversationId = currentConversationId;
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

      if (!conversationId) {
        const title = content.slice(0, 50);
        const newConv = await createConversation(
          user.id,
          title,
          currentGPT?.id,
          systemPrompt,
          instructions
        );
        conversationId = newConv.id;
        addConversation(newConv);
        setCurrentConversation(conversationId);
      }

      const userMessage = await saveMessage(conversationId, 'user', content);
      addMessage(userMessage);

      setIsStreaming(true);
      setStreamingMessage('');

      const chatMessages = [...messages, userMessage];
      const stream = await streamChat(chatMessages, systemPrompt, instructions);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // 마지막 라인은 불완전할 수 있으므로 버퍼에 유지
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                setStreamingMessage(fullResponse);
              }
            } catch (e) {
              // JSON 파싱 실패는 무시 (불완전한 청크)
            }
          }
        }
      }

      if (fullResponse) {
        const assistantMessage = await saveMessage(conversationId, 'assistant', fullResponse);
        addMessage(assistantMessage);

        if (messages.length === 0) {
          const title = content.slice(0, 50);
          await updateConversationTitle(conversationId, title);
          updateConversation(conversationId, { title });
        }
      }

      setStreamingMessage('');
      setIsStreaming(false);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('메시지 전송에 실패했습니다');
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
