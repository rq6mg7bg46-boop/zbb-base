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
  // 老板 2026-06-29 拍板：分期关键词按轮次注入（不用 ctx.projectName，避免方括号中英文不匹配）
  // round=1: 找 "保利缦城和颂"
  // round=2: 找 "保利山水和颂"
  const keyword = ctx.round === 1 ? '保利缦城和颂' : '保利山水和颂';
  logToBoth('info', `[P11] 选择报备项目 (第 ${ctx.round} 轮: 关键词="${keyword}", 全名=${ctx.projectName})...`);
  const projectNodes = await ctx.baoliService.printScreenText();
  const targetProject = projectNodes?.find((n: any) => n.text && n.text.includes(keyword));
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
