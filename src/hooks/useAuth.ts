import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { User } from '@supabase/supabase-js';
import { AuthUser } from '@/types';

function mapSupabaseUser(user: User): AuthUser {
  const email = user.email ?? '';
  return {
    id: user.id,
    email,
    username:
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      (email ? email.split('@')[0] : user.id.slice(0, 8)),
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
  };
}

function isGuestUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthUser>;
  return (
    candidate.isGuest === true &&
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.username === 'string'
  );
}

export function useAuth() {
  const { user, loading, login, loginAsGuest, logout, setLoading } = useAuthStore();
  const { reset: resetChat } = useChatStore();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          if (mounted) {
            localStorage.removeItem('guest-user');
            login(mapSupabaseUser(session.user));
            setLoading(false);
          }
          return;
        }
      } catch (error) {
        // 인증 서버 장애가 있어도 게스트 모드 진입을 막지 않습니다.
        console.error('Failed to restore Supabase session:', error);
      }

      const guestUserStr = localStorage.getItem('guest-user');
      if (guestUserStr) {
        try {
          const parsed: unknown = JSON.parse(guestUserStr);
          if (isGuestUser(parsed)) {
            if (mounted) {
              login(parsed);
              setLoading(false);
            }
            return;
          }
          localStorage.removeItem('guest-user');
        } catch (error) {
          console.error('Failed to parse guest user:', error);
          localStorage.removeItem('guest-user');
        }
      }

      if (mounted) setLoading(false);
    };

    void initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        localStorage.removeItem('guest-user');
        login(mapSupabaseUser(session.user));
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        resetChat();
        logout();
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        login(mapSupabaseUser(session.user));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [login, logout, resetChat, setLoading]);

  const handleLogout = async () => {
    const currentUser = user;
    resetChat();

    try {
      if (!currentUser?.isGuest) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
    }
  };

  return { user, loading, logout: handleLogout, loginAsGuest };
}
