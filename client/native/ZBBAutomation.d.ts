// ZBBAutomation Native Module TypeScript Declarations
// OCR 相关接口

declare module '@/native/ZBBAutomation' {
  /**
   * OCR 识别结果
   */
  export interface OcrResult {
    text: string;           // 识别的文字
    confidence: number;     // 置信度 (0-1)
    left: number;           // 左边界
    top: number;            // 上边界
    right: number;          // 右边界
    bottom: number;         // 下边界
    centerX: number;        // 中心 X 坐标
    centerY: number;        // 中心 Y 坐标
  }

  /**
   * 查找文字结果
   */
  export interface FindTextResult {
    found: boolean;         // 是否找到
    x?: number;             // X 坐标
    y?: number;             // Y 坐标
    text?: string;          // 匹配到的文字
    error?: string;         // 错误信息
  }

  /**
   * 提取内容结果
   */
  export interface ExtractContentResult {
    phones?: string[];      // 提取到的手机号
    names?: string[];        // 提取到的姓名
    allTexts: string[];      // 所有识别到的文字
  }

  /**
   * ZBBAutomation OCR 模块
   */
  export interface ZBBAutomationOCR {
    /**
     * 截图并查找指定文字的位置
     * 整合截图+OCR+查找坐标三个步骤
     * 
     * @param targetText 要查找的文字
     * @returns 查找到的坐标或 null
     * 
     * @example
     * const result = await ZBBAutomation.screenshotAndFindText('绿城云');
     * if (result.found) {
     *   // 点击该坐标
     *   await ZBBAutomation.click(result.x, result.y);
     * }
     */
    screenshotAndFindText(targetText: string): Promise<FindTextResult>;

    /**
     * 识别当前屏幕文字
     * 
     * @returns 识别到的所有文字列表
     * 
     * @example
     * const texts = await ZBBAutomation.recognizeScreen();
     * console.log(texts.map(t => t.text));
     */
    recognizeScreen(): Promise<OcrResult[]>;

    /**
     * 识别并提取指定格式的内容
     * 用于从屏幕中提取手机号、姓名等信息
     * 
     * @param type 要提取的内容类型: "phone" | "name" | "all"
     * @returns 提取到的内容
     * 
     * @example
     * const content = await ZBBAutomation.extractScreenContent('phone');
     * console.log(content.phones); // ['13800138000']
     */
    extractScreenContent(type: 'phone' | 'name' | 'all'): Promise<ExtractContentResult>;

    /**
     * 检查屏幕是否包含指定文字（使用 OCR）
     * 比 AccessibilityService 的 containsText 更准确
     * 
     * @param targetText 要查找的文字
     * @returns 是否存在
     * 
     * @example
     * const exists = await ZBBAutomation.ocrContainsText('我要报备');
     * if (exists) {
     *   // 找到了"我要报备"
     * }
     */
    ocrContainsText(targetText: string): Promise<boolean>;

    /**
     * 截图并返回 Base64（用于调试）
     * 
     * @returns Base64 编码的图片
     */
    screenshotForOcr(): Promise<string>;

    /**
     * 获取当前界面所有文字节点及其坐标
     * 使用 Kotlin 层的节点树遍历，获取所有可见文字
     * 
     * @returns 文字节点数组，每个包含 text, centerX, centerY
     */
    getAllTextNodes(): Promise<Array<{ text: string; centerX: number; centerY: number; type: string }>>;

    /**
     * 识别当前屏幕文字（带位置信息）
     * 使用 Kotlin 层的 ML Kit OCR，直接返回所有文字块及其坐标
     * 
     * @returns 识别到的所有文字块，包含完整 bounds 信息
     * 
     * @example
     * const results = await ZBBAutomation.recognizeTextWithPosition();
     * results.forEach(r => {
     *   console.log(`"${r.text}" at (${r.centerX}, ${r.centerY})`);
     * });
     */
    recognizeTextWithPosition(): Promise<OcrResult[]>;

    /**
     * 设置 OCR 参数
     * 
     * @param usePreprocessing 是否使用预处理（默认 true）
     * @param useCorrection 是否使用纠错（默认 true）
     */
    setOcrOptions(usePreprocessing: boolean, useCorrection: boolean): void;
  }

  /**
   * 完整的 ZBBAutomation 模块
   */
  export interface ZBBAutomationModule extends ZBBAutomationOCR {
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
    screenContainsText(targetText: string): Promise<boolean>;
    
    // MediaProjection
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
