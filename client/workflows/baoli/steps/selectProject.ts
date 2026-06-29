// client/workflows/baoli/steps/selectProject.ts
// 保利 P11：选择报备项目
// 来源：BaoliService.ts fillForm() L621-633

import type { StepFn } from '@/engine';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { humanTap } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P11：选择报备项目（ctx.projectName 注入，默认缦城和颂）
 * 找包含 projectName 的节点 → 点击
 * 未找到 → 兜底坐标（按机型分支，按 ctx.round 区分 round1/round2）
 */
export const selectProjectStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', `[P11] 选择报备项目 (第 ${ctx.round} 轮: ${ctx.projectName})...`);
  const projectNodes = await ctx.baoliService.printScreenText();
  const targetProject = projectNodes?.find((n: any) => n.text && n.text.includes(ctx.projectName));
  if (targetProject) {
    logToBoth('success', '[P11] 找到"' + targetProject.text + '" @ (' + targetProject.centerX + ', ' + targetProject.centerY + ')');
    await humanTap(targetProject.centerX, targetProject.centerY);
  } else {
    // 老板 2026-06-29 拍板：缦城（round1）/山水（round2）分两个 stepName 入表
    const stepName = ctx.round === 1 ? 'selectProject_round1' : 'selectProject_round2';
    const fallback = await getTapCoord(stepName);
    logToBoth('warn', '[P11] 未找到目标项目，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型, 第 ' + ctx.round + ' 轮)');
    await humanTap(fallback.x, fallback.y);
  }
  return { ok: true };
};
