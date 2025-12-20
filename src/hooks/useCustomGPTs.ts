import { useEffect } from 'react';
import { fetchCustomGPTs } from '@/lib/chat';
import { useChatStore } from '@/stores/chatStore';

export function useCustomGPTs(userId: string | undefined) {
  const { setCustomGPTs } = useChatStore();

  useEffect(() => {
    if (!userId) return;

    const loadCustomGPTs = async () => {
      try {
        const gpts = await fetchCustomGPTs(userId);
        setCustomGPTs(gpts);
      } catch (error) {
        console.error('커스텀 GPT 로딩 실패:', error);
      }
    };

    loadCustomGPTs();
  }, [userId, setCustomGPTs]);
}
