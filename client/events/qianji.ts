// client/events/qianji.ts
// 千机端事件（v2 设计文档 §5.5 + W6 老板拍板）
// ON_QIANJI_DATA_READY: 千机 Q5 dispatch 发此事件（替代同步 baoliService.execute()）

import type { ZbbEventName, ZbbEventPayload } from './core';

/** 千机事件名常量（约定 ON_QIANJI_* 前缀）*/
export const QIANJI_EVENTS = {
  /** 千机 Q5 dispatch 完成，数据已就绪，下游可订阅触发报备 */
  DATA_READY: 'ON_QIANJI_DATA_READY',
  /** 千机千机 listener 收到报备审核（v1.6.4 行为保留）*/
  MESSAGE_RECEIVED: 'ON_QIANJI_MESSAGE_RECEIVED',
} as const;

export interface QianjiDataReadyPayload extends ZbbEventPayload {
  customerInfo: string;       // 客户信息（剪贴板内容）
  targetApp: 'baoli' | 'yuexiu' | 'other';
  round: number;
  projectName: string;
  timestamp: number;
}
