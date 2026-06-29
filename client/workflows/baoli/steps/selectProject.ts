// client/workflows/baoli/steps/selectProject.ts
// 保利 P11：选择报备项目
// 来源：BaoliService.ts fillForm() L621-633

import type { StepFn } from '@/engine';
import { logToBoth } from '@/services/AutomationLogger';
import { getTapCoord } from '@/utils/deviceModel';
import { delay, maybePause } from '@/actions';
import { humanTap } from '../utils';
import type { BaoliContext } from '../types';

/**
 * P11：选择报备项目（分期关键词按轮次注入，绕开方括号中英文不匹配）
 * - round=1: 找 "保利缦城和颂"
 * - round=2: 找 "保利山水和颂"
 *
 * 老板 2026-06-29 拍板：P11 加 retry 机制
 * - 原因：P10 tap 红字后保甲 popup 加载耗时不确定（可能 2-5s）
 * - P10 末尾 delay 改短（500ms）→ P11 主动 retry 等界面稳定
 * - 3 次重试，每次间隔 1.5s（拟人：让保甲有加载时间）
 * - 3 次后仍找不到 → 兜底坐标（按机型分支，按 ctx.round 区分 round1/round2）
 */
export const selectProjectStep: StepFn<BaoliContext, void> = async (ctx) => {
  const keyword = ctx.round === 1 ? '保利缦城和颂' : '保利山水和颂';
  logToBoth('info', `[P11] 选择报备项目 (第 ${ctx.round} 轮: 关键词="${keyword}", 全名=${ctx.projectName})...`);

  const MAX_RETRIES = 3;
  let targetProject: any = null;
  let lastNodeCount = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const projectNodes = await ctx.baoliService.printScreenText();
    lastNodeCount = projectNodes?.length || 0;
    targetProject = projectNodes?.find((n: any) => n.text && n.text.includes(keyword));
    if (targetProject) {
      logToBoth('success', `[P11] 找到"${targetProject.text}" @ (${targetProject.centerX}, ${targetProject.centerY}) [重试 ${attempt}/${MAX_RETRIES}]`);
      await humanTap(targetProject.centerX, targetProject.centerY);
      return { ok: true };
    }
    if (attempt < MAX_RETRIES) {
      logToBoth('warn', `[P11] 第 ${attempt}/${MAX_RETRIES} 次未找到"${keyword}"（节点数=${lastNodeCount}），等 1.5s 再试`);
      await delay(1500);
    }
  }

  // 3 次重试后仍找不到 → 兜底坐标
  const stepName = ctx.round === 1 ? 'selectProject_round1' : 'selectProject_round2';
  const fallback = await getTapCoord(stepName);
  logToBoth('warn', `[P11] 3 次重试后仍未找到"${keyword}"（最后节点数=${lastNodeCount}），使用备用坐标 (${fallback.x}, ${fallback.y}) px (按机型, 第 ${ctx.round} 轮)`);
  await humanTap(fallback.x, fallback.y);
  await maybePause();
  return { ok: true };
};