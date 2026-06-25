// ZBBAutomation Native Module TypeScript Declarations
// OCR 相关接口

declare module '@/native/ZBBAutomation' {
  // OCR 段已删除 2026-06-25（OcrResult interface + ZBBAutomationOCR interface）
  // 还原: git log 查 native/ZBBAutomation.d.ts L5-L134


  /**
   * 完整的 ZBBAutomation 模块
   */
  export interface ZBBAutomationModule {
    // 其他已存在的方法...
    // 服务状态
    isAccessibilityServiceRunning(): Promise<boolean>;
    openAccessibilitySettings(): Promise<boolean>;
    
    // 截图
    takeScreenshot(): Promise<string>;
    takeScreenshotAndSave(fileName: string): Promise<string>;
    takeScreenshotBase64(): Promise<string>;
    
    // 点击操作
    click(x: number, y: number): Promise<boolean>;
    longClick(x: number, y: number, duration: number, isLongPress: boolean): Promise<boolean>;
    clickWithVisualFeedback(x: number, y: number, showRipple: boolean, vibrate: boolean): Promise<boolean>;
    clickByText(text: string, isLongPress: boolean): Promise<boolean>;
    clickByViewId(viewId: string, isLongPress: boolean): Promise<boolean>;
    
    // 滑动操作
    swipe(startX: number, startY: number, endX: number, endY: number, duration: number): Promise<boolean>;
    pullToRefresh(): Promise<boolean>;
    scrollUp(): Promise<boolean>;
    scrollDown(): Promise<boolean>;
    
    // 输入操作
    inputText(text: string): Promise<boolean>;
    clearInput(): Promise<boolean>;
    pasteText(text: string): Promise<boolean>;
    
    // 剪贴板
    getClipboardText(): Promise<string | null>;
    setClipboardText(text: string): Promise<boolean>;
    
    // 查找元素
    findElementByText(text: string): Promise<any>;
    findElementByViewId(viewId: string): Promise<any>;
    getClickableElements(): Promise<any[]>;
    findElementsByText(text: string): Promise<any[]>;
    
    // OCR
    findTextByMLKit(targetText: string): Promise<FindTextResult>;
  // OCR 段已删除 2026-06-25（findTextByMLKit/screenContainsText 签名）
  // 还原: git log 查 native/ZBBAutomation.d.ts L178-L180

    requestMediaProjectionPermission(): Promise<boolean>;
    isMediaProjectionEnabled(): Promise<boolean>;
    
    // 导航
    pressBack(): Promise<boolean>;
    pressHome(): Promise<boolean>;
    pressRecentApps(): Promise<boolean>;
    
    // 应用控制
    launchApp(packageName: string): Promise<boolean>;
    showToast(message: string): Promise<boolean>;
    
    // 悬浮窗
    showFloatingWindow(): Promise<boolean>;
    hideFloatingWindow(): Promise<boolean>;
    updateFloatingStep(stepName: string, stepIndex: number, totalSteps: number): Promise<boolean>;
    updateFloatingAppInfo(appName: string): Promise<boolean>;
    setFloatingComplete(): Promise<boolean>;
    isOverlayPermissionGranted(): Promise<boolean>;
    openOverlaySettings(): Promise<boolean>;

    // 诊断
    dumpWindowTree(): Promise<boolean>;
    delay(ms: number): Promise<boolean>;
    
    // 等待
    waitForElement(text: string, timeout: number): Promise<boolean>;
    
    // 校准
    getLastClickCoordinates(): Promise<{ found: boolean; x?: number; y?: number }>;
    getRecentClick(maxAgeMs: number): Promise<{ found: boolean; x?: number; y?: number }>;
    clearClickHistory(): Promise<boolean>;
    getClickHistory(): Promise<{ x: number; y: number }[]>;
    
    // 自动化控制
    stopAutomation(): Promise<boolean>;
    
    // 事件监听
    addListener(eventName: string): void;
    removeListeners(count: number): void;
  }

  export const ZBBAutomation: ZBBAutomationModule;
  export default ZBBAutomation;
}
