// client/workflows/baoli/steps/findProject.ts
// 保利 P5：找"郑州保利山水和颂" + tap
// 来源：BaoliService.ts execute() L313-332

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { maybePause } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap, pGammaDelay } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P5：找"郑州保利山水和颂"（云和家小程序加载后第一屏）
 * - 3 次 find 循环，每次失败 delay 1s
 * - 都没找到 → 兜底坐标 (810, 1440)
 */
export const findProjectStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P5] 找"郑州保利山水和颂"...');
  let projectEntry = null;
  for (let i = 0; i < 3; i++) {
    projectEntry = await ctx.baoliService.findNodeByText('郑州保利山水和颂', 1);
    if (projectEntry) {
      logToBoth('success', '[P5] 第 ' + (i + 1) + ' 次找到"郑州保利山水和颂" @ (' + projectEntry.centerX + ', ' + projectEntry.centerY + ')');
      break;
    }
    logToBoth('warn', '[P5] 第 ' + (i + 1) + ' 次未找到"郑州保利山水和颂"');
    await zbbAutomation.delay(1000);
  }
  if (projectEntry) {
    await humanTap(projectEntry.centerX, projectEntry.centerY);
  } else {
    logToBoth('warn', '[P5] 3 次未找到，使用兜底坐标 (810, 1440)');
    await humanTap(810, 1440);
  }
  await zbbAutomation.delay(pGammaDelay(2000, 3000));
  maybePause();
  return { ok: true };
};
