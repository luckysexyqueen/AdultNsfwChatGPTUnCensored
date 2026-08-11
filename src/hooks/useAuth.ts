import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { User } from '@supabase/supabase-js';
import { AuthUser } from '@/types';

function mapSupabaseUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
    username: user.user_metadata?.username || user.user_metadata?.full_name || user.email!.split('@')[0],
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
  };
}

export function useAuth() {
  const { user, loading, login, loginAsGuest, logout, setLoading } = useAuthStore();
  const { reset: resetChat } = useChatStore();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      // 실제 Supabase 세션 우선 확인
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // 유효한 Supabase 세션이 있으면 게스트 데이터 제거 후 실제 사용자로 로그인
        if (mounted) {
          localStorage.removeItem('guest-user');
          login(mapSupabaseUser(session.user));
          setLoading(false);
        }
        return;
      }
      
      // 게스트 사용자 확인
      const guestUserStr = localStorage.getItem('guest-user');
      if (guestUserStr) {
        try {
          const parsed = JSON.parse(guestUserStr);
          if (mounted) {
            login(parsed);
            setLoading(false);
          }
          return;
        } catch (e) {
          console.error('Failed to parse guest user:', e);
          localStorage.removeItem('guest-user');
        }
      }
      
      if (mounted) setLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        
        if (event === 'SIGNED_IN' && session?.user) {
          // 실제 로그인 시 게스트 데이터 제거
          localStorage.removeItem('guest-user');
          login(mapSupabaseUser(session.user));
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          logout();
          setLoading(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          login(mapSupabaseUser(session.user));
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [login, logout, setLoading]);

  const handleLogout = async () => {
    const currentUser = user;
    try {
      // 채팅 상태 초기화
      resetChat();
      
      if (currentUser?.isGuest) {
        logout();
      } else {
        await supabase.auth.signOut();
        logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
      // 에러가 나도 로그아웃 처리
      logout();
    }
  };

  return { user, loading, logout: handleLogout, loginAsGuest };
}
