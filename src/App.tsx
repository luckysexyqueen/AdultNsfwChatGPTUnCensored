import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/pages/AuthPage';
import { ChatPage } from '@/pages/ChatPage';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { useChatStore } from '@/stores/chatStore';
import { Toaster } from 'sonner';
import { initDB } from '@/lib/offline';

function App() {
  const { user, loading } = useAuth();
  const { setCurrentConversation, setMessages } = useChatStore();

  // 데스크탑: 기본 열림 / 모바일: 기본 닫힘
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);

  // IndexedDB 초기화
  useEffect(() => {
    initDB().catch(err => {
      console.error('Failed to initialize IndexedDB:', err);
    });
  }, []);

  // 창 크기 변경 시 데스크탑이면 자동으로 열기
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleNewChat = useCallback(() => {
    setCurrentConversation(null);
    setMessages([]);
    // 모바일에서는 새 채팅 후 사이드바 닫기
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, [setCurrentConversation, setMessages]);

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
        <Toaster position="top-center" />
      </Router>
    );
  }

  return (
    <Router>
      <div className="flex h-screen overflow-hidden dark">
        {/* ── 사이드바 ── */}
        {/* 모바일 오버레이 배경 */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 사이드바 패널 */}
        <div
          className={[
            'fixed lg:relative inset-y-0 left-0 z-30',
            'transition-transform duration-300 ease-in-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:translate-x-0',
            sidebarOpen ? 'lg:flex' : 'lg:hidden',
          ].join(' ')}
        >
          <Sidebar
            onNewChat={handleNewChat}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        {/* ── 메인 콘텐츠 ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      <Toaster position="top-center" />
    </Router>
  );
}

export default App;
