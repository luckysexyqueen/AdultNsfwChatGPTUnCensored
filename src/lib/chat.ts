import { supabase } from './supabase';
import { Message, CustomGPT } from '@/types';

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
  instructions?: string
): Promise<ReadableStream> {
  const authToken = (await supabase.auth.getSession()).data.session?.access_token;

  const response = await fetch(
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
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to stream chat: ${response.statusText}`);
  }

  return response.body!;
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
