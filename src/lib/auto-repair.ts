import { supabase } from './supabase';
import { initDB, clearCache, getCachedConversations } from './offline';
import { toast } from 'sonner';

interface RepairLog {
  timestamp: string;
  type: 'success' | 'error' | 'warning';
  action: string;
  details?: string;
}

class AutoRepairSystem {
  private logs: RepairLog[] = [];
  private isHealthCheckRunning = false;
  private healthCheckInterval: number | null = null;

  constructor() {
    this.initHealthCheck();
  }

  // 로그 기록
  private log(type: RepairLog['type'], action: string, details?: string) {
    const log: RepairLog = {
      timestamp: new Date().toISOString(),
      type,
      action,
      details,
    };
    this.logs.push(log);
    
    // 최근 100개만 유지
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }

    console.log(`[AutoRepair] [${type.toUpperCase()}] ${action}`, details || '');
  }

  // 건강 체크 시스템 초기화
  private initHealthCheck() {
    // 5분마다 건강 체크 실행
    this.healthCheckInterval = window.setInterval(() => {
      this.runHealthCheck();
    }, 5 * 60 * 1000);

    // 초기 실행
    setTimeout(() => this.runHealthCheck(), 5000);
  }

  // 전체 건강 체크
  async runHealthCheck() {
    if (this.isHealthCheckRunning) return;
    this.isHealthCheckRunning = true;

    try {
      this.log('success', '건강 체크 시작');

      await Promise.all([
        this.checkDatabaseConnection(),
        this.checkIndexedDB(),
        this.checkAuthSession(),
        this.checkCacheHealth(),
      ]);

      this.log('success', '건강 체크 완료');
    } catch (error: any) {
      this.log('error', '건강 체크 실패', error.message);
    } finally {
      this.isHealthCheckRunning = false;
    }
  }

  // 데이터베이스 연결 확인
  private async checkDatabaseConnection() {
    try {
      const { error } = await supabase.from('user_profiles').select('id').limit(1);
      
      if (error) {
        this.log('warning', 'DB 연결 문제 감지', error.message);
        
        // 재연결 시도
        await this.repairDatabaseConnection();
      } else {
        this.log('success', 'DB 연결 정상');
      }
    } catch (error: any) {
      this.log('error', 'DB 연결 확인 실패', error.message);
    }
  }

  // IndexedDB 건강 확인
  private async checkIndexedDB() {
    try {
      const db = await initDB();
      
      // 트랜잭션 테스트
      const tx = db.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const count = await new Promise<number>((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      this.log('success', `IndexedDB 정상 (${count}개 대화)`);
    } catch (error: any) {
      this.log('error', 'IndexedDB 손상 감지', error.message);
      
      // IndexedDB 재생성 시도
      await this.repairIndexedDB();
    }
  }

  // 인증 세션 확인
  private async checkAuthSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        this.log('warning', '세션 확인 실패', error.message);
        return;
      }

      if (!session) {
        this.log('warning', '세션 없음');
        return;
      }

      // 토큰 만료 시간 확인 (5분 이내 만료 예정이면 갱신)
      const expiresAt = session.expires_at || 0;
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt - now;

      if (timeUntilExpiry < 300) {
        this.log('warning', '토큰 만료 임박, 갱신 시도');
        await this.refreshAuthToken();
      } else {
        this.log('success', '세션 정상');
      }
    } catch (error: any) {
      this.log('error', '세션 확인 실패', error.message);
    }
  }

  // 캐시 건강 확인
  private async checkCacheHealth() {
    try {
      const cacheNames = await caches.keys();
      this.log('success', `캐시 정상 (${cacheNames.length}개)`);

      // 오래된 캐시 정리 (7일 이상)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      
      for (const cacheName of cacheNames) {
        if (cacheName.includes('-v1')) continue; // 현재 버전은 유지
        
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        for (const request of keys) {
          const response = await cache.match(request);
          if (response) {
            const date = response.headers.get('date');
            if (date && new Date(date).getTime() < sevenDaysAgo) {
              await cache.delete(request);
              this.log('warning', '오래된 캐시 삭제', request.url);
            }
          }
        }
      }
    } catch (error: any) {
      this.log('error', '캐시 확인 실패', error.message);
    }
  }

  // DB 연결 복구
  private async repairDatabaseConnection() {
    try {
      this.log('warning', 'DB 연결 복구 시도');
      
      // Supabase 클라이언트 재초기화는 필요없음 (자동 재연결)
      // 단순히 재시도
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const { error } = await supabase.from('user_profiles').select('id').limit(1);
      
      if (!error) {
        this.log('success', 'DB 연결 복구 성공');
        toast.success('데이터베이스 연결이 복구되었습니다');
      } else {
        this.log('error', 'DB 연결 복구 실패', error.message);
      }
    } catch (error: any) {
      this.log('error', 'DB 연결 복구 실패', error.message);
    }
  }

  // IndexedDB 복구
  private async repairIndexedDB() {
    try {
      this.log('warning', 'IndexedDB 복구 시도');
      
      // 기존 DB 삭제
      const deleteRequest = indexedDB.deleteDatabase('ai-chat-db');
      
      await new Promise((resolve, reject) => {
        deleteRequest.onsuccess = resolve;
        deleteRequest.onerror = reject;
      });

      // DB 재생성
      await initDB();
      
      this.log('success', 'IndexedDB 복구 성공');
      toast.success('로컬 데이터베이스가 복구되었습니다');
    } catch (error: any) {
      this.log('error', 'IndexedDB 복구 실패', error.message);
      toast.error('로컬 데이터베이스 복구에 실패했습니다');
    }
  }

  // 인증 토큰 갱신
  private async refreshAuthToken() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        this.log('error', '토큰 갱신 실패', error.message);
        return;
      }

      if (data.session) {
        this.log('success', '토큰 갱신 성공');
      }
    } catch (error: any) {
      this.log('error', '토큰 갱신 실패', error.message);
    }
  }

  // 전체 캐시 정리
  async clearAllCache() {
    try {
      this.log('warning', '전체 캐시 정리 시작');
      
      // IndexedDB 캐시 정리
      await clearCache();
      
      // Service Worker 캐시 정리
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
      
      this.log('success', '전체 캐시 정리 완료');
      toast.success('모든 캐시가 정리되었습니다');
    } catch (error: any) {
      this.log('error', '캐시 정리 실패', error.message);
      toast.error('캐시 정리에 실패했습니다');
    }
  }

  // 긴급 수리 (사용자가 수동으로 실행)
  async emergencyRepair() {
    try {
      this.log('warning', '긴급 수리 시작');
      toast.info('긴급 수리를 시작합니다...');

      // 1. 캐시 정리
      await this.clearAllCache();

      // 2. IndexedDB 재생성
      await this.repairIndexedDB();

      // 3. 세션 갱신
      await this.refreshAuthToken();

      // 4. 건강 체크
      await this.runHealthCheck();

      this.log('success', '긴급 수리 완료');
      toast.success('긴급 수리가 완료되었습니다. 페이지를 새로고침하세요.');

      // 3초 후 자동 새로고침
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error: any) {
      this.log('error', '긴급 수리 실패', error.message);
      toast.error('긴급 수리에 실패했습니다');
    }
  }

  // 로그 가져오기
  getLogs() {
    return [...this.logs];
  }

  // 시스템 정지
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.log('warning', '자동 수리 시스템 정지');
  }
}

// 싱글톤 인스턴스
export const autoRepair = new AutoRepairSystem();

// 자동 재시도 헬퍼 함수
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // 마지막 시도가 아니면 대기 후 재시도
      if (attempt < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, attempt); // Exponential backoff
        console.log(`[Retry] 재시도 ${attempt + 1}/${maxRetries} (${waitTime}ms 대기)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('재시도 실패');
}
