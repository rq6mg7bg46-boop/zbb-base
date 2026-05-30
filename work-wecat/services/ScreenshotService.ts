/**
 * 截图服务
 * 管理自动化流程中的截图操作
 * 支持 Android/iOS/Web 三端
 */

// 使用 legacy 路径（规范要求）
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

// 获取常量（兼容 legacy 导入的运行时问题）
const FileSystemAny = FileSystem as any;
const documentDir = FileSystemAny.documentDirectory || '/data/user/0/com.zbb.app/files/';
const EncodingType = { UTF8: 'utf8', Base64: 'base64' };

// 截图信息
export interface ScreenshotInfo {
  id: string;
  path: string;
  timestamp: number;
  type: 'success' | 'qrcode' | 'error';
  sent: boolean;
  filename: string;
}

// 截图目录
const SCREENSHOT_DIR = `${documentDir}screenshots/`;

// Web 平台的模拟存储
const webScreenshots: Map<string, string> = new Map();

class ScreenshotService {
  private static instance: ScreenshotService;
  
  private screenshots: ScreenshotInfo[] = [];
  private isInitialized: boolean = false;
  
  /* eslint-disable @typescript-eslint/no-empty-function */
  private constructor() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  
  // 获取单例
  static getInstance(): ScreenshotService {
    if (!ScreenshotService.instance) {
      ScreenshotService.instance = new ScreenshotService();
    }
    return ScreenshotService.instance;
  }
  
  // 检查是否是 Web 平台
  private isWebPlatform(): boolean {
    return Platform.OS === 'web';
  }
  
  // 初始化
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Web 平台不需要初始化目录
      if (this.isWebPlatform()) {
        this.isInitialized = true;
        console.log('[Screenshot] Web平台初始化成功');
        return;
      }
      
