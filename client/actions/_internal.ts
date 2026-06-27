// client/actions/_internal.ts
// actions/ 内部辅助 - 不对外导出
// 所有 Action 副作用的唯一出口 = zbbAutomation（v2 设计文档 §P1 + §P2）

import { zbbAutomation } from '@/native';
import { logToBoth } from '@/services/AutomationLogger';

export { zbbAutomation };

/** Action 内部日志（走 AutomationLogger 全局通道：console + 服务端） */
export const logAction = {
  info: (msg: string) => logToBoth('info', msg),
  warn: (msg: string) => logToBoth('warn', msg),
  error: (msg: string) => logToBoth('error', msg),
  success: (msg: string) => logToBoth('success', msg),
};