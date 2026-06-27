// client/workflows/baoli/steps/clickReport.ts
// 保利 P7：点击"报备"
// 来源：BaoliService.ts execute() L338-355

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P7：点击"报备"
 * - 找到精确"报备"节点 → 点击
 * - 未找到 → 兜底坐标 (700, 2200) + 4s 后打印界面（debug）
 */
export const clickReportStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P7] 点击"报备"...');
  const baobeiNode = await ctx.baoliService.findExactNode('报备');
  if (baobeiNode) {
    logToBoth('success', '[P7] 找到"报备" @ (' + baobeiNode.centerX + ', ' + baobeiNode.centerY + ')');
    await humanTap(baobeiNode.centerX, baobeiNode.centerY);
  } else {
    logToBoth('warn', '[P7] 未找到"报备"，使用备用坐标 (700, 2200)');
    await humanTap(700, 2200);
    // 调试：等待后打印界面所有节点
    await zbbAutomation.delay(4000);
    await ctx.baoliService.printScreenText();
  }
  await zbbAutomation.delay(pGammaDelay(3000, 4000));
  maybePause();
  return { ok: true };
};