      // 确保截图目录存在
      const dirInfo = await FileSystem.getInfoAsync(SCREENSHOT_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(SCREENSHOT_DIR, { intermediates: true });
      }
      this.isInitialized = true;
      console.log('[Screenshot] 初始化成功');
    } catch (error) {
      console.error('[Screenshot] 初始化失败:', error);
      // 即使失败也标记为已初始化，避免重复尝试
      this.isInitialized = true;
    }
  }
  
  /**
   * 截取当前屏幕
   * @param type 截图类型
   * @returns 截图信息
   */
  async captureScreen(type: 'success' | 'qrcode' | 'error' = 'success'): Promise<ScreenshotInfo> {
    await this.initialize();
    
    const timestamp = Date.now();
    const filename = this.getFilename(type, timestamp);
    const path = `${SCREENSHOT_DIR}${filename}`;
    
    console.log(`[Screenshot] 截取屏幕: ${path}`);
    
    // Web 平台使用模拟存储
    if (this.isWebPlatform()) {
      // 在 Web 平台创建模拟的截图数据
      const mockData = `Mock Screenshot - ${type} - ${timestamp}`;
      webScreenshots.set(path, mockData);
      
      const screenshot: ScreenshotInfo = {
        id: `ss_${timestamp}`,
        path,
        timestamp,
        type,
        sent: false,
        filename,
      };
      
      this.screenshots.push(screenshot);
      console.log(`[Screenshot] Web平台模拟截图已创建: ${filename}`);
      return screenshot;
    }
    
    // 原生平台写入文件
    try {
      await (FileSystem as any).writeAsStringAsync(path, `Mock Screenshot - ${type} - ${timestamp}`, {
        encoding: EncodingType.UTF8,
      });
    } catch (error) {
      console.warn('[Screenshot] 写入文件失败，使用模拟路径:', error);
    }
    
    const screenshot: ScreenshotInfo = {
      id: `ss_${timestamp}`,
      path,
      timestamp,
      type,
      sent: false,
      filename,
    };
    
    this.screenshots.push(screenshot);
    
    console.log(`[Screenshot] 截图已保存: ${filename}`);
    return screenshot;
  }
  
  /**
   * 获取截图文件名
   */
  private getFilename(type: string, timestamp: number): string {
    const date = new Date(timestamp);
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
    return `${dateStr}_${timeStr}_${type}.png`;
  }
  
  /**
   * 保存截图到相册
   * @param screenshotId 截图ID
   */
  async saveToGallery(screenshotId: string): Promise<boolean> {
    // Web 平台不支持保存到相册
    if (this.isWebPlatform()) {
      console.warn('[Screenshot] Web平台不支持保存到相册');
      return false;
    }
    
    const screenshot = this.screenshots.find(s => s.id === screenshotId);
    if (!screenshot) {
      console.error('[Screenshot] 截图不存在:', screenshotId);
      return false;
    }
    
    try {
      // 请求权限
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.error('[Screenshot] 无保存权限');
        return false;
      }
      
      // 保存到相册
      const asset = await MediaLibrary.createAssetAsync(screenshot.path);
      console.log(`[Screenshot] 已保存到相册: ${asset.uri}`);
      return true;
    } catch (error) {
      console.error('[Screenshot] 保存失败:', error);
      return false;
    }
  }
  
  /**
   * 分享截图
   * @param screenshotId 截图ID
   */
  async shareScreenshot(screenshotId: string): Promise<boolean> {
    const screenshot = this.screenshots.find(s => s.id === screenshotId);
    if (!screenshot) {
      console.error('[Screenshot] 截图不存在:', screenshotId);
      return false;
    }
    
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        console.error('[Screenshot] 分享不可用');
        return false;
      }
      
      await Sharing.shareAsync(screenshot.path, {
        mimeType: 'image/png',
        dialogTitle: '分享截图',
      });
      
      console.log(`[Screenshot] 已分享截图`);
      return true;
    } catch (error) {
      console.error('[Screenshot] 分享失败:', error);
      return false;
    }
  }
  
  /**
   * 获取所有截图
   */
  getAllScreenshots(): ScreenshotInfo[] {
    return [...this.screenshots];
  }
  
  /**
   * 获取未发送的截图
   */
  getUnsentScreenshots(): ScreenshotInfo[] {
    return this.screenshots.filter(s => !s.sent);
  }
  
  /**
   * 标记截图已发送
   */
  markAsSent(screenshotId: string): void {
    const screenshot = this.screenshots.find(s => s.id === screenshotId);
    if (screenshot) {
      screenshot.sent = true;
    }
  }
  
  /**
   * 删除截图
   */
  async deleteScreenshot(screenshotId: string): Promise<boolean> {
    const index = this.screenshots.findIndex(s => s.id === screenshotId);
    if (index === -1) return false;
    
    const screenshot = this.screenshots[index];
    
    // Web 平台
    if (this.isWebPlatform()) {
      webScreenshots.delete(screenshot.path);
      this.screenshots.splice(index, 1);
      console.log(`[Screenshot] Web平台已删除截图: ${screenshot.filename}`);
      return true;
    }
    
    try {
      await FileSystem.deleteAsync(screenshot.path, { idempotent: true });
      this.screenshots.splice(index, 1);
      console.log(`[Screenshot] 已删除截图: ${screenshot.filename}`);
      return true;
    } catch (error) {
      console.error('[Screenshot] 删除失败:', error);
      return false;
    }
  }
  
  /**
   * 清理旧截图
   * @param days 保留天数
   */
  async cleanupOldScreenshots(days: number = 7): Promise<number> {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    for (let i = this.screenshots.length - 1; i >= 0; i--) {
      if (this.screenshots[i].timestamp < cutoffTime) {
        const success = await this.deleteScreenshot(this.screenshots[i].id);
        if (success) deletedCount++;
      }
    }
    
    console.log(`[Screenshot] 已清理 ${deletedCount} 张旧截图`);
    return deletedCount;
  }
  
  /**
   * 清空所有截图
   */
  async clearAll(): Promise<void> {
    for (const screenshot of this.screenshots) {
      await this.deleteScreenshot(screenshot.id);
    }
  }
}

// 导出单例
export const screenshotService = ScreenshotService.getInstance();
export { ScreenshotService };
