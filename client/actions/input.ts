// client/actions/input.ts
// 输入类 Action（v2 设计文档 §5.2）
// 关键 Action：pasteFromClipboard 封装 写入剪贴板→长按→等弹窗→机型分支点击粘贴按钮

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';
import { delay } from './delay';
import { longPress } from './longpress';
import { getPasteMenuCoord } from '@/utils/deviceModel';

/** 输入框 target（只支持 text） */
export type InputTarget = { kind: 'text'; text: string };

/**
 * inputText(text) - 直接调用 native inputText 输入文本
 * 用于：英文短文本 / 数字 / 项目编码
 * ⚠️ 中文 / 长文本 / 特殊字符必须用 pasteFromClipboard（native inputText 不支持中文 IME）
 */
export async function inputText(text: string): Promise<ActionResult> {
  try {
    await zbbAutomation.inputText(text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('inputText', e) };
  }
}

/**
 * pasteFromClipboard(target, text) - 完整粘贴流程
 * 1. 写入剪贴板（zbbAutomation.setClipboardText）
 * 2. 长按输入框 target 触发系统弹窗（EMUI / OriginOS / MIUI 等）
 * 3. 等弹窗显示（800ms）
 * 4. 按机型分支获取弹窗"粘贴"按钮 dp 坐标 + 屏宽归一化转 px + 点击
 *
 * 复用于保利步骤 7 长按"客户联系方式" + 步骤 14 长按"备注"
 * 关键依赖：utils/deviceModel.ts 的 getPasteMenuCoord
 * 历史备注：W6 起计划迁到 adapters/devices.ts（彻底分离 Action 适配层），未执行；当前继续用 deviceModel.ts
 */
export async function pasteFromClipboard(
  target: InputTarget,
  text: string
): Promise<ActionResult> {
  try {
    // 1. 写入剪贴板
    const writeOk = await zbbAutomation.setClipboardText(text);
    if (!writeOk) {
      return { ok: false, error: new ActionError('pasteFromClipboard', null, '写入剪贴板失败') };
    }
    await delay(300);

    // 2. 长按输入框触发系统弹窗
    const longResult = await longPress(target, 1000);
    if (!longResult.ok) {
      return { ok: false, error: new ActionError('pasteFromClipboard', longResult.error, '长按输入框失败') };
    }
    await delay(800);  // 等弹窗显示

    // 3. 按机型分支取弹窗"粘贴" dp 坐标 → 屏宽归一化转 px → 点击
    const dpCoord = await getPasteMenuCoord();
    const pxCoord = await dpToPx(dpCoord.x, dpCoord.y);
    const clickOk = await zbbAutomation.click(pxCoord.x, pxCoord.y);
    if (!clickOk) {
      return { ok: false, error: new ActionError('pasteFromClipboard', null, `点击弹窗"粘贴"坐标 (${pxCoord.x}, ${pxCoord.y}) 失败`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('pasteFromClipboard', e) };
  }
}

/**
 * dpToPx(dpX, dpY) - 按屏宽归一化转 px（360dp 基准，复用于 deviceModel 兜底坐标）
 * 历史备注：W6 起计划迁到 adapters/devices.ts，未执行；v1.6.4 deviceModel.ts 注释里
 *           说 "dpCoord() 已做屏宽归一化" 但实际没提供工具，所以这里内联
 */
async function dpToPx(dpX: number, dpY: number): Promise<{ x: number; y: number }> {
  const screen = await zbbAutomation.getScreenSize();
  if (!screen) return { x: dpX, y: dpY };
  const ratio = screen.width / 360;
  return { x: Math.round(dpX * ratio), y: Math.round(dpY * ratio) };
}