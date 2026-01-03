import { Conversation, Message, CustomGPT } from '@/types';

// IndexedDB 설정
const DB_NAME = 'ai-chat-db';
const DB_VERSION = 1;

interface DBSchema {
  conversations: Conversation;
  messages: Message;
  customGPTs: CustomGPT;
}

let db: IDBDatabase | null = null;

// IndexedDB 초기화
export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Conversations 저장소
      if (!database.objectStoreNames.contains('conversations')) {
        const conversationStore = database.createObjectStore('conversations', {
          keyPath: 'id',
        });
        conversationStore.createIndex('user_id', 'user_id', { unique: false });
        conversationStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // Messages 저장소
      if (!database.objectStoreNames.contains('messages')) {
        const messageStore = database.createObjectStore('messages', {
          keyPath: 'id',
        });
        messageStore.createIndex('conversation_id', 'conversation_id', {
          unique: false,
        });
      }

      // Custom GPTs 저장소
      if (!database.objectStoreNames.contains('customGPTs')) {
        const gptStore = database.createObjectStore('customGPTs', {
          keyPath: 'id',
        });
        gptStore.createIndex('user_id', 'user_id', { unique: false });
      }
    };
  });
}

// 대화 캐싱
export async function cacheConversation(conversation: Conversation): Promise<void> {
  const database = await initDB();
  const tx = database.transaction('conversations', 'readwrite');
  const store = tx.objectStore('conversations');
  store.put(conversation);
  await tx.done;
}

export async function getCachedConversations(userId: string): Promise<Conversation[]> {
  try {
    const database = await initDB();
    const tx = database.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const index = store.index('user_id');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get cached conversations:', error);
    return [];
  }
}

// 메시지 캐싱
export async function cacheMessage(message: Message): Promise<void> {
  const database = await initDB();
  const tx = database.transaction('messages', 'readwrite');
  const store = tx.objectStore('messages');
  store.put(message);
  await tx.done;
}

export async function getCachedMessages(conversationId: string): Promise<Message[]> {
  try {
    const database = await initDB();
    const tx = database.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('conversation_id');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(conversationId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get cached messages:', error);
    return [];
  }
}

// 커스텀 GPT 캐싱
export async function cacheCustomGPT(gpt: CustomGPT): Promise<void> {
  const database = await initDB();
  const tx = database.transaction('customGPTs', 'readwrite');
  const store = tx.objectStore('customGPTs');
  store.put(gpt);
  await tx.done;
}

export async function getCachedCustomGPTs(userId: string): Promise<CustomGPT[]> {
  try {
    const database = await initDB();
    const tx = database.transaction('customGPTs', 'readonly');
    const store = tx.objectStore('customGPTs');
    const index = store.index('user_id');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get cached GPTs:', error);
    return [];
  }
}

// 캐시 초기화
export async function clearCache(): Promise<void> {
  const database = await initDB();
  const tx = database.transaction(['conversations', 'messages', 'customGPTs'], 'readwrite');
  tx.objectStore('conversations').clear();
  tx.objectStore('messages').clear();
  tx.objectStore('customGPTs').clear();
  await tx.done;
}
