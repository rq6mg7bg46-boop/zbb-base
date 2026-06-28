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

/**
 * clearRecentTasks() - 按最近任务键 + 点"全部清除"按钮 + 退出 + 循环 2 次
 * W11 老板拍板 2026-06-28：vivo shell force-stop 没权限（root 限制），
 *   改用 Recents 全部清除按钮（视觉可达，不依赖 shell 权限）
 * 循环 2 次：第一次清除 + 第二次保底（部分 OEM 第一次未生效）
 *
 * 适配：vivo (OriginOS) / 华为 (EMUI) / 小米 (MIUI) 等"全部清除"按钮
 */
export async function clearRecentTasks(): Promise<ActionResult> {
  for (let round = 1; round <= 2; round++) {
    // 1. 按 Recent Tasks 键（左下角多功能键）
    const pressed = await zbbAutomation.pressRecentApps();
    if (!pressed) {
      return { ok: false, error: new ActionError('clearRecentTasks', null, `第 ${round} 轮：按 Recents 键失败`) };
    }
    await zbbAutomation.delay(1500); // 等 Recents 页动画
    
    // 2. 找"全部清除"按钮并点击
    const nodes = await zbbAutomation.getAllTextNodes();
    const clearBtn = (nodes as any[]).find((n: any) => {
      const t = (n.text || '').trim();
      return t === '全部清除' || t === '清除' || t === '一键清除' || t === '清空' || t.includes('全部清除');
    });
    if (!clearBtn) {
      console.log(`[clearRecentTasks] 第 ${round} 轮：未找到"全部清除"按钮（可能已清空）`);
    } else {
      await zbbAutomation.tap(Math.round(clearBtn.centerX), Math.round(clearBtn.centerY));
      console.log(`[clearRecentTasks] 第 ${round} 轮：点击"全部清除" @ (${Math.round(clearBtn.centerX)}, ${Math.round(clearBtn.centerY)})`);
    }
    
    // 3. 退出 Recents 页（按 Home）
    await zbbAutomation.pressHomeKey();
    await zbbAutomation.delay(1000);
  }
  return { ok: true };
}