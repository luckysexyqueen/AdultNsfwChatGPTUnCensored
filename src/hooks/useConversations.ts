import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/stores/chatStore';
import { Conversation } from '@/types';
import { cacheConversation, getCachedConversations } from '@/lib/offline';

export function useConversations(userId: string | undefined) {
  const { setConversations } = useChatStore();

  useEffect(() => {
    if (!userId) return;

    const loadConversations = async () => {
      try {
        // 먼저 캐시된 데이터 로드
        const cached = await getCachedConversations(userId);
        if (cached.length > 0) {
          setConversations(cached);
        }

        // 온라인이면 서버에서 최신 데이터 가져오기
        if (navigator.onLine) {
          // 대화 목록 가져오기
          const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

          if (convError) {
            console.error('Error fetching conversations:', convError);
            return;
          }

          if (!conversations || conversations.length === 0) {
            setConversations([]);
            return;
          }

          // 각 대화의 메시지 가져오기
          const conversationsWithMessages = await Promise.all(
            conversations.map(async (conv) => {
              const { data: messages, error: msgError } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: true });

              if (msgError) {
                console.error('Error fetching messages for conversation:', conv.id, msgError);
                return { ...conv, messages: [] };
              }

              return { ...conv, messages: messages || [] };
            })
          );

          setConversations(conversationsWithMessages as Conversation[]);

          // 캐시 업데이트
          for (const conv of conversationsWithMessages) {
            await cacheConversation(conv);
          }
        }
      } catch (error) {
        console.error('Failed to load conversations:', error);
      }
    };

    loadConversations();
  }, [userId, setConversations]);
}
