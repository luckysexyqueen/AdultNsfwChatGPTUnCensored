import { supabase } from './supabase';
import { saveMessage, updateConversationTitle } from './chat';
import { toast } from 'sonner';

interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  retryCount: number;
}

class OfflineMessageQueue {
  private queue: QueuedMessage[] = [];
  private isProcessing = false;
  private readonly STORAGE_KEY = 'offline-message-queue';
  private readonly MAX_RETRIES = 3;

  constructor() {
    this.loadQueue();
    this.setupOnlineListener();
  }

  // 로컬 스토리지에서 큐 로드
  private loadQueue() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`[Queue] ${this.queue.length}개의 대기 중인 메시지 로드됨`);
      }
    } catch (error) {
      console.error('[Queue] 큐 로드 실패:', error);
      this.queue = [];
    }
  }

  // 큐를 로컬 스토리지에 저장
  private saveQueue() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[Queue] 큐 저장 실패:', error);
    }
  }

  // 온라인 상태 감지 및 자동 처리
  private setupOnlineListener() {
    window.addEventListener('online', () => {
      console.log('[Queue] 온라인 상태 감지, 큐 처리 시작');
      this.processQueue();
    });
  }

  // 메시지를 큐에 추가
  addToQueue(conversationId: string, content: string): string {
    if (!conversationId || !content) {
      console.error('[Queue] 유효하지 않은 메시지:', { conversationId, content });
      toast.error('메시지를 큐에 추가할 수 없습니다');
      return '';
    }

    const messageId = `queued-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedMessage: QueuedMessage = {
      id: messageId,
      conversationId,
      content,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.queue.push(queuedMessage);
    this.saveQueue();

    console.log(`[Queue] 메시지 추가됨: ${messageId}`);
    toast.info('오프라인 상태입니다. 메시지는 온라인 복귀 시 전송됩니다.');

    return messageId;
  }

  // 큐 처리
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    if (!navigator.onLine) {
      console.log('[Queue] 오프라인 상태, 큐 처리 연기');
      return;
    }

    this.isProcessing = true;
    console.log(`[Queue] ${this.queue.length}개 메시지 처리 시작`);

    const processedIds: string[] = [];
    const failedIds: string[] = [];

    for (const message of [...this.queue]) {
      try {
        console.log(`[Queue] 메시지 전송 중: ${message.id}`);
        
        // 메시지 저장
        await saveMessage(message.conversationId, 'user', message.content);
        
        processedIds.push(message.id);
        console.log(`[Queue] 메시지 전송 성공: ${message.id}`);
      } catch (error: any) {
        console.error(`[Queue] 메시지 전송 실패: ${message.id}`, error);
        
        // 재시도 횟수 증가
        message.retryCount++;
        
        if (message.retryCount >= this.MAX_RETRIES) {
          failedIds.push(message.id);
          console.error(`[Queue] 최대 재시도 횟수 초과: ${message.id}`);
        }
      }
    }

    // 성공한 메시지는 큐에서 제거
    this.queue = this.queue.filter(msg => !processedIds.includes(msg.id));

    // 실패한 메시지도 제거 (최대 재시도 초과)
    this.queue = this.queue.filter(msg => !failedIds.includes(msg.id));

    this.saveQueue();

    if (processedIds.length > 0) {
      toast.success(`${processedIds.length}개의 대기 중이던 메시지가 전송되었습니다`);
    }

    if (failedIds.length > 0) {
      toast.error(`${failedIds.length}개의 메시지 전송에 실패했습니다`);
    }

    this.isProcessing = false;
    console.log(`[Queue] 처리 완료. 남은 메시지: ${this.queue.length}개`);
  }

  // 특정 메시지 제거
  removeFromQueue(messageId: string) {
    this.queue = this.queue.filter(msg => msg.id !== messageId);
    this.saveQueue();
    console.log(`[Queue] 메시지 제거됨: ${messageId}`);
  }

  // 큐 상태 확인
  getQueueStatus() {
    return {
      count: this.queue.length,
      messages: [...this.queue],
      isProcessing: this.isProcessing,
    };
  }

  // 전체 큐 초기화
  clearQueue() {
    this.queue = [];
    this.saveQueue();
    console.log('[Queue] 큐 초기화됨');
    toast.success('대기 중인 메시지가 모두 삭제되었습니다');
  }
}

// 싱글톤 인스턴스
export const messageQueue = new OfflineMessageQueue();
