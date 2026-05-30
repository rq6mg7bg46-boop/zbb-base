/**
 * ZBB 原生自动化模块封装
 * 版本: v1.0
 * 
 * 封装 Android 原生无障碍服务，提供 TypeScript/React Native 接口
 */

import { NativeModules, Platform } from 'react-native';

// 直接获取模块（不通过解构，因为 NativeModules 是空对象但 .ZBBAutomation 属性存在）
const ZBBAutomation = NativeModules.ZBBAutomation;

// 调试日志
console.log('=== [ZBB] NativeModules Debug ===');
console.log('[ZBB] Platform.OS:', Platform.OS);
console.log('[ZBB] NativeModules:', NativeModules);
console.log('[ZBB] ZBBAutomation:', ZBBAutomation);

// 检查模块是否存在
if (!ZBBAutomation) {
  console.error('[ZBB] 错误: ZBBAutomation 模块未找到！');
  console.error('[ZBB] 请确保已在 Android 端注册 AutomationPackage');
}

// ==================== 类型定义 ====================

/**
 * 元素信息
 */
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
  bounds?: { left: number; top: number; right: number; bottom: number };
  viewId?: string;
  packageName?: string;
  className?: string;
}

/**
 * 点击选项
 */
export interface ClickOptions {
  x?: number;
  y?: number;
  text?: string;
  viewId?: string;
}

/**
 * 滑动选项
 */
export interface SwipeOptions {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration?: number;
}

// ==================== 导出接口 ====================

/**
 * ZBBAutomation 模块类型定义
 */
export interface ZBBAutomationModule {
  // 服务状态
  isAccessibilityServiceRunning(): Promise<boolean>;
  openAccessibilitySettings(): Promise<boolean>;
  launchApp(packageName: string): Promise<boolean>;
  requestMediaProjectionPermission(): Promise<boolean>;
  
  // 截屏和OCR
  takeScreenshotBase64(): Promise<string>;
  recognizeText(): Promise<string[]>;
  recognizeTextWithPosition(): Promise<Array<{text: string; left: number; top: number; right: number; bottom: number; centerX: number; centerY: number; bounds: {left: number; top: number; right: number; bottom: number}}>>;
  screenContainsText(targetText: string): Promise<boolean>;
  findTextByMLKit(targetText: string): Promise<{found: boolean; text?: string; left?: number; top?: number; right?: number; bottom?: number; centerX?: number; centerY?: number}>;

  // 屏幕操作
  takeScreenshot(): Promise<string>;
  takeScreenshotAndSave(path?: string): Promise<string>;
  getScreenSize(): Promise<{ width: number; height: number }>;
  getCurrentPackageName(): Promise<string>;

  // 点击操作
  click(x: number, y: number): Promise<boolean>;
  longClick(x: number, y: number, duration?: number, isLongPress?: boolean): Promise<boolean>;
  clickWithVisualFeedback(x: number, y: number, showRipple?: boolean, vibrate?: boolean): Promise<boolean>;
  clickByText(text: string, isLongPress?: boolean): Promise<boolean>;
  clickByViewId(viewId: string): Promise<boolean>;

  // 手势操作
  swipe(startX: number, startY: number, endX: number, endY: number, duration?: number): Promise<boolean>;
  pullToRefresh(): Promise<boolean>;
  scrollUp(): Promise<boolean>;
  scrollDown(): Promise<boolean>;

  // 文本操作
  inputText(text: string): Promise<boolean>;
  clearInput(): Promise<boolean>;
  pasteText(text: string): Promise<boolean>;
  setClipboardText(text: string): Promise<boolean>;
  getClipboardText(): Promise<string>;

  // 导航操作
  pressBack(): Promise<boolean>;
  pressHome(): Promise<boolean>;
  pressRecentApps(): Promise<boolean>;

  // 元素查找
  findElementByText(text: string): Promise<ElementInfo>;
  findElementByViewId(viewId: string): Promise<ElementInfo>;
  waitForElement(text?: string, viewId?: string, timeout?: number): Promise<ElementInfo>;

  // 元素列表
  getClickableElements(): Promise<ElementInfo[]>;
  
  // 诊断功能
  dumpWindowTree(): Promise<boolean>;
  findElementsByText(text: string): Promise<ElementInfo[]>;
  
