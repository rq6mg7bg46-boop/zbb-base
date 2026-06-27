// client/engine/go.ts
// GO 机制：通用失败恢复（v2 设计文档 §6.2 + 老板 06-26 拍板"通用失败恢复"）

import { zbbAutomation, addScreenshotConfirmedListener } from '@/native';
import { ActionError } from '@/actions';

/** 默认 GO 等待超时（30s 后 handler 兜底 cancel） */
const GO_TIMEOUT_MS = 30_000;

/**
 * waitForUserGo(reason, hint) - 等待用户点 GO 按钮
 * 1. showScreenshotButton 弹 GO 浮窗
 * 2. startPulseVibration 启动 30s 脉冲震动（native handler 自动 stop 兜底）
 * 3. 监听 addScreenshotConfirmedListener → 用户点 GO → resolve
 * 4. 主动 stopVibration（震动也停）
 *
 * v1.6.4 实战参考：
 *   BaoliService.ts:850-862 步骤 9 弹 GO 按钮 → 等点击 → stopVibration
 *   QianjiService.ts 千机步骤 4 弹 GO 按钮 → 屏幕确认
 *
 * @example
 * await waitForUserGo('找不到"工作台"', '请手动下拉刷新');
 */
export async function waitForUserGo(reason: string, hint: string): Promise<void> {
  // 1. 弹 GO 浮窗
  await zbbAutomation.showScreenshotButton();

  // 2. 启动 30s 脉冲震动（native 端 handler 30s 后自动 stop 兜底）
  await zbbAutomation.startPulseVibration();

  // 3. 等待用户点击 GO 按钮
  await new Promise<void>((resolve) => {
    const subscription = addScreenshotConfirmedListener(() => {
      // 4. 主动停震（用户已确认，不用等 30s 兜底）
      void zbbAutomation.stopVibration();
      // 清理 listener（避免内存泄漏）
      if (subscription) {
        subscription.remove();
      }
      resolve();
    });
  });

  // reason/hint 透传给上层日志（v1.6.4 BaoliService L848-849 logToBoth 风格）
  // native.showScreenshotButton 内部浮窗只显示按钮图标，不传 reason/hint
  console.log(`[GO] 用户已确认: ${reason} | ${hint}`);
}

/**
 * withGoOnFail(fn, config) - 单 Action 的 GO 兜底
 * 失败 → waitForUserGo → retry/continue/abort
 *
 * @example
 * const result = await withGoOnFail(
 *   () => findText('工作台'),
 *   { reason: '找不到"工作台"', hint: '请手动下拉', action: 'retry', maxRetries: 3 },
 * );
 */
export async function withGoOnFail<T>(
  fn: () => Promise<T>,
  config: {
    reason: string;
    hint: string;
    action?: 'retry' | 'continue' | 'abort';
    maxRetries?: number;
  }
): Promise<T> {
  const action = config.action ?? 'retry';
  const maxRetries = config.maxRetries ?? 3;

  try {
    return await fn();
  } catch (e) {
    if (action === 'abort') {
      throw e instanceof ActionError ? e : new ActionError('withGoOnFail', e);
    }
    // 第一次失败：等 GO
    await waitForUserGo(config.reason, config.hint);

    // action='continue'：GO 后不再重试，调用方继续
    if (action === 'continue') {
      throw e instanceof ActionError ? e : new ActionError('withGoOnFail', e);
    }

    // action='retry'：maxRetries 次重试，每次失败再 waitForGo
    let lastError: unknown = e;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (e2) {
        lastError = e2;
        if (i < maxRetries - 1) {
          await waitForUserGo(config.reason, config.hint);
        }
      }
    }
    throw lastError instanceof ActionError
      ? lastError
      : new ActionError('withGoOnFail', lastError);
  }
}