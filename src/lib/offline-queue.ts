import { saveMessage } from './chat';
import { toast } from 'sonner';

interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  retryCount: number;
}

function isQueuedMessage(value: unknown): value is QueuedMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<QueuedMessage>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.conversationId === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.timestamp === 'number' &&
    typeof candidate.retryCount === 'number'
  );
}

class OfflineMessageQueue {
  private queue: QueuedMessage[] = [];
  private isProcessing = false;
  private readonly storageKey = 'offline-message-queue';
  private readonly maxRetriesBeforeNotice = 3;

  constructor() {
    this.loadQueue();
    this.setupOnlineListener();
    if (navigator.onLine && this.queue.length > 0) {
      queueMicrotask(() => void this.processQueue());
    }
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      this.queue = Array.isArray(parsed) ? parsed.filter(isQueuedMessage) : [];
      console.log(`[Queue] ${this.queue.length}개의 대기 중인 메시지 로드됨`);
    } catch (error) {
      console.error('[Queue] 큐 로드 실패:', error);
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[Queue] 큐 저장 실패:', error);
      toast.error('오프라인 메시지를 브라우저에 저장하지 못했습니다. 저장 공간을 확인해주세요.');
    }
  }

  private setupOnlineListener() {
    window.addEventListener('online', () => {
      console.log('[Queue] 온라인 상태 감지, 큐 처리 시작');
      void this.processQueue();
    });
  }

  addToQueue(conversationId: string, content: string): string {
    const normalizedContent = content.trim();
    if (!conversationId || !normalizedContent) {
      console.error('[Queue] 유효하지 않은 메시지:', { conversationId, content });
      toast.error('메시지를 큐에 추가할 수 없습니다');
      return '';
    }

    const messageId = `queued-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.queue.push({
      id: messageId,
      conversationId,
      content: normalizedContent,
      timestamp: Date.now(),
      retryCount: 0,
    });
    this.saveQueue();

    console.log(`[Queue] 메시지 추가됨: ${messageId}`);
    return messageId;
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0 || !navigator.onLine) return;

    this.isProcessing = true;
    const processedIds: string[] = [];
    let deferredCount = 0;

    try {
      for (const message of [...this.queue]) {
        try {
          await saveMessage(message.conversationId, 'user', message.content);
          processedIds.push(message.id);
          console.log(`[Queue] 메시지 전송 성공: ${message.id}`);
        } catch (error: unknown) {
          message.retryCount += 1;
          deferredCount += 1;
          console.error(`[Queue] 메시지 전송 실패: ${message.id}`, error);
        }
      }

      // 실패 메시지는 삭제하지 않습니다. 이후 온라인 복귀나 새로고침 시 재시도됩니다.
      this.queue = this.queue.filter((message) => !processedIds.includes(message.id));
      this.saveQueue();

      if (processedIds.length > 0) {
        toast.success(`${processedIds.length}개의 대기 중이던 메시지가 전송되었습니다`);
      }
      if (deferredCount > 0) {
        const repeatedlyFailed = this.queue.filter(
          (message) => message.retryCount >= this.maxRetriesBeforeNotice
        ).length;
        const suffix = repeatedlyFailed > 0 ? ' 연결 또는 로그인 상태를 확인한 뒤 다시 시도합니다.' : '';
        toast.error(`${deferredCount}개의 메시지 전송을 보류했습니다.${suffix}`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  removeFromQueue(messageId: string) {
    this.queue = this.queue.filter((message) => message.id !== messageId);
    this.saveQueue();
  }

  getQueueStatus() {
    return {
      count: this.queue.length,
      messages: [...this.queue],
      isProcessing: this.isProcessing,
    };
  }

  clearQueue() {
    this.queue = [];
    this.saveQueue();
    toast.success('대기 중인 메시지가 모두 삭제되었습니다');
  }
}

export const messageQueue = new OfflineMessageQueue();
