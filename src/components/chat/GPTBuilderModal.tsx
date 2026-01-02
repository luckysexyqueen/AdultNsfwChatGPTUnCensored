import { useState, useRef, useEffect } from 'react';
import { X, Upload, FileIcon, Trash2 } from 'lucide-react';
import { createCustomGPT, updateCustomGPT, saveGPTFile, fetchGPTFiles, deleteGPTFile, readTextFile } from '@/lib/chat';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/stores/chatStore';
import { CustomGPT, CustomGPTFile } from '@/types';
import { toast } from 'sonner';

interface GPTBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  editingGPT?: CustomGPT | null;
}

export function GPTBuilderModal({ isOpen, onClose, userId, editingGPT }: GPTBuilderModalProps) {
  const { addCustomGPT, updateCustomGPT: updateGPTInStore } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<CustomGPTFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: editingGPT?.name || '',
    description: editingGPT?.description || '',
    systemPrompt: editingGPT?.system_prompt || '',
    instructions: editingGPT?.instructions || '',
    avatarUrl: editingGPT?.avatar_url || '',
    isPublic: editingGPT?.is_public || false,
  });

  useEffect(() => {
    if (isOpen && editingGPT) {
      loadExistingFiles();
    } else {
      setUploadedFiles([]);
    }
  }, [isOpen, editingGPT]);

  const loadExistingFiles = async () => {
    if (!editingGPT) return;
    try {
      const files = await fetchGPTFiles(editingGPT.id);
      setUploadedFiles(files);
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const uploaded: CustomGPTFile[] = [];
      for (const file of Array.from(files)) {
        const filePath = `${userId}/${Date.now()}_${file.name}`;
        const { data, error } = await supabase.storage
          .from('chat-files')
          .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-files')
          .getPublicUrl(data.path);

        // txt 파일인 경우 내용 읽기
        let fileContent: string | undefined;
        if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          fileContent = await file.text();
        }

        // 임시 객체 (GPT 생성 후 DB에 저장)
        uploaded.push({
          id: crypto.randomUUID(), // 임시 ID
          custom_gpt_id: '', // 나중에 설정
          file_name: file.name,
          file_url: publicUrl,
          file_path: data.path,
          file_size: file.size,
          mime_type: file.type,
          file_content: fileContent,
          created_at: new Date().toISOString(),
        });
      }
      setUploadedFiles([...uploadedFiles, ...uploaded]);
      toast.success(`${uploaded.length}개 파일 업로드 완료`);
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      toast.error('파일 업로드에 실패했습니다');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async (index: number) => {
    const file = uploadedFiles[index];
    
    // DB에 저장된 파일인 경우 삭제
    if (file.custom_gpt_id && editingGPT) {
      try {
        await deleteGPTFile(file.id);
        await supabase.storage.from('chat-files').remove([file.file_path]);
      } catch (error) {
        console.error('파일 삭제 실패:', error);
        toast.error('파일 삭제에 실패했습니다');
        return;
      }
    }
    
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let gptId: string;
      
      if (editingGPT) {
        // 수정 모드
        const updated = await updateCustomGPT(editingGPT.id, {
          name: formData.name,
          description: formData.description,
          system_prompt: formData.systemPrompt,
          instructions: formData.instructions,
          avatar_url: formData.avatarUrl || undefined,
          is_public: formData.isPublic,
        });
        updateGPTInStore(editingGPT.id, updated);
        gptId = editingGPT.id;
        
        // 새로 업로드된 파일들 저장 (custom_gpt_id가 없는 파일들)
        for (const file of uploadedFiles) {
          if (!file.custom_gpt_id) {
            await saveGPTFile(
              gptId,
              file.file_name,
              file.file_url,
              file.file_path,
              file.file_size,
              file.mime_type,
              file.file_content
            );
          }
        }
        
        toast.success('커스텀 GPT가 수정되었습니다!');
      } else {
        // 생성 모드
        const newGPT = await createCustomGPT(
          userId,
          formData.name,
          formData.description,
          formData.systemPrompt,
          formData.instructions,
          formData.avatarUrl || undefined,
          formData.isPublic
        );
        addCustomGPT(newGPT);
        gptId = newGPT.id;
        
        // 업로드된 파일들 DB에 저장
        for (const file of uploadedFiles) {
          await saveGPTFile(
            gptId,
            file.file_name,
            file.file_url,
            file.file_path,
            file.file_size,
            file.mime_type,
            file.file_content
          );
        }
        
        toast.success('커스텀 GPT가 생성되었습니다!');
      }
      
      onClose();
    } catch (error) {
      console.error('GPT 저장 실패:', error);
      toast.error('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2f2f2f] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-[#2f2f2f] border-b border-white/10 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">
            {editingGPT ? '커스텀 GPT 수정' : '새 커스텀 GPT 만들기'}
          </h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[#40414f] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#10a37f]"
              placeholder="예: 코딩 전문가"
              required
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">설명</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[#40414f] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#10a37f]"
              placeholder="이 GPT가 무엇을 하는지 간단히 설명하세요"
            />
          </div>

          {/* 시스템 프롬프트 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              시스템 프롬프트 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              className="w-full bg-[#40414f] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#10a37f] min-h-[120px] resize-y"
              placeholder="AI의 역할과 성격을 정의하세요&#10;예: 당신은 친절하고 전문적인 프로그래밍 도우미입니다."
              required
            />
          </div>

          {/* 지침 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              지침 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              className="w-full bg-[#40414f] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#10a37f] min-h-[120px] resize-y"
              placeholder="구체적인 행동 지침을 작성하세요&#10;예: 항상 코드 예제를 포함하고, 단계별로 설명하세요."
              required
            />
          </div>

          {/* 아바타 URL */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">아바타 URL (선택)</label>
            <input
              type="url"
              value={formData.avatarUrl}
              onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
              className="w-full bg-[#40414f] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#10a37f]"
              placeholder="https://example.com/avatar.png"
            />
          </div>

          {/* 파일 업로드 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              파일 첨부 (선택)
              {uploadedFiles.length > 0 && (
                <span className="ml-2 px-2 py-1 bg-green-500 text-white text-xs rounded">
                  {uploadedFiles.length}
                </span>
              )}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-[#40414f] text-white rounded-lg px-4 py-8 border-2 border-dashed border-white/20 hover:border-white/40 transition-colors flex flex-col items-center gap-2"
              disabled={loading}
            >
              <Upload className="w-6 h-6 text-white/60" />
              <span className="text-white/80">파일을 클릭하여 업로드</span>
              <span className="text-white/50 text-xs">모든 파일 형식 지원</span>
            </button>
            
            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 bg-[#40414f] p-3 rounded-lg"
                  >
                    <FileIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{file.file_name}</p>
                      <p className="text-white/50 text-xs">{formatFileSize(file.file_size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 공개 여부 */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="w-5 h-5 rounded bg-[#40414f] border-white/20 text-[#10a37f] focus:ring-[#10a37f]"
            />
            <label htmlFor="isPublic" className="text-white text-sm">
              이 GPT를 다른 사용자와 공유
            </label>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-[#40414f] text-white rounded-lg hover:bg-[#4f5058] transition-colors"
              disabled={loading}
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-[#10a37f] text-white rounded-lg hover:bg-[#0d8968] transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? '저장 중...' : editingGPT ? '수정' : '생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
