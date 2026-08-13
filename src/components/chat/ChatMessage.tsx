import { useState, useEffect } from 'react';
import { Message } from '@/types';
import { Bot, User, FileText, Image as ImageIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { createFileObjectUrl, getFileMeta, StoredFileMetadata } from '@/lib/fileStorage';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [attachedFiles, setAttachedFiles] = useState<StoredFileMetadata[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const localFileIds = message.localFileIds ?? [];
  const fileKey = localFileIds.join(',');

  // 메시지 ID가 서버 ID로 바뀌기 전에도 localFileIds로 바로 파일을 찾습니다.
  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];
    const fileIds = fileKey ? fileKey.split(',') : [];

    const loadAttachments = async () => {
      if (fileIds.length === 0) {
        setAttachedFiles([]);
        setImageUrls({});
        return;
      }

      try {
        const metadata = await Promise.all(fileIds.map((id) => getFileMeta(id)));
        const files = metadata.filter((file): file is StoredFileMetadata => file !== null);
        const urls: Record<string, string> = {};

        for (const file of files) {
          if (file.type !== 'image') continue;
          const url = await createFileObjectUrl(file.id);
          if (url) {
            urls[file.id] = url;
            createdUrls.push(url);
          }
        }

        if (!active) return;
        setAttachedFiles(files);
        setImageUrls(urls);
      } catch (error) {
        if (active) {
          console.error('[ChatMessage] 파일 로드 실패:', error);
          setAttachedFiles([]);
          setImageUrls({});
        }
      }
    };

    void loadAttachments();
    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [fileKey]);

  const isFilePlaceholder =
    isUser &&
    attachedFiles.length > 0 &&
    (message.content.startsWith('📷') || message.content.startsWith('📎'));

  const imageFiles = attachedFiles.filter((file) => file.type === 'image');
  const nonImageFiles = attachedFiles.filter((file) => file.type !== 'image');

  return (
    <div className={`py-6 px-4 ${!isUser ? 'bg-muted/30' : ''}`}>
      <div className="max-w-3xl mx-auto flex gap-4">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className={isUser ? 'bg-primary text-primary-foreground' : 'bg-accent'}>
            {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-2 overflow-hidden">
          {imageFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {imageFiles.map((file) =>
                imageUrls[file.id] ? (
                  <div
                    key={file.id}
                    className="rounded-xl overflow-hidden border border-white/20 bg-black/20 shadow-md"
                  >
                    <img
                      src={imageUrls[file.id]}
                      alt={file.name}
                      title={`${file.name} (${formatSize(file.size)})`}
                      className="max-w-xs max-h-64 object-contain block"
                    />
                  </div>
                ) : (
                  <div
                    key={file.id}
                    className="w-32 h-32 rounded-xl bg-muted/40 animate-pulse flex items-center justify-center"
                  >
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )
              )}
            </div>
          )}

          {nonImageFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {nonImageFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 text-sm border border-white/10 max-w-xs"
                >
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-xs font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-[10px]">{formatSize(file.size)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isFilePlaceholder && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap break-words m-0 text-foreground leading-relaxed">
                {message.content}
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-foreground ml-1 animate-pulse rounded-sm" />
                )}
              </p>
            </div>
          )}

          {isFilePlaceholder && isStreaming && (
            <span className="inline-block w-2 h-4 bg-foreground ml-1 animate-pulse rounded-sm" />
          )}
        </div>
      </div>
    </div>
  );
}
