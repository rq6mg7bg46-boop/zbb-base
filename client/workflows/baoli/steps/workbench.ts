// client/workflows/baoli/steps/workbench.ts
// 保利 P3：点击"工作台"
// 来源：BaoliService.ts execute() L264-276

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P3：点击"工作台"
 * - 找到 → 点击
 * - 未找到 → 兜底坐标（按机型分支：nova 7 5G (540,199) / vivo V2166A (?, ?) TODO）
 */
export const tapWorkbenchStep: StepFn<BaoliContext, void> = async (ctx) => {
  // P3 前拟人化随机等待（老板 2026-06-28 拍板：0.5-1.5s Gamma 分布）
  await zbbAutomation.delay(pGammaDelay(500, 1500));
  logToBoth('info', '[P3] 点击"工作台"...');
  await zbbAutomation.delay(1000);  // 额外等待确保界面稳定
  const workbenchNode = await ctx.baoliService.findNodeByText('工作台');
  if (workbenchNode) {
    logToBoth('success', '[P3] 找到"工作台" @ (' + workbenchNode.centerX + ', ' + workbenchNode.centerY + ')');
    await humanTap(workbenchNode.centerX, workbenchNode.centerY);
  } else {
    const fallback = await getTapCoord('workbench');
    logToBoth('warn', '[P3] 未找到"工作台"，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型)');
    await humanTap(fallback.x, fallback.y);
  }
  await zbbAutomation.delay(pGammaDelay(2000, 3000));
  maybePause();
  return { ok: true };
};
