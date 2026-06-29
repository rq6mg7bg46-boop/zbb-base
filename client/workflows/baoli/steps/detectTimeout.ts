// client/workflows/baoli/steps/detectTimeout.ts
// 保利 P16c：超时 30s 重试检测（v2 设计文档 §3 + W9 老板拍板）
// 来源：BaoliService.ts detectResult() L388-411

import type { StepFn } from '@/engine';
import { zbbAutomation } from '@/actions/_internal';
import { delay } from '@/actions';
import { logToBoth } from '@/services/AutomationLogger';
import type { BaoliContext } from '../types';

/**
 * P16c：超时重试检测（30s / 6 次 × 5s）
 * 如果 P16a/P16b 已命中（detectState != 'pending'）→ 跳过
 * 否则进入 30s 重试循环 → 命中设状态 / 跑完设 timeout
 */
export const detectTimeoutStep: StepFn<BaoliContext, void> = async (ctx) => {
  // P16a/P16b 已命中，跳过
  if (ctx.detectState !== 'pending') {
    logToBoth('info', `[P16c] P16a/P16b 已命中（${ctx.detectState}），跳过超时重试`);
    return { ok: true };
  }

  logToBoth('warn', '[P16c-超时] 未检测到预期结果，提示用户手动确认...');
  await zbbAutomation.showToast('未检测到结果，请手动确认！');

  ctx.detectStartTime = Date.now();

  for (let i = 0; i < 6; i++) {
    await delay(5000);
    if (Date.now() - ctx.detectStartTime >= 30000) break;

    const nodes = await ctx.baoliService.printScreenText();

    const repeat = nodes?.find((n: { text: string }) =>
      n.text.includes('疑似重号') || n.text.includes('重复')
    );
    if (repeat) {
      ctx.detectState = 'repeat';
      ctx.detectRetryCount = i + 1;
      logToBoth('success', '[P16c-超时-重试] 用户操作后检测到疑似重号');
      return { ok: true };
    }

    const success = nodes?.find((n: { text: string }) =>
      n.text.includes('防截客中') || n.text.includes('已报备')
    );
    if (success) {
      ctx.detectState = 'success';
      ctx.detectRetryCount = i + 1;
      logToBoth('success', '[P16c-超时-重试] 用户操作后检测到报备成功');
      return { ok: true };
    }

    ctx.detectRetryCount = i + 1;
    logToBoth('warn', `[P16c-超时-重试] 第${i + 1}次重试，未检测到结果...`);
  }

  ctx.detectState = 'timeout';
  logToBoth('warn', '[P16c-超时] 30秒内未检测到结果，流程结束，保持当前界面');
  return { ok: true };
};