// client/workflows/qianji/steps/jump.ts
// 千机 Q4：跳到保利端（同步触发，保留 v1.6.4 老行为）
// 来源：QianjiService.ts stepJumpToReportApp L557-569
// 注：C5 派发抽象后会改 Q5 + ctx.dispatch()（解耦下游）

import type { StepFn } from '@/engine';
import { maybePause } from '@/actions';
import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';
import type { QianjiContext } from '../types';
import { pGammaDelay } from '../utils';

/**
 * jumpToReportAppStep - 千机 Q4（跳到下游报备端，v1.6.4 同步调保利）
 * 1. maybePause + pGammaDelay 拟人化反应时间
 * 2. 同步调 baoliService.execute()（保留 v1.6.4 行为）
 *
 * 注：v2 文档 §7.2 事件总线方案是后续重构，W3 阶段不引入
 * 注：C5 派发抽象后，step 不再直接 import baoliService
 *     通过 ctx.dispatch() 解耦，支持未来加越秀端 Y1-YM
 *     届时本 step 编号从 Q4 改 Q5
 */
export const jumpToReportAppStep: StepFn<QianjiContext, void> = async (ctx) => {
  logToBoth('info', '[Q4] 复制成功，启动保利端...');
  logToBoth(
    'info',
    `[Q4] customerInfo: ${ctx.customerInfo ? JSON.stringify(ctx.customerInfo).substring(0, 200) : '(null)'}`
  );

  // P+ 拟人化：复制成功后启动保利端的反应时间
  await maybePause();
  await zbbAutomation.delay(pGammaDelay(500, 1500));

  // 同步触发保利流程（保留 v1.6.4 行为，W3 不引入事件总线）
  await ctx.baoliService.execute();

  return { ok: true, data: undefined };
};