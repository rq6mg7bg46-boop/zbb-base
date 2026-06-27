// client/workflows/baoli/steps/workbench.ts
// 保利 P3：点击"工作台"
// 来源：BaoliService.ts execute() L264-276

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P3：点击"工作台"
 * - 找到 → 点击
 * - 未找到 → 兜底坐标 (540, 199)
 */
export const tapWorkbenchStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P3] 点击"工作台"...');
  await zbbAutomation.delay(1000);  // 额外等待确保界面稳定
  const workbenchNode = await ctx.baoliService.findNodeByText('工作台');
  if (workbenchNode) {
    logToBoth('success', '[P3] 找到"工作台" @ (' + workbenchNode.centerX + ', ' + workbenchNode.centerY + ')');
    await humanTap(workbenchNode.centerX, workbenchNode.centerY);
  } else {
    logToBoth('warn', '[P3] 未找到"工作台"，使用备用坐标 (540, 199)');
    await humanTap(540, 199);
  }
  await zbbAutomation.delay(pGammaDelay(2000, 3000));
  maybePause();
  return { ok: true };
};
