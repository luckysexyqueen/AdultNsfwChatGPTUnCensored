import { supabase } from './supabase';
import { Message, CustomGPT, CustomGPTFile } from '@/types';
import { withRetry } from './auto-repair';

export async function createConversation(
  userId: string,
  title: string = 'New Chat',
  customGptId?: string,
  systemPrompt?: string,
  instructions?: string
) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title,
      custom_gpt_id: customGptId || null,
      system_prompt: systemPrompt || '',
      instructions: instructions || '',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateConversationTitle(conversationId: string, title: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) throw error;
}

export async function deleteConversation(conversationId: string) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) throw error;
}

export async function streamChat(
  messages: Message[],
  systemPrompt?: string,
  instructions?: string,
  gptFiles?: CustomGPTFile[]
): Promise<ReadableStream> {
  // 자동 재시도가 적용된 fetch 함수
  const fetchWithRetry = async () => {
    // 온라인 상태 확인
    if (!navigator.onLine) {
      throw new Error('오프라인 상태입니다. 인터넷에 연결한 후 다시 시도해주세요.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || 'guest-token';

    return await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-stream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          systemPrompt,
          instructions,
          gptFiles: gptFiles || [],
        }),
      }
    );
  };

  try {
    // 자동 재시도 적용 (최대 3번, 1초 간격)
    const response = await withRetry(fetchWithRetry, 3, 1000);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `메시지 전송 실패 (${response.status})`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('응답 스트림이 없습니다');
    }

    return response.body;
  } catch (error) {
    console.error('streamChat error:', error);
    throw error;
  }
}

// ========== 커스텀 GPT 관리 ==========

export async function createCustomGPT(
  userId: string,
  name: string,
  description: string,
  systemPrompt: string,
  instructions: string,
  avatarUrl?: string,
  isPublic: boolean = false
): Promise<CustomGPT> {
  const { data, error } = await supabase
    .from('custom_gpts')
    .insert({
      user_id: userId,
      name,
      description,
      system_prompt: systemPrompt,
      instructions,
      avatar_url: avatarUrl,
      is_public: isPublic,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCustomGPT(
  gptId: string,
  updates: Partial<Omit<CustomGPT, 'id' | 'user_id' | 'created_at'>>
): Promise<CustomGPT> {
  const { data, error } = await supabase
    .from('custom_gpts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', gptId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCustomGPT(gptId: string): Promise<void> {
  const { error } = await supabase.from('custom_gpts').delete().eq('id', gptId);

  if (error) throw error;
}

export async function fetchCustomGPTs(userId: string): Promise<CustomGPT[]> {
  const { data, error } = await supabase
    .from('custom_gpts')
    .select('*')
    .or(`user_id.eq.${userId},is_public.eq.true`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchCustomGPT(gptId: string): Promise<CustomGPT | null> {
  const { data, error } = await supabase
    .from('custom_gpts')
    .select('*')
    .eq('id', gptId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

// ========== 커스텀 GPT 파일 관리 ==========

export async function saveGPTFile(
  gptId: string,
  fileName: string,
  fileUrl: string,
  filePath: string,
  fileSize: number,
  mimeType?: string,
  fileContent?: string
): Promise<CustomGPTFile> {
  const { data, error } = await supabase
    .from('custom_gpt_files')
    .insert({
      custom_gpt_id: gptId,
      file_name: fileName,
      file_url: fileUrl,
      file_path: filePath,
      file_size: fileSize,
      mime_type: mimeType,
      file_content: fileContent,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchGPTFiles(gptId: string): Promise<CustomGPTFile[]> {
  const { data, error } = await supabase
    .from('custom_gpt_files')
    .select('*')
    .eq('custom_gpt_id', gptId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function deleteGPTFile(fileId: string): Promise<void> {
  const { error } = await supabase
    .from('custom_gpt_files')
    .delete()
    .eq('id', fileId);

  if (error) throw error;
}

export async function readTextFile(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('chat-files')
    .download(filePath);

  if (error) throw error;
  return await data.text();
}
