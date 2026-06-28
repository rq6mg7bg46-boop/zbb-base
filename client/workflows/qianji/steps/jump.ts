// client/workflows/qianji/steps/jump.ts
// 千机 Q5：派发下游（v1.6.4 同步调 baoliService.execute() → W6 异步 emitEvent）
// 来源：QianjiService.ts stepJumpToReportApp L557-569
// C5 派发抽象：ctx.dispatch = () => baoliService.execute()（老 v1.6.4 同步行为）
// W6 异步化：ctx.dispatch = () => emitEvent(ON_QIANJI_DATA_READY, payload)
//
// 千机 step 通过 ctx.dispatch() 派发下游，不直接 import baoliService
// v1.6.4 老 dispatch 路径（同步 execute）保留 1 周，对比异步行为
// W7 接入：千机 Q6/Q7 + BaoliService V2 fillForm

import type { StepFn } from '@/engine';
import { maybePause } from '@/actions';
import { pGammaDelay } from '../utils';
import { logToBoth } from '@/services/AutomationLogger';
import { emitEvent, QIANJI_EVENTS, type QianjiDataReadyPayload } from '@/events';
import type { QianjiContext } from '../types';

/**
 * Q5：派发下游（千机→保利）
 * W6 阶段调 ctx.dispatch()（由 buildQianjiContext 注入）：
 *   - v1.6.4 同步: () => BaoliService.getInstance().execute()（保留 1 周对比）
 *   - W6 异步: () => emitEvent(ON_QIANJI_DATA_READY, payload)
 */
export const jumpToReportAppStep: StepFn<QianjiContext, void> = async (ctx) => {
  // W13 老板拍板 2026-06-28：Q5 派发前检查 lastExitReason，避免错误数据启动保利端
  // 历史：find.ts Q3-2 无"保利"已设 lastExitReason='no_baoli'，但 Q5 仍 dispatch
  //   → 保利端跑空流程（payload.customerInfo=null），造成无效启动
  if (ctx.lastExitReason === 'no_baoli') {
    logToBoth('warn', '[Q5] 跳过派发（Q3-2 已判断无保利界面，lastExitReason=no_baoli）');
    return { ok: true };
  }
  if (ctx.lastExitReason === 'no_pending') {
    logToBoth('warn', '[Q5] 跳过派发（无待报备客户，lastExitReason=no_pending）');
    return { ok: true };
  }

  logToBoth('info', '[Q5] 派发到下游（dispatch 抽象层，调 ctx.dispatch()）...');
  await maybePause();
  await pGammaDelay(500, 1000);
  await ctx.dispatch();
  logToBoth('success', '[Q5] 派发完成');
  return { ok: true };
};

// 兼容老命名：dispatchToDownstreamStep = jumpToReportAppStep
// 老调用方仍可用 dispatchToDownstreamStep，逐步迁移
export const dispatchToDownstreamStep = jumpToReportAppStep;
