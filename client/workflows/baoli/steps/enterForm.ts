// client/workflows/baoli/steps/enterForm.ts
// 保利 P6：进入填表流程（剪贴板由千机端写入，保利端只管粘贴）
// 来源：BaoliService.ts execute() L334-336

import type { StepFn } from '@/engine';
import { logToBoth } from '@/services/AutomationLogger';
import type { BaoliContext } from '../types';

/**
 * P6：进入填表流程
 * - 打印当前界面（debug 用，方便排查）
 * - 实际进入填表由 P7 点"报备"触发
 */
export const enterFormStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P6] 直接进入填表流程...');
  await ctx.baoliService.printScreenText();
  return { ok: true };
};
