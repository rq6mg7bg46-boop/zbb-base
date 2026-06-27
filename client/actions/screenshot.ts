// client/actions/screenshot.ts
// 截图类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';

/**
 * takeScreenshot() - 截取当前屏幕（返回 Base64 编码图片）
 * 备用 Action：v1.6.4 OCR 已被老板否决（06-26），但 debug / 错误日志截图仍可能用到
 */
export async function takeScreenshot(): Promise<ActionResult<string>> {
  try {
    const base64 = await zbbAutomation.takeScreenshotBase64();
    if (!base64) return { ok: false, error: new ActionError('takeScreenshot', null, '截图返回空（可能 MediaProjection 未授权）') };
    return { ok: true, data: base64 };
  } catch (e) {
    return { ok: false, error: new ActionError('takeScreenshot', e) };
  }
}

/**
 * saveScreenshot() - 截图并保存（带文字节点标注）
 * 返回文件路径
 * 备用 Action：W6 GO 按钮机制可能用到（v2 设计文档 §6.2 GO 失败截图存档）
 */
export async function saveScreenshot(): Promise<ActionResult<string>> {
  try {
    const result = await zbbAutomation.screenshotAndMark();
    if (!result) return { ok: false, error: new ActionError('saveScreenshot', null, '截图+标注失败') };
    return { ok: true, data: result.path };
  } catch (e) {
    return { ok: false, error: new ActionError('saveScreenshot', e) };
  }
}