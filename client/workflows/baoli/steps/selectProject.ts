// client/workflows/baoli/steps/selectProject.ts
// 保利 P11：选择报备项目
// 来源：BaoliService.ts fillForm() L621-633

import type { StepFn } from '@/engine';
import { logToBoth } from '@/services/AutomationLogger';
import { humanTap } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P11：选择报备项目（ctx.projectName 注入，默认缦城和颂）
 * 找包含 projectName 的节点 → 点击
 * 未找到 → 兜底坐标 (540, 2000)
 */
export const selectProjectStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', `[P11] 选择报备项目 (第 ${ctx.round} 轮: ${ctx.projectName})...`);
  const projectNodes = await ctx.baoliService.printScreenText();
  const targetProject = projectNodes?.find((n: any) => n.text && n.text.includes(ctx.projectName));
  if (targetProject) {
    logToBoth('success', '[P11] 找到"' + targetProject.text + '" @ (' + targetProject.centerX + ', ' + targetProject.centerY + ')');
    await humanTap(targetProject.centerX, targetProject.centerY);
  } else {
    logToBoth('warn', '[P11] 未找到目标项目，使用备用坐标 (540, 2000)');
    await humanTap(540, 2000);
  }
  return { ok: true };
};
