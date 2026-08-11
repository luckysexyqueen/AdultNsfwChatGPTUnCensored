import { useState, useEffect, useRef } from 'react';
import { Message } from '@/types';
import { Bot, User, FileText, Image as ImageIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getMessageFiles, createFileObjectUrl, StoredFileMetadata } from '@/lib/fileStorage';

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
  const revokeListRef = useRef<string[]>([]);

  // localforage에서 첨부 파일 로드
  useEffect(() => {
    if (!message.localFileIds || message.localFileIds.length === 0) return;

    let mounted = true;

    (async () => {
      try {
        const files = await getMessageFiles(message.id);
        if (!mounted) return;
        setAttachedFiles(files);

        // 이미지 Object URL 생성
        const urls: Record<string, string> = {};
        for (const file of files) {
          if (file.type === 'image') {
            const url = await createFileObjectUrl(file.id);
            if (url) {
              urls[file.id] = url;
              revokeListRef.current.push(url);
            }
          }
        }
        if (mounted) setImageUrls(urls);
      } catch (err) {
        console.error('[ChatMessage] 파일 로드 실패:', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [message.id, message.localFileIds?.join(',')]);

  // 언마운트 시 Object URL 해제
  useEffect(() => {
    return () => {
      revokeListRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // 메시지 내용이 파일 표시 placeholder인지 확인
  const isFilePlaceholder =
    isUser &&
    attachedFiles.length > 0 &&
    (message.content.startsWith('📷') || message.content.startsWith('📎'));

  const imageFiles = attachedFiles.filter((f) => f.type === 'image');
  const nonImageFiles = attachedFiles.filter((f) => f.type !== 'image');

  return (
    <div className={`py-6 px-4 ${!isUser ? 'bg-muted/30' : ''}`}>
      <div className="max-w-3xl mx-auto flex gap-4">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback
            className={isUser ? 'bg-primary text-primary-foreground' : 'bg-accent'}
          >
            {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-2 overflow-hidden">
          {/* ── 이미지 첨부 표시 ── */}
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
                  /* 로딩 중 스켈레톤 */
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

          {/* ── 기타 파일 첨부 표시 ── */}
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

          {/* ── 텍스트 내용 ── */}
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

          {/* 파일만 전송된 경우 스트리밍 커서 */}
          {isFilePlaceholder && isStreaming && (
            <span className="inline-block w-2 h-4 bg-foreground ml-1 animate-pulse rounded-sm" />
          )}
        </div>
      </div>
    </div>
  );
}
