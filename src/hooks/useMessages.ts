import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/stores/chatStore';
import { useAuth } from '@/hooks/useAuth';
import { Message } from '@/types';
import { getCachedMessages } from '@/lib/offline';
import { getMessageFileIds } from '@/lib/fileStorage';

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
        // 생성 시간순 정렬
        const sorted = cached.sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(sorted);
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
        // 에러 시 캐시에서 로드
        const cached = await getCachedMessages(conversationId);
        if (cached.length > 0) {
          const sorted = cached.sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          setMessages(sorted);
        }
        return;
      }

      // localforage에서 첨부 파일 ID 복원
      const messagesWithFiles = await Promise.all(
        (data as Message[]).map(async (msg) => {
          const fileIds = await getMessageFileIds(msg.id);
          return fileIds.length > 0 ? { ...msg, localFileIds: fileIds } : msg;
        })
      );
      setMessages(messagesWithFiles);
    };

    fetchMessages();
  }, [conversationId, setMessages, user?.isGuest]);
}
