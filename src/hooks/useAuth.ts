import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
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

  useEffect(() => {
    let mounted = true;

    // 게스트 사용자 확인
    const guestUser = localStorage.getItem('guest-user');
    if (guestUser) {
      try {
        const parsed = JSON.parse(guestUser);
        if (mounted) {
          login(parsed);
          setLoading(false);
        }
        return;
      } catch (e) {
        console.error('Failed to parse guest user:', e);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session?.user) login(mapSupabaseUser(session.user));
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        
        if (event === 'SIGNED_IN' && session?.user) {
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
    if (currentUser?.isGuest) {
      logout();
    } else {
      await supabase.auth.signOut();
      logout();
    }
  };

  return { user, loading, logout: handleLogout, loginAsGuest };
}
