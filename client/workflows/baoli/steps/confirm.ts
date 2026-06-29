// client/workflows/baoli/steps/confirm.ts
// 保利 P12：点击"确认"
// 来源：BaoliService.ts fillForm() L635-645

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { humanTap } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P12：点击"确认"（精确匹配）
 * 找到 → 点击
 * 未找到 → 兜底坐标（按机型分支）
 */
export const tapConfirmStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', '[P12] 点击"确认"...');
  await zbbAutomation.delay(1000);
  const confirmNode = await ctx.baoliService.findExactNode('确认');
  if (confirmNode) {
    logToBoth('success', '[P12] 找到"确认" @ (' + confirmNode.centerX + ', ' + confirmNode.centerY + ')');
    await humanTap(confirmNode.centerX, confirmNode.centerY);
  } else {
    const fallback = await getTapCoord('confirm');
    logToBoth('warn', '[P12] 未找到"确认"，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型)');
    await humanTap(fallback.x, fallback.y);
  }
  return { ok: true };
};