  // 延时
  delay(ms: number): Promise<boolean>;

  // Toast
  showToast(message: string): Promise<boolean>;
}

// ==================== 模块导出 ====================

/**
 * ZBBAutomation 原生模块
 */
const ZBB: ZBBAutomationModule | undefined = ZBBAutomation;

export default ZBB;

// ==================== 便捷函数 ====================

/**
 * 检查无障碍服务是否运行
 */
export const isServiceRunning = async (): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.isAccessibilityServiceRunning();
  } catch (error) {
    console.error('[ZBB] 检查服务状态失败:', error);
    return false;
  }
};

/**
 * 打开无障碍设置
 */
export const openSettings = async (): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.openAccessibilitySettings();
  } catch (error) {
    console.error('[ZBB] 打开设置失败:', error);
    return false;
  }
};

/**
 * 截图
 */
export const screenshot = async (): Promise<string | null> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return null;
  }
  try {
    return await ZBB.takeScreenshot();
  } catch (error) {
    console.error('[ZBB] 截图失败:', error);
    return null;
  }
};

/**
 * 点击坐标
 */
export const click = async (x: number, y: number): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.click(x, y);
  } catch (error) {
    console.error('[ZBB] 点击失败:', error);
    return false;
  }
};

/**
 * 滑动
 */
export const swipe = async (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration: number = 500
): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.swipe(startX, startY, endX, endY, duration);
  } catch (error) {
    console.error('[ZBB] 滑动失败:', error);
    return false;
  }
};

/**
 * 输入文本
 */
export const inputText = async (text: string): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.inputText(text);
  } catch (error) {
    console.error('[ZBB] 输入文本失败:', error);
    return false;
  }
};

/**
 * 按文本点击
 */
export const clickByText = async (text: string, isLongPress: boolean = false): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.clickByText(text, isLongPress);
  } catch (error) {
    console.error('[ZBB] 按文本点击失败:', error);
    return false;
  }
};

/**
 * 获取屏幕尺寸
 */
export const getScreenSize = async (): Promise<{ width: number; height: number } | null> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return null;
  }
  try {
    return await ZBB.getScreenSize();
  } catch (error) {
    console.error('[ZBB] 获取屏幕尺寸失败:', error);
    return null;
  }
};

/**
 * 按坐标点击
 */
export const clickAtPosition = async (x: number, y: number): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.click(x, y);
  } catch (error) {
    console.error('[ZBB] 坐标点击失败:', error);
    return false;
  }
};

/**
 * 获取当前应用包名
 */
export const getCurrentPackage = async (): Promise<string | null> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return null;
  }
  try {
    return await ZBB.getCurrentPackageName();
  } catch (error) {
    console.error('[ZBB] 获取包名失败:', error);
    return null;
  }
};

/**
 * 按返回键
 */
export const pressBack = async (): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.pressBack();
  } catch (error) {
    console.error('[ZBB] 按返回键失败:', error);
    return false;
  }
};

/**
 * 按 Home 键
 */
export const pressHome = async (): Promise<boolean> => {
  if (!ZBB) {
    console.error('[ZBB] 模块未初始化');
    return false;
  }
  try {
    return await ZBB.pressHome();
  } catch (error) {
    console.error('[ZBB] 按 Home 键失败:', error);
    return false;
  }
};

/**
 * 长按指定坐标
 * @param x X坐标
 * @param y Y坐标
 * @param duration 按住时长（毫秒），默认1000
 * @param isLongPress 是否是长按，默认true
 */
export const longClick = async (x: number, y: number, duration: number = 1000, isLongPress: boolean = true): Promise<boolean> => {
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
};

/**
 * 截图并标出所有文字的坐标
 * 返回：{ path: string, textCount: number, texts: Array }
 */
export interface ScreenshotMarkResult {
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
}

export const screenshotAndMark = async (): Promise<ScreenshotMarkResult | null> => {
  if (!ZBBAutomation) {
    console.error('[ZBB] 模块未初始化');
    return null;
  }
  try {
    const result = await ZBBAutomation.screenshotAndMark();
    return result as ScreenshotMarkResult;
  } catch (error) {
    console.error('[ZBB] 截图标注失败:', error);
    return null;
  }
};

// 事件监听函数从 index.ts 导出
export { addStopListener, removeStopListener } from './index';
