import { useState } from 'react';
import { Bot, Edit2, Trash2, MessageSquarePlus } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { deleteCustomGPT, createConversation } from '@/lib/chat';
import { GPTBuilderModal } from '@/components/chat/GPTBuilderModal';
import { CustomGPT } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { cacheConversation } from '@/lib/offline';
import { toast } from 'sonner';

interface GPTListProps {
  userId: string;
}

export function GPTList({ userId }: GPTListProps) {
  const {
    customGPTs,
    deleteCustomGPT: deleteGPTFromStore,
    setCurrentGPT,
    setCurrentConversation,
    addConversation,
  } = useChatStore();
  const { user } = useAuth();

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingGPT, setEditingGPT] = useState<CustomGPT | null>(null);

  const handleDelete = async (gptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 커스텀 GPT를 삭제하시겠습니까?')) return;

    try {
      await deleteCustomGPT(gptId);
      deleteGPTFromStore(gptId);
      toast.success('커스텀 GPT가 삭제되었습니다');
    } catch (error) {
      console.error('GPT 삭제 실패:', error);
      toast.error('삭제에 실패했습니다');
    }
  };

  const handleEdit = (gpt: CustomGPT, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGPT(gpt);
    setIsBuilderOpen(true);
  };

  const handleStartChat = async (gpt: CustomGPT) => {
    try {
      setCurrentGPT(gpt);
      
      if (user?.isGuest) {
        // 게스트 모드: 로컈 대화 생성
        const newConv = {
          id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          user_id: userId,
          title: `${gpt.name} 대화`,
          custom_gpt_id: gpt.id,
          system_prompt: gpt.system_prompt,
          instructions: gpt.instructions,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        addConversation(newConv);
        setCurrentConversation(newConv.id);
        await cacheConversation(newConv).catch(console.error);
      } else {
        const newConv = await createConversation(
          userId,
          `${gpt.name} 대화`,
          gpt.id,
          gpt.system_prompt,
          gpt.instructions
        );
        addConversation(newConv);
        setCurrentConversation(newConv.id);
      }
      toast.success(`${gpt.name}과(와) 대화를 시작합니다`);
    } catch (error) {
      console.error('대화 시작 실패:', error);
      toast.error('대화 시작에 실패했습니다');
    }
  };

  const handleCreateNew = () => {
    setEditingGPT(null);
    setIsBuilderOpen(true);
  };

  const handleCloseBuilder = () => {
    setIsBuilderOpen(false);
    setEditingGPT(null);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg flex items-center gap-2">
          <Bot size={20} />
          커스텀 GPT
        </h2>
        <button
          onClick={handleCreateNew}
          className="text-sm px-3 py-1.5 bg-[#10a37f] text-white rounded-lg hover:bg-[#0d8968] transition-colors"
        >
          + 만들기
        </button>
      </div>

      <div className="space-y-2">
        {customGPTs.length === 0 ? (
          <div className="text-white/40 text-sm text-center py-8">
            아직 커스텀 GPT가 없습니다
            <br />
            위 버튼을 눌러 만들어보세요!
          </div>
        ) : (
          customGPTs.map((gpt) => (
            <div
              key={gpt.id}
              className="group bg-[#343541] hover:bg-[#40414f] rounded-lg p-3 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                {/* 아바타 */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  {gpt.avatar_url ? (
                    <img
                      src={gpt.avatar_url}
                      alt={gpt.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <Bot size={20} className="text-white" />
                  )}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-white font-medium truncate">{gpt.name}</h3>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleStartChat(gpt)}
                        className="p-1.5 hover:bg-[#565869] rounded transition-colors"
                        title="대화 시작"
                      >
                        <MessageSquarePlus size={16} className="text-[#10a37f]" />
                      </button>
                      <button
                        onClick={(e) => handleEdit(gpt, e)}
                        className="p-1.5 hover:bg-[#565869] rounded transition-colors"
                        title="수정"
                      >
                        <Edit2 size={16} className="text-white/60" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(gpt.id, e)}
                        className="p-1.5 hover:bg-[#565869] rounded transition-colors"
                        title="삭제"
                      >
                        <Trash2 size={16} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                  {gpt.description && (
                    <p className="text-white/60 text-sm mt-1 line-clamp-2">{gpt.description}</p>
                  )}
                  {gpt.is_public && (
                    <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                      공개
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <GPTBuilderModal
        isOpen={isBuilderOpen}
        onClose={handleCloseBuilder}
        userId={userId}
        editingGPT={editingGPT}
      />
    </div>
  );
}
