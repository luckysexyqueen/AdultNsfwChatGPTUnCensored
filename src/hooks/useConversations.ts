import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/stores/chatStore';
import { Conversation } from '@/types';

export function useConversations(userId: string | undefined) {
  const { setConversations } = useChatStore();

  useEffect(() => {
    if (!userId) return;

    const fetchConversations = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error);
        return;
      }

      setConversations(data as Conversation[]);
    };

    fetchConversations();
  }, [userId, setConversations]);
}
