/**
 * ZBB 原生模块导出
 * 
 * 导出包含两个部分：
 * 1. ZBBAutomation 原生模块（直接调用原生方法）
 * 2. 便捷函数（封装后的简化 API）
 */

import { NativeModules, Platform, NativeEventEmitter, EmitterSubscription } from 'react-native';

// 直接获取模块
const ZBBAutomation = NativeModules.ZBBAutomation;

// 调试日志
console.log('[ZBB] Platform.OS:', Platform.OS);
console.log('[ZBB] NativeModules:', NativeModules);
console.log('[ZBB] ZBBAutomation:', ZBBAutomation);

if (!ZBBAutomation) {
  console.error('[ZBB] 错误: ZBBAutomation 模块未找到！');
}

// ==================== 类型定义 ====================

export interface ElementInfo {
  found: boolean;
  text?: string;
  contentDescription?: string;
  clickable?: boolean;
  enabled?: boolean;
  boundsLeft?: number;
  boundsTop?: number;
  boundsRight?: number;
  boundsBottom?: number;
  boundsCenterX?: number;
  boundsCenterY?: number;
  bounds?: { left: number; top: number; right: number; bottom: number };
  viewId?: string;
  packageName?: string;
  className?: string;
}

export interface ClickableElement extends ElementInfo {
  index: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AccessibilityServiceStatus {
  isRunning: boolean;
  isEnabled: boolean;
  timestamp: number;
}

// ==================== zbbAutomation 对象 ====================

/**
 * zbbAutomation - 原生模块封装对象
 * 包含所有原生方法调用
 */
const zbbAutomation = {
  // 检查模块是否存在
  isAvailable: !!ZBBAutomation,

  // ==================== 服务状态方法 ====================
  
  /**
   * 检查无障碍服务是否运行
   */
  isServiceRunning: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.isAccessibilityServiceRunning();
    } catch (error) {
      console.error('[ZBB] 检查服务状态失败:', error);
      return false;
    }
  },

  /**
   * 打开无障碍服务设置
   */
  openAccessibilitySettings: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.openAccessibilitySettings();
    } catch (error) {
      console.error('[ZBB] 打开设置失败:', error);
      return false;
    }
  },

  /**
   * 启动指定应用
   * @param packageName 应用包名，如 "com.ss.android.ume" (抖音)
   */
  launchApp: async (packageName: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      console.log(`[ZBB] 正在启动应用: ${packageName}`);
      return await ZBBAutomation.launchApp(packageName);
    } catch (error) {
      console.error('[ZBB] 启动应用失败:', error);
      return false;
    }
  },

  /**
   * 使用 monkey 命令启动应用（更可靠）
   * @param packageName 应用包名，如 "com.tencent.wework" (企业微信)
   * @param mainActivityClass 主 Activity 类名，如 "com.tencent.wework/.ui.index.SplashActivity"
   */
  launchAppWithMonkey: async (packageName: string, mainActivityClass: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      console.log(`[ZBB] 使用 monkey 启动应用: ${packageName}`);
      return await ZBBAutomation.launchAppWithMonkey(packageName, mainActivityClass);
    } catch (error) {
      console.error('[ZBB] monkey 启动应用失败:', error);
      return false;
    }
  },

  /**
   * 使用 AccessibilityService 权限启动应用
   * @param packageName 应用包名
   * @param mainActivityClass 主 Activity 类名
   */
  launchAppWithAmStart: async (packageName: string, mainActivityClass: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      console.log(`[ZBB] 使用 AccessibilityService 启动应用: ${packageName}/${mainActivityClass}`);
      return await ZBBAutomation.launchAppWithAmStart(packageName, mainActivityClass);
    } catch (error) {
      console.error('[ZBB] AccessibilityService 启动应用失败:', error);
      return false;
    }
  },

  /**
   * 请求 MediaProjection 权限（用于屏幕截图）
   * 必须在使用 OCR 功能前调用
   */
  requestMediaProjectionPermission: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      console.log('[ZBB] 请求 MediaProjection 权限...');
      return await ZBBAutomation.requestMediaProjectionPermission();
    } catch (error) {
      console.error('[ZBB] 请求 MediaProjection 权限失败:', error);
      return false;
    }
  },

  /**
   * 检查 MediaProjection 权限是否已授权
   * 用于在 OCR 操作前检测权限是否有效
   */
  isMediaProjectionEnabled: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.isMediaProjectionEnabled();
    } catch (error) {
      console.error('[ZBB] 检查 MediaProjection 权限失败:', error);
      return false;
    }
  },

  /**
   * 截取当前屏幕
   * @returns Base64编码的图片数据
   */
  takeScreenshotBase64: async (): Promise<string | null> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return null;
    }
    try {
      return await ZBBAutomation.takeScreenshotBase64();
    } catch (error) {
      console.error('[ZBB] 截屏失败:', error);
      return null;
    }
  },

  /**
   * 识别屏幕上的文字
   * @returns 识别到的文字列表
   */
  recognizeText: async (): Promise<string[]> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return [];
    }
    try {
      return await ZBBAutomation.recognizeText();
    } catch (error) {
      console.error('[ZBB] OCR识别失败:', error);
      return [];
    }
  },

  /**
   * 识别屏幕上的文字及其位置
   * @returns 包含文字和坐标的数组
   */
  recognizeTextWithPosition: async (): Promise<Array<{
    text: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    centerX: number;
    centerY: number;
    bounds: { left: number; top: number; right: number; bottom: number };
  }>> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return [];
    }
    try {
      return await ZBBAutomation.recognizeTextWithPosition();
    } catch (error) {
      console.error('[ZBB] OCR识别失败:', error);
      return [];
    }
  },

  /**
   * 检查屏幕上是否包含指定文字
   * @param targetText 要查找的文字
   * @returns true表示找到
   */
  screenContainsText: async (targetText: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.screenContainsText(targetText);
    } catch (error) {
      console.error('[ZBB] 检查文字失败:', error);
      return false;
    }
  },

  /**
   * 使用 MLKit OCR 查找指定文字的位置
   * 返回文字的中心坐标
   */
  findTextByMLKit: async (targetText: string): Promise<{
    found: boolean;
    text?: string;
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    centerX?: number;
    centerY?: number;
  }> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return { found: false };
    }
    try {
      return await ZBBAutomation.findTextByMLKit(targetText);
    } catch (error) {
      console.error('[ZBB] MLKit 查找文字失败:', error);
      return { found: false };
    }
  },

  /**
   * 使用 MLKit OCR 查找指定文字的位置（带权限检查和自动切换应用）
   * 权限无效时会请求授权，授权后自动切换到目标应用再截图
   * 
   * @param targetText 要查找的文字
   * @param packageName 目标应用包名，如 "com.tencent.mm" (微信)
   * @returns 文字位置信息
   */
  findTextByMLKitWithPermission: async (
    targetText: string,
    packageName: string
  ): Promise<{
    found: boolean;
    text?: string;
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    centerX?: number;
    centerY?: number;
  }> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return { found: false };
    }
    try {
      console.log(`[ZBB] findTextByMLKitWithPermission: ${targetText}, ${packageName}`);
      return await ZBBAutomation.findTextByMLKitWithPermission(targetText, packageName);
    } catch (error) {
      console.error('[ZBB] MLKit 查找文字（带权限）失败:', error);
      return { found: false };
    }
  },

  // ==================== 屏幕操作方法 ====================

  /**
   * 截图
   */
  takeScreenshot: async (): Promise<string | null> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return null;
    }
    try {
      return await ZBBAutomation.takeScreenshot();
    } catch (error) {
      console.error('[ZBB] 截图失败:', error);
      return null;
    }
  },

  /**
   * 获取屏幕尺寸
   */
  getScreenSize: async (): Promise<{ width: number; height: number } | null> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return null;
    }
    try {
      return await ZBBAutomation.getScreenSize();
    } catch (error) {
      console.error('[ZBB] 获取屏幕尺寸失败:', error);
      return null;
    }
  },

  /**
   * 获取当前包名
   */
  getCurrentPackageName: async (): Promise<string | null> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return null;
    }
    try {
      return await ZBBAutomation.getCurrentPackageName();
    } catch (error) {
      console.error('[ZBB] 获取包名失败:', error);
      return null;
    }
  },

  // ==================== 点击操作方法 ====================

  /**
   * 点击坐标
   */
  click: async (x: number, y: number): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.click(x, y);
    } catch (error) {
      console.error('[ZBB] 点击失败:', error);
      return false;
    }
  },

  /**
   * 点击坐标 (tap 的别名)
   */
  tap: async (x: number, y: number): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.click(x, y);
    } catch (error) {
      console.error('[ZBB] 点击失败:', error);
      return false;
    }
  },

  /**
   * 长按坐标
   * @param x X坐标
   * @param y Y坐标
   * @param duration 按住时长（毫秒），默认1000
   * @param isLongPress 是否是长按，默认true
   */
  longClick: async (x: number, y: number, duration: number = 1000, isLongPress: boolean = true): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.longClick(x, y, duration, isLongPress);
    } catch (error) {
      console.error('[ZBB] 长按失败:', error);
      return false;
    }
  },

  /**
   * 长按坐标 (longClick 的别名)
   */
  longPress: async (x: number, y: number, duration: number = 1000): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.longClick(x, y, duration, true);
    } catch (error) {
      console.error('[ZBB] 长按失败:', error);
      return false;
    }
  },

  /**
   * 带视觉反馈的点击（涟漪效果 + 震动）
   * @param x X坐标
   * @param y Y坐标
   * @param showRipple 是否显示涟漪效果，默认true
   * @param vibrate 是否震动反馈，默认true
   */
  clickWithVisualFeedback: async (
    x: number,
    y: number,
    showRipple: boolean = true,
    vibrate: boolean = true
  ): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.clickWithVisualFeedback(x, y, showRipple, vibrate);
    } catch (error) {
      console.error('[ZBB] 视觉反馈点击失败:', error);
      // 降级到普通点击
      return await ZBBAutomation.click(x, y);
    }
  },

  /**
   * 按文本点击
   */
  clickByText: async (text: string, isLongPress: boolean = false): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.clickByText(text, isLongPress);
    } catch (error) {
      console.error('[ZBB] 按文本点击失败:', error);
      return false;
    }
  },

  /**
   * 按 View ID 点击
   */
  clickByViewId: async (viewId: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.clickByViewId(viewId);
    } catch (error) {
      console.error('[ZBB] 按 ID 点击失败:', error);
      return false;
    }
  },

  // ==================== 手势操作方法 ====================

  /**
   * 滑动
   */
  swipe: async (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500
  ): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.swipe(startX, startY, endX, endY, duration);
    } catch (error) {
      console.error('[ZBB] 滑动失败:', error);
      return false;
    }
  },

  /**
   * 使用Shell命令滑动（绕过无障碍服务限制）
   */
  swipeShell: async (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500
  ): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.swipeShell(startX, startY, endX, endY, duration);
    } catch (error) {
      console.error('[ZBB] Shell滑动失败:', error);
      return false;
    }
  },

  /**
   * 发送KeyEvent（如按Home键 keycode=3，按返回键 keycode=4）
   */
  keyevent: async (keyCode: number): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.keyevent(keyCode);
    } catch (error) {
      console.error('[ZBB] KeyEvent失败:', error);
      return false;
    }
  },

  /**
   * 使用 screencap Shell 截图并保存到文件
   * @param filePath 保存路径
   */
  screencapShell: async (filePath: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.screencapShell(filePath);
    } catch (error) {
      console.error('[ZBB] 截图失败:', error);
      return false;
    }
  },

  /**
   * 使用 screencap 命令截图并保存到指定路径（绕过 WebView 保护）
   * screencap 直接读取 framebuffer，exitCode=1 表示权限不足或 framebuffer 不可读
   */
  screencapShellBase64: async (filePath: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.screencapShellBase64(filePath);
    } catch (error) {
      console.error('[ZBB] 截图失败:', error);
      return false;
    }
  },

  /**
   * 使用 MediaStore API 截图
   */
  screenshotViaMediaStore: async (): Promise<string | boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.screenshotViaMediaStore();
    } catch (error) {
      console.error('[ZBB] MediaStore截图失败:', error);
      return false;
    }
  },

  /**
   * 使用帧缓冲区截图（绕过 WebView 保护）
   */
  screenshotViaFramebuffer: async (): Promise<string | boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.screenshotViaFramebuffer();
    } catch (error) {
      console.error('[ZBB] Framebuffer截图失败:', error);
      return false;
    }
  },

  /**
   * 停止震动
   */
  stopVibration: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.stopVibration();
    } catch (error) {
      console.error('[ZBB] 停止震动失败:', error);
      return false;
    }
  },

  /**
   * 开始脉冲震动
   */
  startPulseVibration: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.startPulseVibration();
    } catch (error) {
      console.error('[ZBB] 开始脉冲震动失败:', error);
      return false;
    }
  },

  /**
   * 下拉刷新
   */
  pullToRefresh: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.pullToRefresh();
    } catch (error) {
      console.error('[ZBB] 下拉刷新失败:', error);
      return false;
    }
  },

  /**
   * 向上滚动
   */
  scrollUp: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.scrollUp();
    } catch (error) {
      console.error('[ZBB] 向上滚动失败:', error);
      return false;
    }
  },

  /**
   * 向下滚动
   */
  scrollDown: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.scrollDown();
    } catch (error) {
      console.error('[ZBB] 向下滚动失败:', error);
      return false;
    }
  },

  // ==================== 文本操作方法 ====================

  /**
   * 输入文本
   */
  inputText: async (text: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.inputText(text);
    } catch (error) {
      console.error('[ZBB] 输入文本失败:', error);
      return false;
    }
  },

  /**
   * 清空输入框
   */
  clearInput: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.clearInput();
    } catch (error) {
      console.error('[ZBB] 清空输入失败:', error);
      return false;
    }
  },

  /**
   * 粘贴文本
   */
  pasteText: async (text: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.pasteText(text);
    } catch (error) {
      console.error('[ZBB] 粘贴文本失败:', error);
      return false;
    }
  },

  /**
   * 设置剪贴板
   */
  setClipboardText: async (text: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.setClipboardText(text);
    } catch (error) {
      console.error('[ZBB] 设置剪贴板失败:', error);
      return false;
    }
  },

  /**
   * 获取剪贴板
   */
  getClipboardText: async (): Promise<string> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return '';
    }
    try {
      return await ZBBAutomation.getClipboardText();
    } catch (error) {
      console.error('[ZBB] 获取剪贴板失败:', error);
      return '';
    }
  },

  // ==================== 导航操作方法 ====================

  /**
   * 按返回键
   */
  pressBack: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.pressBack();
    } catch (error) {
      console.error('[ZBB] 按返回键失败:', error);
      return false;
    }
  },

  /**
   * 按 Home 键
   */
  pressHome: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.pressHome();
    } catch (error) {
      console.error('[ZBB] 按 Home 键失败:', error);
      return false;
    }
  },

  /**
   * 按最近任务键
   */
  pressRecentApps: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.pressRecentApps();
    } catch (error) {
      console.error('[ZBB] 按最近任务键失败:', error);
      return false;
    }
  },

  // ==================== 进程管理方法 ====================

  /**
   * 后台强制停止指定应用进程（保留界面截图）
   * @param packageName 应用包名，如 "com.zbb.automation"
   */
  forceStopPackage: async (packageName: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      console.log('[ZBB] 强制停止应用: ' + packageName);
      return await ZBBAutomation.forceStopPackage(packageName);
    } catch (error) {
      console.error('[ZBB] 强制停止应用失败:', error);
      return false;
    }
  },

  /**
   * 后台强制停止 ZBB 自动化 APP（不杀企微）
   */
  killZbbProcess: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      console.log('[ZBB] 后台杀掉 ZBB 进程...');
      return await ZBBAutomation.forceStopPackage('com.zbb.automation');
    } catch (error) {
      console.error('[ZBB] 杀掉 ZBB 进程失败:', error);
      return false;
    }
  },

  // ==================== 元素查找方法 ====================

  /**
   * 按文本查找元素
   */
  findElementByText: async (text: string): Promise<ElementInfo> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return { found: false };
    }
    try {
      return await ZBBAutomation.findElementByText(text);
    } catch (error) {
      console.error('[ZBB] 按文本查找元素失败:', error);
      return { found: false };
    }
  },

  /**
   * 获取当前界面所有文字节点及其坐标
   */
  getAllTextNodes: async (): Promise<Array<{ text: string; centerX: number; centerY: number; type: string }>> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return [];
    }
    try {
      return await ZBBAutomation.getAllTextNodes();
    } catch (error) {
      console.error('[ZBB] 获取所有文字节点失败:', error);
      return [];
    }
  },

  /**
   * 按文字查找单个节点中心坐标（直接调用native，速度快）
   */
  findNodeCenterByText: async (text: string): Promise<{ centerX: number; centerY: number; text: string } | null> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return null;
    }
    try {
      return await ZBBAutomation.findNodeCenterByText(text);
    } catch (error) {
      console.error('[ZBB] 查找节点失败:', error);
      return null;
    }
  },

  /**
   * 按 Home 键退出到桌面
   */
  pressHomeKey: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.pressHomeKey();
    } catch (error) {
      console.error('[ZBB] pressHomeKey 失败:', error);
      return false;
    }
  },

  /**
   * 按 View ID 查找元素
   */
  findElementByViewId: async (viewId: string): Promise<ElementInfo> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return { found: false };
    }
    try {
      return await ZBBAutomation.findElementByViewId(viewId);
    } catch (error) {
      console.error('[ZBB] 按 ID 查找元素失败:', error);
      return { found: false };
    }
  },

  /**
   * 等待元素出现
   */
  waitForElement: async (
    text?: string,
    viewId?: string,
    timeout: number = 5000
  ): Promise<ElementInfo> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return { found: false };
    }
    try {
      return await ZBBAutomation.waitForElement(text, viewId, timeout);
    } catch (error) {
      console.error('[ZBB] 等待元素失败:', error);
      return { found: false };
    }
  },

  /**
   * 获取可点击元素列表
   */
  getClickableElements: async (): Promise<ElementInfo[]> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return [];
    }
    try {
      return await ZBBAutomation.getClickableElements();
    } catch (error) {
      console.error('[ZBB] 获取可点击元素失败:', error);
      return [];
    }
  },

  // ==================== 校准功能：点击坐标获取 ====================

  /**
   * 获取最后记录的点击坐标
   * 用于校准功能
   */
  getLastClickCoordinates: async (): Promise<{ found: boolean; x?: number; y?: number }> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return { found: false };
    }
    try {
      return await ZBBAutomation.getLastClickCoordinates();
    } catch (error) {
      console.error('[ZBB] 获取点击坐标失败:', error);
      return { found: false };
    }
  },

  /**
   * 获取最近的点击坐标（指定时间范围内）
   * @param maxAgeMs 最大时间范围（毫秒），默认5000ms
   */
  getRecentClick: async (maxAgeMs: number = 5000): Promise<{ found: boolean; x?: number; y?: number }> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return { found: false };
    }
    try {
      return await ZBBAutomation.getRecentClick(maxAgeMs);
    } catch (error) {
      console.error('[ZBB] 获取最近点击失败:', error);
      return { found: false };
    }
  },

  /**
   * 清除点击历史
   */
  clearClickHistory: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.clearClickHistory();
    } catch (error) {
      console.error('[ZBB] 清除点击历史失败:', error);
      return false;
    }
  },

  /**
   * 获取点击历史
   */
  getClickHistory: async (): Promise<Array<{ x: number; y: number }>> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return [];
    }
    try {
      return await ZBBAutomation.getClickHistory();
    } catch (error) {
      console.error('[ZBB] 获取点击历史失败:', error);
      return [];
    }
  },

  // ==================== 诊断功能 ====================

  /**
   * 导出当前窗口的节点树到日志
   * 用于诊断"找不到元素"的问题
   */
  dumpWindowTree: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.dumpWindowTree();
    } catch (error) {
      console.error('[ZBB] 导出节点树失败:', error);
      return false;
    }
  },

  /**
   * 查找所有包含指定文本的元素
   */
  dumpWindowTreeString: async (): Promise<string> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return '';
    }
    try {
      return await ZBBAutomation.dumpWindowTreeString();
    } catch (error) {
      console.error('[ZBB] 导出节点树字符串失败:', error);
      return '';
    }
  },

  findElementsByText: async (text: string): Promise<ElementInfo[]> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return [];
    }
    try {
      return await ZBBAutomation.findElementsByText(text);
    } catch (error) {
      console.error('[ZBB] 查找元素失败:', error);
      return [];
    }
  },

  // ==================== 其他方法 ====================

  /**
   * 延时
   */
  delay: async (ms: number): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.delay(ms);
    } catch (error) {
      console.error('[ZBB] 延时失败:', error);
      return false;
    }
  },

  /**
   * 显示 Toast
   */
  showToast: async (message: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.showToast(message);
    } catch (error) {
      console.error('[ZBB] 显示 Toast 失败:', error);
      return false;
    }
  },

  // ==================== 悬浮窗控制 ====================

  /**
   * 显示悬浮窗
   */
  showFloatingWindow: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.showFloatingWindow();
    } catch (error) {
      console.error('[ZBB] 显示悬浮窗失败:', error);
      return false;
    }
  },

  /**
   * 隐藏悬浮窗
   */
  hideFloatingWindow: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.hideFloatingWindow();
    } catch (error) {
      console.error('[ZBB] 隐藏悬浮窗失败:', error);
      return false;
    }
  },

  /**
   * 更新悬浮窗步骤
   */
  updateFloatingStep: async (
    stepName: string,
    stepIndex: number,
    totalSteps: number = 14
  ): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.updateFloatingStep(stepName, stepIndex, totalSteps);
    } catch (error) {
      console.error('[ZBB] 更新悬浮窗步骤失败:', error);
      return false;
    }
  },

  /**
   * 更新悬浮窗 APP 信息
   */
  updateFloatingAppInfo: async (appName: string): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.updateFloatingAppInfo(appName);
    } catch (error) {
      console.error('[ZBB] 更新悬浮窗 APP 信息失败:', error);
      return false;
    }
  },

  /**
   * 设置悬浮窗完成状态
   */
  setFloatingComplete: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.setFloatingComplete();
    } catch (error) {
      console.error('[ZBB] 设置悬浮窗完成状态失败:', error);
      return false;
    }
  },

  /**
   * 停止自动化流程
   */
  stopAutomation: async (): Promise<boolean> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return false;
    }
    try {
      return await ZBBAutomation.stopAutomation();
    } catch (error) {
      console.error('[ZBB] 停止自动化流程失败:', error);
      return false;
    }
  },

  // ==================== 截图标注功能 ====================

  /**
   * 截图并标出所有文字的坐标
   * 功能：截图 -> OCR识别 -> 在图片上绘制边框和坐标标注 -> 保存
   * 返回：{ path: string, textCount: number, texts: Array }
   */
  screenshotAndMark: async (): Promise<{
    path: string;
    textCount: number;
    texts: Array<{
      index: number;
      text: string;
      centerX: number;
      centerY: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>;
  } | null> => {
    if (!ZBBAutomation) {
      console.error('[ZBB] 模块未初始化');
      return null;
    }
    try {
      const result = await ZBBAutomation.screenshotAndMark();
      return result;
    } catch (error) {
      console.error('[ZBB] 截图标注失败:', error);
      return null;
    }
  },
};

