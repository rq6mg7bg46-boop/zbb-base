// client/actions/vibrate.ts
// 震动类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';

/** 默认脉冲震动时长 30s（与 native handler postDelayed 兜底一致） */
const DEFAULT_PULSE_DURATION_MS = 30000;

/**
 * pulseVibration(durationMs?) - 启动脉冲震动 + 定时自动停止
 * 复用于保利步骤 13 报备失败兜底 + 重号模式 L802-822
 * v1.6.4 实战：30s 后自动 stopVibration（防 native 端震动无限循环）
 */
export async function pulseVibration(
  durationMs: number = DEFAULT_PULSE_DURATION_MS
): Promise<ActionResult> {
  try {
    const ok = await zbbAutomation.startPulseVibration();
    if (!ok) return { ok: false, error: new ActionError('pulseVibration', null, '启动脉冲震动失败') };
    setTimeout(() => { void zbbAutomation.stopVibration(); }, durationMs);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('pulseVibration', e) };
  }
}

/**
 * cancelVibration() - 立即停止震动（用户点击 GO 按钮 / GO 回调时调用）
 */
export async function cancelVibration(): Promise<ActionResult> {
  try {
    const ok = await zbbAutomation.stopVibration();
    if (!ok) return { ok: false, error: new ActionError('cancelVibration', null, '停止震动失败') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('cancelVibration', e) };
  }
}

/**
 * vibrateShort(ms?) - 短脉冲震动（默认 200ms）
 * 用于非紧急提示（与 pulseVibration 30s 区分）
 */
export async function vibrateShort(ms: number = 200): Promise<ActionResult> {
  try {
    const ok = await zbbAutomation.startPulseVibration();
    if (!ok) return { ok: false, error: new ActionError('vibrateShort', null, '启动脉冲震动失败') };
    setTimeout(() => { void zbbAutomation.stopVibration(); }, ms);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('vibrateShort', e) };
  }
}