// client/workflows/qianji/steps/jump.ts
// 千机 Q5：派发下游（v1.6.4 同步调 baoliService.execute()）
// 后续 W6 引入事件总线时改为异步派发（onBaoliFormSubmitted 事件）
// 来源：QianjiService.ts stepJumpToReportApp L557-569
// 注：C5 派发抽象——千机 step 不直接 import baoliService，通过 ctx.dispatch() 派发

import type { StepFn } from '@/engine';
import { maybePause } from '@/actions';
import { zbbAutomation } from '@/actions/_internal';
import { pGammaDelay } from '../utils';
import { logToBoth } from '@/services/AutomationLogger';
import type { QianjiContext } from '../types';

/**
 * Q5：派发下游（保利/越秀/其他）
 * 行为：调 ctx.dispatch() 触发下游报备端
 * v1.6.4 同步调 baoliService.execute()，W6 改 event bus 异步
 */
export const dispatchToDownstreamStep: StepFn<QianjiContext, void> = async (ctx) => {
  logToBoth('info', `[Q5] 派发到下游 ${ctx.targetApp}...`);

  // 等待保利小程序加载（v1.6.4 老行为保留）
  await zbbAutomation.delay(pGammaDelay(2000, 3000));
  maybePause();

  // C5 派发抽象：通过 ctx.dispatch() 触发下游
  // 切换下游只改 buildContext 的 targetApp + dispatch 注入
  await ctx.dispatch();

  return { ok: true };
};

// 兼容老命名：导出别名 jumpToReportAppStep（jumpToReportApp = Q5 派发）
// 老调用方仍可用 jumpToReportAppStep，逐步迁移到 dispatchToDownstreamStep
export { dispatchToDownstreamStep as jumpToReportAppStep };