// ==================== 事件监听 ====================

// 事件发射器单例
let eventEmitter: NativeEventEmitter | null = null;

// 活跃的监听器列表
const activeListeners: EmitterSubscription[] = [];

/**
 * 获取事件发射器实例
 */
function getEventEmitter(): NativeEventEmitter | null {
  if (!ZBBAutomation) {
    return null;
  }
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(ZBBAutomation);
  }
  return eventEmitter;
}

/**
 * 监听自动化停止事件（当用户点击悬浮窗停止按钮时触发）
 */
export const addStopListener = (callback: () => void): EmitterSubscription | null => {
  const emitter = getEventEmitter();
  if (!emitter) {
    console.error('[ZBB] 无法添加停止监听器，模块未初始化');
    return null;
  }

  const subscription = emitter.addListener('onAutomationStopped', () => {
    console.log('[ZBB] 收到停止事件');
    callback();
  });

  activeListeners.push(subscription);
  console.log('[ZBB] 已添加停止监听器');
  return subscription;
};

/**
 * 移除自动化停止事件监听器
 */
export const removeStopListener = (subscription: EmitterSubscription | null): void => {
  if (subscription) {
    subscription.remove();
    const index = activeListeners.indexOf(subscription);
    if (index > -1) {
      activeListeners.splice(index, 1);
    }
    console.log('[ZBB] 已移除停止监听器');
  }
};

// ==================== 导出 ====================

export default zbbAutomation;

// 导出命名版本
export { zbbAutomation };
