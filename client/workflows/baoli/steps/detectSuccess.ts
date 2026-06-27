// client/workflows/baoli/steps/detectSuccess.ts
// 保利 P16b：检测报备成功（v2 设计文档 §3 + W9 老板拍板）
// 来源：BaoliService.ts detectResult() L376-378 + L384-387

import type { StepFn } from '@/engine';
import { logToBoth } from '@/services/AutomationLogger';
import type { BaoliContext } from '../types';

/**
 * P16b：检测报备成功
 * 如果 P16a 已命中（detectState='repeat'）→ 跳过
 * 否则抓节点 → 检测'防截客中'/'已报备' → ctx.detectState = 'success'（或保持 pending）
 */
export const detectSuccessStep: StepFn<BaoliContext, void> = async (ctx) => {
  // P16a 已命中，跳过
  if (ctx.detectState === 'repeat') {
    logToBoth('info', '[P16b] P16a 已命中疑似重号，跳过成功检测');
    return { ok: true };
  }

  logToBoth('info', `[P16b] 检测报备成功（第${ctx.detectRound}轮）...`);
  const nodes = await ctx.baoliService.printScreenText();

  const successNode = nodes?.find((n: { text: string }) =>
    n.text.includes('防截客中') || n.text.includes('已报备')
  );

  if (successNode) {
    ctx.detectState = 'success';
    logToBoth('success', '[P16b-情况2] 检测到报备成功');
  } else {
    logToBoth('info', '[P16b] 未检测到报备成功，进入 P16c 超时检测');
  }

  return { ok: true };
};