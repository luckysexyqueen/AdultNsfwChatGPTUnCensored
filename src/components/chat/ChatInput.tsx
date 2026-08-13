import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, FileText, Image } from 'lucide-react';
import { toast } from 'sonner';

interface LocalFile {
  id: string;
  file: File;
  previewUrl?: string;
}

interface ChatInputProps {
  /** 성공적으로 전송을 시작했을 때 true를 반환합니다. */
  onSend: (content: string, files: File[]) => Promise<boolean>;
  disabled?: boolean;
}

const MAX_FILE_COUNT = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 20 * 1024 * 1024;

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const isImageFile = (file: File) => file.type.startsWith('image/');

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<LocalFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachedRef = useRef<LocalFile[]>([]);

  useEffect(() => {
    attachedRef.current = attached;
  }, [attached]);

  useEffect(() => {
    return () => {
      attachedRef.current.forEach((file) => {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      });
    };
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (selected.length === 0) return;

    const availableSlots = MAX_FILE_COUNT - attached.length;
    if (availableSlots <= 0) {
      toast.error(`파일은 최대 ${MAX_FILE_COUNT}개까지 첨부할 수 있습니다.`);
      return;
    }

    const accepted: File[] = [];
    let totalSize = attached.reduce((sum, item) => sum + item.file.size, 0);

    for (const file of selected.slice(0, availableSlots)) {
      if (file.size === 0) {
        toast.error(`빈 파일은 첨부할 수 없습니다: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`파일 크기는 ${formatSize(MAX_FILE_SIZE)} 이하여야 합니다: ${file.name}`);
        continue;
      }
      if (totalSize + file.size > MAX_TOTAL_FILE_SIZE) {
        toast.error(`전체 첨부 크기는 ${formatSize(MAX_TOTAL_FILE_SIZE)} 이하여야 합니다.`);
        break;
      }
      accepted.push(file);
      totalSize += file.size;
    }

    if (selected.length > availableSlots) {
      toast.info(`최대 ${MAX_FILE_COUNT}개까지만 첨부했습니다.`);
    }
    if (accepted.length === 0) return;

    const newFiles: LocalFile[] = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined,
    }));
    setAttached((previous) => [...previous, ...newFiles]);
  };

  const handleRemove = (id: string) => {
    setAttached((previous) => {
      const found = previous.find((file) => file.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return previous.filter((file) => file.id !== id);
    });
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if ((!trimmed && attached.length === 0) || disabled || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const sent = await onSend(trimmed, attached.map((file) => file.file));
      if (!sent) return;

      attached.forEach((file) => {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      });
      setInput('');
      setAttached([]);
      textareaRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleTextareaInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    const element = event.target;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  };

  const canSend = !disabled && !isSubmitting && (input.trim().length > 0 || attached.length > 0);
  const imageCount = attached.filter((file) => isImageFile(file.file)).length;
  const fileCount = attached.length - imageCount;

  return (
    <div className="border-t border-white/10 bg-[#212121]">
      <div className="max-w-3xl mx-auto px-4 py-3">
        {attached.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attached.map((file) => (
              <div key={file.id} className="relative group">
                {file.previewUrl ? (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/20 bg-[#343541]">
                    <img src={file.previewUrl} alt={file.file.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemove(file.id)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`${file.file.name} 첨부 취소`}
                    >
                      <X size={11} className="text-white" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-0.5 pt-2">
                      <p className="text-white text-[10px] truncate leading-tight">{file.file.name}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-[#343541] border border-white/10 rounded-lg px-3 py-2 max-w-[200px]">
                    <div className="w-7 h-7 bg-blue-500/20 rounded flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-xs font-medium truncate">{file.file.name}</p>
                      <p className="text-white/40 text-[10px]">{formatSize(file.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(file.id)}
                      className="flex-shrink-0 text-white/30 hover:text-red-400 transition-colors ml-1"
                      aria-label={`${file.file.name} 첨부 취소`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 bg-[#2f2f2f] rounded-2xl border border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSubmitting}
            className="flex-shrink-0 text-white/40 hover:text-white/70 transition-colors mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="파일 및 이미지 첨부"
            aria-label="파일 및 이미지 첨부"
          >
            <Paperclip size={20} />
          </button>

          <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={attached.length > 0 ? '파일에 대해 질문하거나 Enter로 전송...' : '메시지를 입력하세요...'}
            rows={1}
            style={{ height: 'auto', minHeight: '40px' }}
            className="flex-1 resize-none border-none outline-none bg-transparent text-white text-sm placeholder:text-white/30 leading-6 max-h-[200px] overflow-y-auto"
            disabled={disabled || isSubmitting}
          />

          {attached.length > 0 && (
            <div className="flex-shrink-0 mb-0.5 flex items-center gap-1 text-white/40 text-xs">
              {imageCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Image size={12} />
                  {imageCount}
                </span>
              )}
              {fileCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <FileText size={12} />
                  {fileCount}
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSend}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#10a37f] text-white flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed hover:bg-[#0d8968] transition-colors mb-0.5"
            title="전송 (Enter)"
            aria-label="메시지 전송"
          >
            <Send size={15} />
          </button>
        </div>

        <p className="text-[11px] text-white/25 text-center mt-2">
          이미지·PDF·텍스트 등 파일 첨부 지원 · 파일당 최대 10MB, 전체 최대 20MB
        </p>
      </div>
    </div>
  );
}
