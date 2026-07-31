import { useState, useRef } from 'react';
import { Send, Paperclip, X, FileText, Image } from 'lucide-react';

interface LocalFile {
  id: string;
  file: File;
  previewUrl?: string;
}

interface ChatInputProps {
  onSend: (content: string, files: File[]) => void;
  disabled?: boolean;
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const isImageFile = (file: File) => file.type.startsWith('image/');

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<LocalFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newFiles: LocalFile[] = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined,
    }));

    setAttached(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = (id: string) => {
    setAttached(prev => {
      const found = prev.find(f => f.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && attached.length === 0) || disabled) return;

    onSend(trimmed, attached.map(f => f.file));

    // Cleanup preview URLs
    attached.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setInput('');
    setAttached([]);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const canSend = !disabled && (input.trim().length > 0 || attached.length > 0);
  const imageCount = attached.filter(f => isImageFile(f.file)).length;
  const fileCount = attached.length - imageCount;

  return (
    <div className="border-t border-white/10 bg-[#212121]">
      <div className="max-w-3xl mx-auto px-4 py-3">

        {/* 첨부 파일 미리보기 */}
        {attached.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attached.map(f => (
              <div key={f.id} className="relative group">
                {f.previewUrl ? (
                  /* 이미지 썸네일 */
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/20 bg-[#343541]">
                    <img
                      src={f.previewUrl}
                      alt={f.file.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemove(f.id)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={11} className="text-white" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-0.5 pt-2">
                      <p className="text-white text-[10px] truncate leading-tight">{f.file.name}</p>
                    </div>
                  </div>
                ) : (
                  /* 파일 칩 */
                  <div className="flex items-center gap-2 bg-[#343541] border border-white/10 rounded-lg px-3 py-2 max-w-[200px]">
                    <div className="w-7 h-7 bg-blue-500/20 rounded flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-xs font-medium truncate">{f.file.name}</p>
                      <p className="text-white/40 text-[10px]">{formatSize(f.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(f.id)}
                      className="flex-shrink-0 text-white/30 hover:text-red-400 transition-colors ml-1"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 입력 컨테이너 */}
        <div className="flex items-end gap-2 bg-[#2f2f2f] rounded-2xl border border-white/10 px-4 py-3">
          {/* 파일 첨부 버튼 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex-shrink-0 text-white/40 hover:text-white/70 transition-colors mb-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="파일 및 이미지 첨부"
          >
            <Paperclip size={20} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 텍스트 입력 */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={attached.length > 0 ? '파일에 대해 질문하거나 Enter로 전송...' : '메시지를 입력하세요...'}
            rows={1}
            style={{ height: 'auto', minHeight: '40px' }}
            className="flex-1 resize-none border-none outline-none bg-transparent text-white text-sm placeholder:text-white/30 leading-6 max-h-[200px] overflow-y-auto"
            disabled={disabled}
          />

          {/* 첨부 파일 수 표시 */}
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

          {/* 전송 버튼 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#10a37f] text-white flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed hover:bg-[#0d8968] transition-colors mb-0.5"
            title="전송 (Enter)"
          >
            <Send size={15} />
          </button>
        </div>

        <p className="text-[11px] text-white/25 text-center mt-2">
          이미지·PDF·텍스트 등 모든 파일 첨부 지원 · Enter로 전송, Shift+Enter로 줄바꿈
        </p>
      </div>
    </div>
  );
}
