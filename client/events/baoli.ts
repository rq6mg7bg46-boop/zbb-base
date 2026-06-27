// client/events/baoli.ts
// 保利端事件（v2 设计文档 §5.5 + W6 老板拍板）
// ON_BAOLI_FORM_SUBMITTED: 保利 P14 报备提交后发此事件（下游可订阅触发 P15 等结果）

import type { ZbbEventName, ZbbEventPayload } from './core';

export const BAOLI_EVENTS = {
  /** 保利 P14 报备按钮已点（用于异步触发 P15 等结果）*/
  FORM_SUBMITTED: 'ON_BAOLI_FORM_SUBMITTED',
  /** 保利启动段 P1-P7 跑完（用于异步触发 V2 fillForm）*/
  LAUNCH_DONE: 'ON_BAOLI_LAUNCH_DONE',
} as const;

export interface BaoliLaunchDonePayload extends ZbbEventPayload {
  success: boolean;
  error?: string;
  round: 1 | 2 | number;  // W7 阶段 round=1 也可能触发（异步 P16-情况2 第一轮也走 ON_BAOLI_LAUNCH_DONE）
  projectName: string;
  baoliCount: number;  // W7 阶段：接龙完成数（与 todayBaoliCount 同步）
  timestamp: number;
}
