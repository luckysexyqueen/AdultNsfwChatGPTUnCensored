import { useEffect, useState } from 'react';
import { autoRepair } from '@/lib/auto-repair';

export function useAutoRepair() {
  const [isActive, setIsActive] = useState(true);
  const [logs, setLogs] = useState(autoRepair.getLogs());

  useEffect(() => {
    // 5초마다 로그 업데이트
    const interval = setInterval(() => {
      setLogs(autoRepair.getLogs());
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const runEmergencyRepair = async () => {
    await autoRepair.emergencyRepair();
    setLogs(autoRepair.getLogs());
  };

  const runHealthCheck = async () => {
    await autoRepair.runHealthCheck();
    setLogs(autoRepair.getLogs());
  };

  const clearCache = async () => {
    await autoRepair.clearAllCache();
    setLogs(autoRepair.getLogs());
  };

  return {
    isActive,
    logs,
    runEmergencyRepair,
    runHealthCheck,
    clearCache,
  };
}
