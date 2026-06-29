/**
 * 自动化日志模块
 * 统一管理日志输出：控制台 + 服务端
 */

type LogLevel = 'info' | 'success' | 'warn' | 'error';

/**
 * 统一日志函数
 */
function logToBoth(level: LogLevel, message: string): void {
  // 1. 输出到控制台（Expo日志）
  const prefix = getPrefix(level);
  console.log(`${prefix} ${message}`);

  // 2. 发送到服务端日志
  sendToServer(level, message);
}

/**
 * 获取日志前缀
 */
function getPrefix(level: LogLevel): string {
  switch (level) {
    case 'success':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'error':
      return '❌';
    default:
      return '📋';
  }
}

/**
 * 发送到服务端
 */
function sendToServer(level: LogLevel, message: string): void {
  const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';
  
  fetch(`${baseUrl}/api/v1/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      source: 'QianjiService'
    })
  }).catch(() => {
    // 静默失败，不影响主流程
  });
}

// 日志数组（logs/index.tsx 用）
export const logs: string[] = [];

export { logToBoth };
