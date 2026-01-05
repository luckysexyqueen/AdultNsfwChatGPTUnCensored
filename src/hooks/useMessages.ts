import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { Message } from '@/types';
import { getCachedMessages } from '@/lib/offline';

export function useMessages(conversationId: string | null) {
  const { setMessages } = useChatStore();
  const { user } = useAuth();

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      // 게스트 모드: IndexedDB에서만 로드
      if (user?.isGuest) {
        const cached = await getCachedMessages(conversationId);
        setMessages(cached);
        return;
      }

      // 일반 사용자: Supabase에서 로드
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      setMessages(data as Message[]);
    };

    fetchMessages();
  }, [conversationId, setMessages, user?.isGuest]);
}
