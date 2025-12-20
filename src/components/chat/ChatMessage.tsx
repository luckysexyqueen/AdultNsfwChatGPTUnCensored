import { Message } from '@/types';
import { Bot, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-message py-6 px-4 ${!isUser ? 'bg-muted/30' : ''}`}>
      <div className="max-w-3xl mx-auto flex gap-4">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className={isUser ? 'bg-primary text-primary-foreground' : 'bg-accent'}>
            {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 space-y-2 overflow-hidden">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap break-words m-0">
              {message.content}
              {isStreaming && <span className="inline-block w-2 h-4 bg-foreground ml-1 animate-pulse" />}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
