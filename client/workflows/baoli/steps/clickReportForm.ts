// client/workflows/baoli/steps/clickReportForm.ts
// 保利 P14：点击"报备"
// 来源：BaoliService.ts fillForm() L661-674
// 老板反馈 P13 → P14 间隔太短：加长到 pGammaDelay(2000, 3000) ≈ 2.5s

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { delay } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P14：点击"报备"（精确匹配）
 * 等 2-3s 让智能识别完成 + 报备按钮加载
 * 找到 → 点击
 * 未找到 → 兜底坐标（按机型分支）
 */
export const tapReportFormStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P14] 点击"报备"...');
  await delay(pGammaDelay(2000, 3000));
  await ctx.baoliService.printScreenText();
  const finalBaobeiNode = await ctx.baoliService.findExactNode('报备');
  if (finalBaobeiNode) {
    logToBoth('success', '[P14] 找到"报备" @ (' + finalBaobeiNode.centerX + ', ' + finalBaobeiNode.centerY + ')');
    await humanTap(finalBaobeiNode.centerX, finalBaobeiNode.centerY);
  } else {
    const fallback = await getTapCoord('clickReportForm');
    logToBoth('warn', '[P14] 未找到"报备"，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型)');
    await humanTap(fallback.x, fallback.y);
  }
  return { ok: true };
};
