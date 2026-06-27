// client/actions/app.ts
// 应用控制类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';

/**
 * openApp(packageName, activityClass?) - 启动应用
 * - activityClass 缺省时用 launchApp（Intent ACTION_MAIN）
 * - activityClass 提供时用 launchAppWithMonkey（绕过部分启动限制）
 * 复用于保利步骤 2 启动企业微信（fallback）+ 千机 step1 启动千机 App
 */
export async function openApp(
  packageName: string,
  activityClass?: string
): Promise<ActionResult> {
  try {
    const ok = activityClass
      ? await zbbAutomation.launchAppWithMonkey(packageName, activityClass)
      : await zbbAutomation.launchApp(packageName);
    if (!ok) {
      return { ok: false, error: new ActionError('openApp', null, `启动应用失败: ${packageName}`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('openApp', e) };
  }
}

/**
 * backToHome() - 按 Home 键退出到桌面
 * v1.6.4 千机步骤 4 + 保利步骤 1 用，老板 06-27 拍板"双重 Home 双保险"
 * 注：实际实现是 zbbAutomation.pressHomeKey（不调 pressHome，pressHome 是 pressHomeKey 别名）
 */
export async function backToHome(): Promise<ActionResult> {
  try {
    const ok = await zbbAutomation.pressHomeKey();
    if (!ok) return { ok: false, error: new ActionError('backToHome', null, '按 Home 键失败') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('backToHome', e) };
  }
}

/**
 * closeApp(packageName) - 强制停止应用进程
 * 用于千机/保利互相切换前先关闭对方 App，避免双开导致界面混乱
 */
export async function closeApp(packageName: string): Promise<ActionResult> {
  try {
    const ok = await zbbAutomation.forceStopPackage(packageName);
    if (!ok) return { ok: false, error: new ActionError('closeApp', null, `强制停止失败: ${packageName}`) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('closeApp', e) };
  }
}

/**
 * pressBack() - 按返回键
 * 用于应用内导航回退（保利步骤 14/15 偶尔用）
 */
export async function pressBack(): Promise<ActionResult> {
  try {
    const ok = await zbbAutomation.pressBack();
    if (!ok) return { ok: false, error: new ActionError('pressBack', null, '按返回键失败') };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: new ActionError('pressBack', e) };
  }
}