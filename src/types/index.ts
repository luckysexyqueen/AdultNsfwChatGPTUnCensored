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
  /** localforage에 저장된 첨부 파일 ID 목록 (DB에는 저장 안됨, 클라이언트 전용) */
  localFileIds?: string[];
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
  isGuest?: boolean;
}

export interface ChatFileAttachment {
  name: string;
  mimeType: string;
  type: 'image' | 'text' | 'other';
  url?: string;         // 스토리지 signed URL
  base64?: string;      // 게스트 모드용 base64 data URL
  textContent?: string; // 텍스트 파일 내용
  localId?: string;     // localforage에 저장된 파일 ID
}
