// client/workflows/baoli/steps/aiRecognize.ts
// 保利 P13：智能识别
// 来源：BaoliService.ts fillForm() L647-659
// 老板反馈 P12 → P13 间隔太短：加长到 pGammaDelay(2000, 3000) ≈ 2.5s

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P13：点击"智能识别"
 * 等 2-3s 让智能识别按钮加载
 * 找到 → 点击
 * 未找到 → 兜底坐标 (910, 1100)
 */
export const tapAiRecognizeStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P13] 点击"智能识别"...');
  await zbbAutomation.delay(pGammaDelay(2000, 3000));
  const zhinengNode = await ctx.baoliService.findNodeByText('智能识别');
  if (zhinengNode) {
    logToBoth('success', '[P13] 找到"智能识别" @ (' + zhinengNode.centerX + ', ' + zhinengNode.centerY + ')');
    await humanTap(zhinengNode.centerX, zhinengNode.centerY);
  } else {
    logToBoth('warn', '[P13] 未找到"智能识别"，使用备用坐标 (910, 1100)');
    await humanTap(910, 1100);
  }
  return { ok: true };
};
