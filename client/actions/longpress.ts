// client/actions/longpress.ts
// 长按类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult, NodeTarget } from './types';
import { findText } from './find';

/**
 * longPress(target, ms?) - 长按 target 节点 ms 毫秒
 * 触发 EMUI/OriginOS 系统弹窗（粘贴/复制/全选）
 * 复用于保利步骤 8 长按"客户联系方式"输入框
 */
export async function longPress(
  target: NodeTarget,
  ms: number = 1000
): Promise<ActionResult> {
  let coord: { x: number; y: number };
  if (target.kind === 'coord') {
    coord = { x: target.x, y: target.y };
  } else if (target.kind === 'text') {
    const r = await findText(target.text);
    if (!r.ok || !r.data) return { ok: false, error: new ActionError('longPress.findText', null, `"${target.text}" 未找到`) };
    coord = { x: r.data.centerX, y: r.data.centerY };
  } else {
    return { ok: false, error: new ActionError('longPress', null, `desc 查找待 W6 adapters/ 实现`) };
  }
  try {
    await zbbAutomation.longClick(coord.x, coord.y, ms, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('longPress.click', e) };
  }
}