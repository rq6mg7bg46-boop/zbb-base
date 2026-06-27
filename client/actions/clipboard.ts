// client/actions/clipboard.ts
// 剪贴板类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';

/**
 * readClipboard() - 读取剪贴板内容
 * 复用于 v1.6.4 千机 step1 校验剪贴板是否已写入客户信息（debug 用途）
 */
export async function readClipboard(): Promise<ActionResult<string>> {
  try {
    const text = await zbbAutomation.getClipboardText();
    return { ok: true, data: text };
  } catch (e) {
    return { ok: false, error: new ActionError('readClipboard', e) };
  }
}

/**
 * writeClipboard(text) - 写入剪贴板
 * 复用于保利步骤 7 千机端写入客户信息 / v2 pasteFromClipboard 内联调用
 * 注：pasteFromClipboard 已封装 writeClipboard，长流程业务也可直接用此 Action
 */
export async function writeClipboard(text: string): Promise<ActionResult> {
  try {
    const ok = await zbbAutomation.setClipboardText(text);
    if (!ok) return { ok: false, error: new ActionError('writeClipboard', null, '写入剪贴板失败') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('writeClipboard', e) };
  }
}