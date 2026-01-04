import { create } from 'zustand';
import { AuthUser } from '@/types';

// 로컬 스토리지에서 게스트 사용자 가져오기 또는 생성
function getOrCreateGuestUser(): AuthUser {
  const stored = localStorage.getItem('guest-user');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse guest user:', e);
    }
  }

  // 새 게스트 사용자 생성
  const guestUser: AuthUser = {
    id: `guest-${crypto.randomUUID()}`,
    email: 'guest@local',
    username: '게스트',
    isGuest: true,
  };

  localStorage.setItem('guest-user', JSON.stringify(guestUser));
  return guestUser;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (user: AuthUser) => void;
  loginAsGuest: () => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  login: (user) => set({ user, loading: false }),
  loginAsGuest: () => {
    const guestUser = getOrCreateGuestUser();
    set({ user: guestUser, loading: false });
  },
  logout: () => {
    const currentUser = get().user;
    if (currentUser?.isGuest) {
      // 게스트 로그아웃 시 데이터 유지
      localStorage.removeItem('guest-user');
    }
    set({ user: null });
  },
  setLoading: (loading) => set({ loading }),
}));
