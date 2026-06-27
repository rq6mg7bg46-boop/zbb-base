// client/actions/showToast.ts
// Toast 提示类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';

/**
 * showToast(message, isLong?) - 显示 Toast 提示
 * - isLong=true 时加 ⚠️ 前缀（紧急提示）
 * 复用于保利步骤 13 报备失败兜底：zbbAutomation.showToast('⚠️ 粘贴失败：xxx\n已启动 30S 循环震动 + 浮窗 GO 按钮')
 */
export async function showToast(
  message: string,
  isLong: boolean = false
): Promise<ActionResult> {
  try {
    const text = isLong ? `⚠️ ${message}` : message;
    const ok = await zbbAutomation.showToast(text);
    if (!ok) return { ok: false, error: new ActionError('showToast', null, '显示 Toast 失败') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('showToast', e) };
  }
}