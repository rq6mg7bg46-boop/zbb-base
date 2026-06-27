// client/workflows/baoli/steps/detectRepeat.ts
// 保利 P16a：检测疑似重号（v2 设计文档 §3 + W9 老板拍板）
// 来源：BaoliService.ts detectResult() L370-373 + L380-383

import type { StepFn } from '@/engine';
import { logToBoth } from '@/services/AutomationLogger';
import type { BaoliContext } from '../types';

/**
 * P16a：检测疑似重号
 * 抓节点 → 检测'疑似重号'/'重复' → ctx.detectState = 'repeat'（或保持 pending）
 *
 * 不抛错：检测不到就返回 ok=true，让 P16b/P16c 继续
 */
export const detectRepeatStep: StepFn<BaoliContext, void> = async (ctx) => {
  logToBoth('info', `[P16a] 检测疑似重号（第${ctx.detectRound}轮）...`);
  const nodes = await ctx.baoliService.printScreenText();

  const repeatNode = nodes?.find((n: { text: string }) =>
    n.text.includes('疑似重号') || n.text.includes('重复')
  );

  if (repeatNode) {
    ctx.detectState = 'repeat';
    logToBoth('warn', '[P16a-情况1] 检测到疑似重号');
  } else {
    logToBoth('info', '[P16a] 未检测到疑似重号，进入 P16b');
  }

  return { ok: true };
};