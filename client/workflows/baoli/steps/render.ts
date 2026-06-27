// client/workflows/baoli/steps/render.ts
// 保利 P9：等渲染 + 抓 formNodes（不检测、不兜底）
// 来源：BaoliService.ts fillForm() L501-507
// 2026-06-21 老板：P8 已完成粘贴；isFormFilled 检测非必须，结果不影响流程

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';
import type { BaoliContext } from '../types';

/**
 * P9：等粘贴内容渲染 + 抓 formNodes
 * 保留原 retry 首次 delay 2000ms
 * 不检测、不调 handlePasteFailure，直接让 fillForm 继续（P10 会再检测）
 */
export const waitForRenderStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P9] 等粘贴内容渲染（2000ms）...');
  await zbbAutomation.delay(2000);
  ctx.formNodes = (await zbbAutomation.getAllTextNodes()) || [];
  logToBoth('info', `[P9] 界面节点数: ${ctx.formNodes.length}`);
  return { ok: true };
};
