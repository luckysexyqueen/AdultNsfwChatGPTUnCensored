import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/pages/AuthPage';
import { ChatPage } from '@/pages/ChatPage';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { useChatStore } from '@/stores/chatStore';
import { Toaster } from 'sonner';

function App() {
  const { user, loading } = useAuth();
  const { setCurrentConversation, setMessages } = useChatStore();

  const handleNewChat = () => {
    setCurrentConversation(null);
    setMessages([]);
  };

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
        <Sidebar onNewChat={handleNewChat} />
        <div className="flex-1 flex flex-col">
          <Header />
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
