// client/actions/app.ts
// 应用控制类 Action（v2 设计文档 §5.2）

import { zbbAutomation } from './_internal';
import { ActionError, ActionResult } from './types';
import { getClearRecentTasksCoord } from '@/utils/deviceModel';

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
 * clearRecentTasks() - 按 Home + Recents + tap 全部清除 + 循环 2 次
 * W11 老板拍板 2026-06-28：vivo shell force-stop 没权限（root 限制），改 Recents 全部清除
 * W16 老板拍板 2026-06-28：流程改为 按 Home（先回桌面，避免从 app 内进入 Recents 卡住）
 *                            + 按 Recents + tap 固定坐标 + 循环 2 次
 * 坐标来源：utils/deviceModel.ts DEVICE_CLEAR_RECENT_TASKS_COORDS
 *   - vivo V2166A 老板 06-28 实测 (530, 1460) px → (265, 730) dp @ ratio=2
 *   - 替代 v2.0.5 动态找节点方案（vivo OriginOS Recents 页文字节点识别率不稳）
 */
export async function clearRecentTasks(): Promise<ActionResult> {
  // 0. 先按 Home（老板 06-28 拍板：避免从 app 内进入 Recents 状态错乱）
  const homeOk0 = await zbbAutomation.pressHomeKey();
  if (!homeOk0) {
    return { ok: false, error: new ActionError('clearRecentTasks', null, '初始按 Home 键失败') };
  }
  await zbbAutomation.delay(800); // 等回桌面动画

  // 取全部清除按钮 dp 坐标（按机型分支）
  const clearCoord = await getClearRecentTasksCoord();
  
  // 取屏宽计算 ratio（dp → px）
  const screen = await zbbAutomation.getScreenSize();
  if (!screen || !screen.width) {
    return { ok: false, error: new ActionError('clearRecentTasks', null, '取屏幕尺寸失败') };
  }
  const ratio = screen.width / 360;
  const pxX = Math.round(clearCoord.x * ratio);
  const pxY = Math.round(clearCoord.y * ratio);
  console.log(`[clearRecentTasks] 清除按钮 dp=(${clearCoord.x}, ${clearCoord.y}) → px=(${pxX}, ${pxY}) (ratio=${ratio})`);

  for (let round = 1; round <= 2; round++) {
    // 1. 按 Home（每轮先确保在桌面）
    const homeOk = await zbbAutomation.pressHomeKey();
    if (!homeOk) {
      return { ok: false, error: new ActionError('clearRecentTasks', null, `第 ${round} 轮：按 Home 键失败`) };
    }
    await zbbAutomation.delay(500);

    // 2. 按 Recent Tasks 键（左下角多功能键）
    const pressed = await zbbAutomation.pressRecentApps();
    if (!pressed) {
      return { ok: false, error: new ActionError('clearRecentTasks', null, `第 ${round} 轮：按 Recents 键失败`) };
    }
    await zbbAutomation.delay(1500); // 等 Recents 页动画
    
    // 3. tap 全部清除按钮（固定坐标，按机型分支）
    const tapOk = await zbbAutomation.tap(pxX, pxY);
    console.log(`[clearRecentTasks] 第 ${round} 轮：tap "全部清除" @ (${pxX}, ${pxY}) px → ${tapOk}`);
    
    // 4. 等清除动画
    await zbbAutomation.delay(1000);
  }
  
  // 5. 最后按 Home 退出（确保回到桌面）
  await zbbAutomation.pressHomeKey();
  await zbbAutomation.delay(500);
  
  return { ok: true };
}