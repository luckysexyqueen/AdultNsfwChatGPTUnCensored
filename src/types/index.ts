export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  custom_gpt_id?: string;
  system_prompt?: string;
  instructions?: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface CustomGPT {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  system_prompt: string;
  instructions: string;
  avatar_url?: string;
  is_public?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationFile {
  id: string;
  conversation_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type?: string;
  created_at: string;
}

export interface CustomGPTFile {
  id: string;
  custom_gpt_id: string;
  file_name: string;
  file_url: string;
  file_path: string;
  file_size: number;
  mime_type?: string;
  file_content?: string;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}
