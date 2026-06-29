/**
 * 企业微信自动化测试服务 - 简化版
 * 仅用于测试企业微信 + 小程序流程
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { automationEngine } from './AutomationEngine';
import { getSwipeCoord } from '@/utils/deviceModel';

// 获取原生模块
const { ZBBAutomation } = NativeModules;

// 获取事件发射器
const eventEmitter = new NativeEventEmitter(ZBBAutomation);

// APP 包名定义
const APP_PACKAGES = {
  WORK_WECHAT: 'com.tencent.wework', // 企业微信
};

// 延时配置
const DELAY_CONFIG = {
  openApp: { min: 8000, max: 10000 },  // 开APP 8-10 秒
  other: { min: 3000, max: 5000 },     // 其他操作 3-5 秒
  notice: { min: 8000, max: 8000 },    // 阅读须知 8 秒
};

// 测试数据
const TEST_DATA = {
  name: '刘先生',
  phone: '13212341234',
  project1: '郑州春月锦庐',
  project2: '郑州湖畔雲庐',
};

// 全局变量
let zbbAutomation: any = null;
let isRunning = false;
let screenshotPaths: string[] = [];

/**
 * 初始化 ZBB 自动化模块
 */
export function initZBBAutomation() {
  if (zbbAutomation) return zbbAutomation;
  
  zbbAutomation = {
    // 启动应用
    launchApp: async (packageName: string): Promise<boolean> => {
      try {
        const result = await ZBBAutomation.launchApp(packageName);
        console.log(`[ZBB] 启动应用 ${packageName}: ${result}`);
        return result;
      } catch (error) {
        console.error(`[ZBB] 启动应用失败:`, error);
        return false;
      }
    },
    
    // 延时
    delay: (ms: number): Promise<void> => {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // 点击文字
    clickByText: async (text: string): Promise<boolean> => {
      try {
        const result = await ZBBAutomation.clickByText(text);
        console.log(`[ZBB] 点击文字 "${text}": ${result}`);
        return result;
      } catch (error) {
        console.error(`[ZBB] 点击文字失败:`, error);
        return false;
      }
    },
    
    // 查找文字
    findElementByText: async (text: string): Promise<{ found: boolean; x?: number; y?: number }> => {
      try {
        const result = await ZBBAutomation.findElementByText(text);
        console.log(`[ZBB] 查找文字 "${text}":`, result);
        return result;
      } catch (error) {
        console.error(`[ZBB] 查找文字失败:`, error);
        return { found: false };
      }
    },
    
    // 坐标点击
    clickAtPosition: async (x: number, y: number): Promise<boolean> => {
      try {
        const result = await ZBBAutomation.clickAtPosition(x, y);
        console.log(`[ZBB] 点击坐标 (${x}, ${y}): ${result}`);
        return result;
      } catch (error) {
        console.error(`[ZBB] 坐标点击失败:`, error);
        return false;
      }
    },
    
    // 输入文字
    inputText: async (text: string): Promise<boolean> => {
      try {
        const result = await ZBBAutomation.inputText(text);
        console.log(`[ZBB] 输入文字: ${result}`);
        return result;
      } catch (error) {
        console.error(`[ZBB] 输入文字失败:`, error);
        return false;
      }
    },
    
    // 截图
    takeScreenshot: async (): Promise<string | null> => {
      try {
        const result = await ZBBAutomation.takeScreenshot();
        console.log(`[ZBB] 截图结果: ${result}`);
        return result;
      } catch (error) {
        console.error(`[ZBB] 截图失败:`, error);
        return null;
      }
    },
    
    // 按返回键
    pressBack: async (): Promise<boolean> => {
      try {
        const result = await ZBBAutomation.pressBack();
        console.log(`[ZBB] 按返回键: ${result}`);
        return result;
      } catch (error) {
        console.error(`[ZBB] 返回键失败:`, error);
        return false;
      }
    },
    
    // 滑动
    swipe: async (startX: number, startY: number, endX: number, endY: number): Promise<boolean> => {
      try {
        const result = await ZBBAutomation.swipe(startX, startY, endX, endY);
        console.log(`[ZBB] 滑动: ${result}`);
        return result;
      } catch (error) {
        console.error(`[ZBB] 滑动失败:`, error);
        return false;
      }
    },
    
    // Toast提示
    showToast: async (message: string): Promise<void> => {
      try {
        await ZBBAutomation.showToast(message);
      } catch (error) {
        console.error(`[ZBB] Toast失败:`, error);
      }
    },
    
    // 获取剪贴板
    getClipboardText: async (): Promise<string> => {
      try {
        const result = await ZBBAutomation.getClipboardText();
        return result || '';
      } catch (error) {
        console.error(`[ZBB] 获取剪贴板失败:`, error);
        return '';
      }
    },
    
    // 清空剪贴板
    clearClipboard: async (): Promise<boolean> => {
      try {
        const result = await ZBBAutomation.clearClipboard();
        return result;
      } catch (error) {
        console.error(`[ZBB] 清空剪贴板失败:`, error);
        return false;
      }
    },
  };
  
  return zbbAutomation;
}

// 初始化
initZBBAutomation();

/**
 * 辅助函数：日志输出
 */
function logToBoth(level: 'info' | 'success' | 'warn' | 'error', message: string) {
  console.log(`[WorkWechat ${level.toUpperCase()}] ${message}`);
  automationEngine.log(level, message);
}

/**
 * 获取随机延时
 */
function getDelay(type: 'openApp' | 'other' | 'notice'): number {
  switch (type) {
    case 'openApp':
      return Math.floor(Math.random() * (DELAY_CONFIG.openApp.max - DELAY_CONFIG.openApp.min + 1)) + DELAY_CONFIG.openApp.min;
    case 'notice':
      return DELAY_CONFIG.notice.min;
    default:
      return Math.floor(Math.random() * (DELAY_CONFIG.other.max - DELAY_CONFIG.other.min + 1)) + DELAY_CONFIG.other.min;
  }
}

/**
 * 等待并检测
 */
async function waitAndCheck(checkFunc: () => Promise<boolean>, maxRetries: number = 3, interval: number = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkFunc()) {
      return true;
    }
    if (i < maxRetries - 1) {
      logToBoth('info', `  等待重试 ${i + 1}/${maxRetries}...`);
      await zbbAutomation.delay(interval);
    }
  }
  return false;
}

