import { Plus, MessageSquare, Trash2, MoreHorizontal } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '@/components/ui/button';
import { deleteConversation } from '@/lib/chat';
import { deleteConversationFromCache } from '@/lib/offline';
import { GPTList } from '@/components/layout/GPTList';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarProps {
  onNewChat: () => void;
  onClose?: () => void;
}

export function Sidebar({ onNewChat, onClose }: SidebarProps) {
  const { user } = useAuth();
  const { conversations, currentConversationId, setCurrentConversation, deleteConversation: removeConversation, setCurrentGPT } = useChatStore();

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      if (user?.isGuest) {
        // 게스트 모드: IndexedDB에서만 삭제
        await deleteConversationFromCache(id);
      } else {
        await deleteConversation(id);
      }
      removeConversation(id);
      if (currentConversationId === id) {
        setCurrentConversation(null);
      }
      toast.success('대화가 삭제되었습니다');
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('대화 삭제에 실패했습니다');
    }
  };

  const handleNewChat = () => {
    setCurrentGPT(null);
    onNewChat();
  };

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col h-screen flex-shrink-0">
      <div className="p-3">
        <Button
          onClick={handleNewChat}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          새 채팅
        </Button>
      </div>

      {/* 커스텀 GPT 목록 */}
      {user && (
        <div className="border-b border-border">
          <GPTList userId={user.id} />
        </div>
      )}

      {/* 대화 목록 */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 pt-4">
        <div className="text-xs text-muted-foreground px-3 mb-2">최근 대화</div>
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group sidebar-item cursor-pointer flex items-center justify-between ${
              currentConversationId === conv.id ? 'sidebar-item-active' : ''
            }`}
            onClick={() => setCurrentConversation(conv.id)}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{conv.title}</span>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  );
}
