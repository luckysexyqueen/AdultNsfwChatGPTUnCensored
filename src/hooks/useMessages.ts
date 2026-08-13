import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { Message } from '@/types';
import { getCachedMessages } from '@/lib/offline';
import { getMessageFileIds } from '@/lib/fileStorage';

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/**
 * 서버/캐시 결과를 현재 화면의 낙관적 메시지와 병합합니다.
 * 새 대화를 만든 직후 비동기 로더가 빈 결과로 상태를 덮어쓰는 경합을 막습니다.
 */
function mergeWithCurrentMessages(conversationId: string, loaded: Message[]): Message[] {
  const current = useChatStore
    .getState()
    .messages.filter((message) => message.conversation_id === conversationId);
  const byId = new Map<string, Message>();

  for (const message of loaded) byId.set(message.id, message);
  for (const message of current) {
    const existing = byId.get(message.id);
    byId.set(message.id, existing ? { ...message, ...existing } : message);
  }

  return sortMessages([...byId.values()]);
}

export function useMessages(conversationId: string | null) {
  const { setMessages } = useChatStore();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const applyMessages = (loaded: Message[]) => {
      if (cancelled || useChatStore.getState().currentConversationId !== conversationId) return;
      setMessages(mergeWithCurrentMessages(conversationId!, loaded));
    };

    if (!conversationId) {
      setMessages([]);
      return () => {
        cancelled = true;
      };
    }

    const fetchMessages = async () => {
      try {
        if (user?.isGuest) {
          const cached = await getCachedMessages(conversationId);
          applyMessages(cached);
          return;
        }

        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching messages:', error);
          const cached = await getCachedMessages(conversationId);
          applyMessages(cached);
          return;
        }

        const messagesWithFiles = await Promise.all(
          ((data ?? []) as Message[]).map(async (message) => {
            const fileIds = await getMessageFileIds(message.id);
            return fileIds.length > 0 ? { ...message, localFileIds: fileIds } : message;
          })
        );
        applyMessages(messagesWithFiles);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    void fetchMessages();
    return () => {
      cancelled = true;
    };
  }, [conversationId, setMessages, user?.id, user?.isGuest]);
}