/**
 * 企业微信自动化服务
 */
class WorkWechatAutomationService {
  private isRunning = false;
  private isPaused = false;
  private isAborted = false;
  
  /**
   * 执行企业微信测试流程
   */
  async executeWorkWechatFlow(): Promise<{ success: boolean; screenshots: string[] }> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    this.isAborted = false;
    screenshotPaths = [];
    
    await zbbAutomation.showToast('企业微信测试开始！');
    
    logToBoth('info', '========================================');
    logToBoth('info', '       企业微信测试流程开始');
    logToBoth('info', '========================================');
    
    try {
      // 步骤1：打开企业微信
      logToBoth('info', '[步骤1] 打开企业微信');
      await this.stepOpenWorkWechat();
      
      // 步骤2：点击工作台
      logToBoth('info', '[步骤2] 点击工作台');
      await this.stepClickWorkbench();
      
      // 步骤3：点击"新绿城云"小程序
      logToBoth('info', '[步骤3] 点击"新绿城云"小程序');
      await this.stepClickNewGreenCity();
      
      // 步骤4：点击"我要推荐"
      logToBoth('info', '[步骤4] 点击"我要推荐"');
      await this.stepClickRecommend();
      
      // 步骤5：输入客户信息
      logToBoth('info', '[步骤5] 输入客户信息');
      await this.stepInputCustomerInfo();
      
      // 步骤6：第一次报备（郑州春月锦庐）
      logToBoth('info', '[步骤6] 第一次报备 - 郑州春月锦庐');
      await this.stepReport1();
      
      // 步骤7：第二次报备（郑州湖畔雲庐）
      logToBoth('info', '[步骤7] 第二次报备 - 郑州湖畔雲庐');
      await this.stepReport2();
      
      // 步骤8：返回企业微信
      logToBoth('info', '[步骤8] 返回企业微信');
      await this.stepReturnToWorkWechat();
      
      await zbbAutomation.showToast('企业微信测试完成！');
      logToBoth('success', '========================================');
      logToBoth('success', '       测试流程完成！');
      logToBoth('success', '========================================');
      
      return { success: true, screenshots: [...screenshotPaths] };
      
    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', `       测试失败: ${error}`);
      logToBoth('error', '========================================');
      
      return { success: false, screenshots: [...screenshotPaths] };
      
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * 步骤1：打开企业微信
   */
  private async stepOpenWorkWechat(): Promise<void> {
    const delay = getDelay('openApp');
    logToBoth('info', `  启动企业微信，等待 ${delay}ms...`);
    
    const launched = await zbbAutomation.launchApp(APP_PACKAGES.WORK_WECHAT);
    if (!launched) {
      throw new Error('无法启动企业微信');
    }
    
    await zbbAutomation.delay(delay);
    logToBoth('success', '  企业微信已打开');
  }
  
  /**
   * 步骤2：点击工作台
   */
  private async stepClickWorkbench(): Promise<void> {
    // 尝试点击"工作台"
    const clicked = await zbbAutomation.clickByText('工作台');
    if (clicked) {
      logToBoth('success', '  已点击工作台');
      await zbbAutomation.delay(getDelay('other'));
      return;
    }
    
    // 备选：使用坐标点击
    // 工作台 bounds: [463,165][616,233] 中心: (540, 199)
    logToBoth('warn', '  clickByText 失败，使用坐标点击工作台');
    await zbbAutomation.clickAtPosition(540, 199);
    await zbbAutomation.delay(getDelay('other'));
    logToBoth('success', '  工作台已点击');
  }
  
  /**
   * 步骤3：点击"新绿城云"小程序
   */
  private async stepClickNewCity(): Promise<void> {
    // 尝试点击"新绿城云"
    const clicked = await zbbAutomation.clickByText('新绿城云');
    if (clicked) {
      logToBoth('success', '  已点击"新绿城云"小程序');
      await zbbAutomation.delay(getDelay('other') * 2); // 小程序加载较慢
      return;
    }
    
    // 备选：使用坐标点击
    // 从节点树分析，新绿城云 bounds: [543,1478][792,1527] 中心: (668, 1502)
    logToBoth('warn', '  clickByText 失败，使用坐标点击');
    await zbbAutomation.clickAtPosition(668, 1502);
    await zbbAutomation.delay(getDelay('other') * 2);
    logToBoth('success', '  新绿城云小程序已点击');
  }
  
  /**
   * 步骤3：点击"新绿城云"小程序
   */
  private async stepClickNewGreenCity(): Promise<void> {
    logToBoth('info', '  尝试查找"新绿城云"...');
    
    // 尝试点击"新绿城云"
    const clicked = await zbbAutomation.clickByText('新绿城云');
    if (clicked) {
      logToBoth('success', '  已点击"新绿城云"小程序');
      await zbbAutomation.delay(getDelay('other') * 2);
      return;
    }
    
    // 如果没找到，检查是否页面需要滚动
    logToBoth('warn', '  未找到"新绿城云"，尝试向上滚动...');
    const swipeCoord = await getSwipeCoord('wechat_swipeUp_540_1500_540_800');
    await zbbAutomation.swipe(swipeCoord.startX, swipeCoord.startY, swipeCoord.endX, swipeCoord.endY); // 向上滑动
    await zbbAutomation.delay(1000);
    
    // 再次尝试点击
    const clicked2 = await zbbAutomation.clickByText('新绿城云');
    if (clicked2) {
      logToBoth('success', '  滚动后已点击"新绿城云"');
      await zbbAutomation.delay(getDelay('other') * 2);
      return;
    }
    
    // 备选坐标
    logToBoth('warn', '  使用坐标点击新绿城云');
    // 从节点树分析，不同位置的坐标
    await zbbAutomation.clickAtPosition(668, 1502);
    await zbbAutomation.delay(getDelay('other') * 2);
    logToBoth('success', '  新绿城云小程序已点击');
  }
  
  /**
   * 步骤4：点击"我要推荐"
   */
  private async stepClickRecommend(): Promise<void> {
    logToBoth('info', '  查找"我要推荐"按钮...');
    
    // 尝试点击"我要推荐"
    const clicked = await zbbAutomation.clickByText('我要推荐');
    if (clicked) {
      logToBoth('success', '  已点击"我要推荐"');
      await zbbAutomation.delay(getDelay('other'));
      return;
    }
    
    // 如果没找到，可能在小程序内需要先滚动或查找其他入口
    logToBoth('warn', '  未找到"我要推荐"，尝试其他方式...');
    
    // 尝试点击底部导航的"推荐"相关文字
    const clicked2 = await zbbAutomation.clickByText('推荐');
    if (clicked2) {
      logToBoth('success', '  已点击"推荐"');
      await zbbAutomation.delay(getDelay('other'));
      return;
    }
    
    throw new Error('无法找到"我要推荐"按钮，请手动确认按钮位置');
  }
  
  /**
   * 步骤5：输入客户信息
   */
  private async stepInputCustomerInfo(): Promise<void> {
    // 清空剪贴板后设置新值
    await zbbAutomation.clearClipboard();
    await zbbAutomation.delay(500);
    
    // 输入姓名
    logToBoth('info', `  输入姓名: ${TEST_DATA.name}`);
    await zbbAutomation.inputText(TEST_DATA.name);
    await zbbAutomation.delay(500);
    
    // 输入电话
    logToBoth('info', `  输入电话: ${TEST_DATA.phone}`);
    await zbbAutomation.inputText(TEST_DATA.phone);
    await zbbAutomation.delay(500);
    
    logToBoth('success', '  客户信息已输入');
  }
  
  /**
   * 步骤6：第一次报备（郑州春月锦庐）
   */
  private async stepReport1(): Promise<void> {
    // 点击报备项目下拉
    logToBoth('info', '  点击报备项目下拉...');
    const clicked = await zbbAutomation.clickByText('报备项目');
    if (clicked) {
      await zbbAutomation.delay(1000);
    }
    
    // 选择第一个项目
    logToBoth('info', `  选择项目: ${TEST_DATA.project1}`);
    await zbbAutomation.clickByText(TEST_DATA.project1);
    await zbbAutomation.delay(500);
    
    // 点击确认
    logToBoth('info', '  点击确认...');
    await zbbAutomation.clickByText('确认');
    await zbbAutomation.delay(1000);
    
    // 点击须知链接
    logToBoth('info', '  阅读购房须知...');
    await zbbAutomation.clickByText('全民经纪人推荐购房须知');
    await zbbAutomation.delay(getDelay('notice'));
    
    // 点击"我已了解"
    await zbbAutomation.clickByText('我已了解');
    await zbbAutomation.delay(1000);
    
    // 点击"立即推荐"
    logToBoth('info', '  点击"立即推荐"...');
    await zbbAutomation.clickByText('立即推荐');
    await zbbAutomation.delay(2000);
    
    // 截图
    logToBoth('info', '  截图保存...');
    const screenshot = await zbbAutomation.takeScreenshot();
    if (screenshot) {
      screenshotPaths.push(screenshot);
      logToBoth('success', `  截图已保存: ${screenshot}`);
    } else {
      logToBoth('error', '  截图失败！');
    }
    
    // 点击确定
    await zbbAutomation.clickByText('确定');
    await zbbAutomation.delay(1000);
    
    logToBoth('success', '  第一次报备完成');
  }
  
  /**
   * 步骤7：第二次报备（郑州湖畔雲庐）
   */
  private async stepReport2(): Promise<void> {
    // 清空并重新输入客户信息
    logToBoth('info', '  清空并重新输入客户信息...');
    
    // 重新输入姓名
    await zbbAutomation.clickByText('报备项目'); // 点击其他地方激活输入框
    await zbbAutomation.delay(500);
    
    // 输入姓名
    await zbbAutomation.inputText(TEST_DATA.name);
    await zbbAutomation.delay(500);
    
    // 输入电话
    await zbbAutomation.inputText(TEST_DATA.phone);
    await zbbAutomation.delay(500);
    
    // 点击报备项目下拉
    logToBoth('info', '  点击报备项目下拉...');
    await zbbAutomation.clickByText('报备项目');
    await zbbAutomation.delay(1000);
    
    // 选择第二个项目
    logToBoth('info', `  选择项目: ${TEST_DATA.project2}`);
    await zbbAutomation.clickByText(TEST_DATA.project2);
    await zbbAutomation.delay(500);
    
    // 点击确认
    logToBoth('info', '  点击确认...');
    await zbbAutomation.clickByText('确认');
    await zbbAutomation.delay(1000);
    
    // 点击须知链接
    logToBoth('info', '  阅读购房须知...');
    await zbbAutomation.clickByText('全民经纪人推荐购房须知');
    await zbbAutomation.delay(getDelay('notice'));
    
    // 点击"我已了解"
    await zbbAutomation.clickByText('我已了解');
    await zbbAutomation.delay(1000);
    
    // 点击"立即推荐"
    logToBoth('info', '  点击"立即推荐"...');
    await zbbAutomation.clickByText('立即推荐');
    await zbbAutomation.delay(2000);
    
    // 截图
    logToBoth('info', '  截图保存...');
    const screenshot = await zbbAutomation.takeScreenshot();
    if (screenshot) {
      screenshotPaths.push(screenshot);
      logToBoth('success', `  截图已保存: ${screenshot}`);
    } else {
      logToBoth('error', '  截图失败！');
    }
    
    // 点击确定
    await zbbAutomation.clickByText('确定');
    await zbbAutomation.delay(1000);
    
    logToBoth('success', '  第二次报备完成');
  }
  
  /**
   * 步骤8：返回企业微信
   */
  private async stepReturnToWorkWechat(): Promise<void> {
    logToBoth('info', '  按返回键...');
    await zbbAutomation.pressBack();
    await zbbAutomation.delay(1000);
    
    // 再次按返回键，确保退出小程序
    await zbbAutomation.pressBack();
    await zbbAutomation.delay(1000);
    
    logToBoth('success', '  已返回企业微信');
  }
  
  /**
   * 停止流程
   */
  stop(): void {
    this.isAborted = true;
    this.isRunning = false;
    logToBoth('warn', '  流程已停止');
  }
  
  /**
   * 暂停
   */
  pause(): void {
    this.isPaused = true;
    logToBoth('info', '  流程已暂停');
  }
  
  /**
   * 恢复
   */
  resume(): void {
    this.isPaused = false;
    logToBoth('info', '  流程已恢复');
  }
}

// 导出单例
export const workWechatAutomation = new WorkWechatAutomationService();
