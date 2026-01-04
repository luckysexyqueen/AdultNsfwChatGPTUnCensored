import { LogOut, User, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAutoRepair } from '@/hooks/useAutoRepair';
import { messageQueue } from '@/lib/offline-queue';

export function Header() {
  const { user, logout } = useAuth();
  const { runEmergencyRepair } = useAutoRepair();

  const handleEmergencyRepair = async () => {
    if (confirm('긴급 수리를 실행하시겠습니까? 모든 캐시가 삭제되고 페이지가 새로고침됩니다.')) {
      await runEmergencyRepair();
    }
  };

  const handleProcessQueue = async () => {
    await messageQueue.processQueue();
  };

  if (!user) return null;

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">AI Chat</h1>
          {user?.isGuest && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
              게스트 모드
            </span>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.avatar} alt={user.username} />
                <AvatarFallback>
                  {user.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user.username}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleProcessQueue}>
              대기 중인 메시지 전송
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleEmergencyRepair}>
              <Wrench className="mr-2 h-4 w-4 text-yellow-400" />
              긴급 수리
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
