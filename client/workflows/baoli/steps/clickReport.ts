// client/workflows/baoli/steps/clickReport.ts
// 保利 P7：点击"报备"
// 来源：BaoliService.ts execute() L338-355

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { delay, maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P7：点击"报备"
 * - 找到精确"报备"节点 → 点击
 * - 未找到 → 兜底坐标（按机型分支）+ 4s 后打印界面（debug）
 */
export const clickReportStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P7] 点击"报备"...');
  const baobeiNode = await ctx.baoliService.findExactNode('报备');
  if (baobeiNode) {
    logToBoth('success', '[P7] 找到"报备" @ (' + baobeiNode.centerX + ', ' + baobeiNode.centerY + ')');
    await humanTap(baobeiNode.centerX, baobeiNode.centerY);
  } else {
    const fallback = await getTapCoord('clickReport');
    logToBoth('warn', '[P7] 未找到"报备"，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型)');
    await humanTap(fallback.x, fallback.y);
    // 调试：等待后打印界面所有节点
    await delay(4000);
    await ctx.baoliService.printScreenText();
  }
  await delay(pGammaDelay(3000, 4000));
  maybePause();
  return { ok: true };
};
