import { create } from 'zustand';
import { Conversation, Message, CustomGPT, CustomGPTFile } from '@/types';

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  streamingMessage: string;
  isStreaming: boolean;
  customGPTs: CustomGPT[];
  currentGPT: CustomGPT | null;
  currentGPTFiles: CustomGPTFile[];
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setStreamingMessage: (content: string) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  setCustomGPTs: (gpts: CustomGPT[]) => void;
  addCustomGPT: (gpt: CustomGPT) => void;
  updateCustomGPT: (id: string, updates: Partial<CustomGPT>) => void;
  deleteCustomGPT: (id: string) => void;
  setCurrentGPT: (gpt: CustomGPT | null) => void;
  setCurrentGPTFiles: (files: CustomGPTFile[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  streamingMessage: '',
  isStreaming: false,
  customGPTs: [],
  currentGPT: null,
  currentGPTFiles: [],
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (id) => set({ currentConversationId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setStreamingMessage: (content) => set({ streamingMessage: content }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  addConversation: (conversation) => set((state) => ({ 
    conversations: [conversation, ...state.conversations] 
  })),
  updateConversation: (id, updates) => set((state) => ({
    conversations: state.conversations.map(c => c.id === id ? { ...c, ...updates } : c)
  })),
  deleteConversation: (id) => set((state) => ({
    conversations: state.conversations.filter(c => c.id !== id)
  })),
  setCustomGPTs: (gpts) => set({ customGPTs: gpts }),
  addCustomGPT: (gpt) => set((state) => ({ customGPTs: [gpt, ...state.customGPTs] })),
  updateCustomGPT: (id, updates) => set((state) => ({
    customGPTs: state.customGPTs.map(g => g.id === id ? { ...g, ...updates } : g)
  })),
  deleteCustomGPT: (id) => set((state) => ({
    customGPTs: state.customGPTs.filter(g => g.id !== id)
  })),
  setCurrentGPT: (gpt) => set({ currentGPT: gpt }),
  setCurrentGPTFiles: (files) => set({ currentGPTFiles: files }),
}));
