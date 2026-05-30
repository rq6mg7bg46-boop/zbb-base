/**
 * ZBB 原生自动化服务
 * 版本: v2.5
 * 
 * 使用原生无障碍服务实现真实的自动化操作
 */

import { Platform } from 'react-native';
import { zbbAutomation, ElementInfo, Point, Rect } from '../native';
import { clickAtPosition, addStopListener, removeStopListener } from '../native/ZBBAutomation';
import { automationEngine } from './AutomationEngine';
import type { CustomerInfo } from './AutomationEngine';
import { customerTable } from './CustomerTable';
import { CalibrationService, ocrService } from './index';
import { initDatabase, insertReport, insertBaoliReport, getAllBaoliReports, updateReportSuccess, updateReportFailed, exportToCSV, exportToJSON, printAllReports } from './DatabaseService';
import type { EmitterSubscription } from 'react-native';

// APP 包名定义
const APP_PACKAGES = {
  DOUYIN: 'com.ss.android.ugc.aweme',  // 抖音
  WECHAT: 'com.tencent.wework',       // 企业微信
};

// 延时配置
const DELAY_CONFIG = {
  openApp: { min: 8000, max: 10000 },  // 开APP 8-10 秒
  other: { min: 5000, max: 8000 },     // 其他操作 5-8 秒
  notice: { min: 5000, max: 5000 },    // 阅读须知 5 秒
};

// 辅助函数：同时输出到 Metro Console 和日志系统
function logToBoth(level: 'info' | 'success' | 'warn' | 'error', message: string) {
  // 输出到 Metro Console
  console.log(`[ZBB ${level.toUpperCase()}] ${message}`);
  // 保存到日志系统
  automationEngine.log(level, message);
}

/**
 * 带重试机制的 findElementByText
 * @param text 要查找的文本
 * @param maxRetries 最大重试次数
 * @param retryDelay 重试间隔(ms)
 * @returns 找到的元素信息或null
 */
async function findElementByTextWithRetry(
  text: string,
  maxRetries: number = 3,
  retryDelay: number = 1500
): Promise<any | null> {
  for (let i = 0; i < maxRetries; i++) {
    logToBoth('info', `[findElement] 第 ${i + 1} 次尝试查找: "${text}"`);
    
    const result = await zbbAutomation.findElementByText(text);
    
    if (result?.found) {
      // 检查坐标是否有效（必须 > 0）
      const centerX = result.boundsCenterX || result.bounds?.centerX;
      const centerY = result.boundsCenterY || result.bounds?.centerY;
      
      if (centerX > 0 && centerY > 0) {
        logToBoth('info', `[findElement] ✓ 找到 "${text}", 坐标: (${centerX}, ${centerY})`);
        return result;
      } else {
        logToBoth('warn', `[findElement] 坐标无效 (${centerX}, ${centerY})，重试...`);
      }
    } else {
      logToBoth('warn', `[findElement] 未找到 "${text}"`);
    }
    
    if (i < maxRetries - 1) {
      await zbbAutomation.delay(retryDelay);
    }
  }
  
  logToBoth('error', `[findElement] ✗ 多次查找 "${text}" 失败`);
  return null;
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
 * 原生自动化服务类
 */
class NativeAutomationService {
  private static instance: NativeAutomationService;
  
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isAborted: boolean = false;
  private isCalibrating: boolean = false;  // 校准状态
  
  private friendName: string = '只如初见';
  private customerInfo: CustomerInfo | null = null;
  
  private screenshotPaths: string[] = [];
  
  // 对方发送的最后一条消息坐标（步骤4识别，步骤5使用）
  private lastFriendMessage: { text: string; startX: number; y: number } | null = null;
  
  // 步骤更新回调
  private stepUpdateCallbacks: Array<(stepName: string, stepIndex: number) => void> = [];
  
  // 停止事件监听器
  private stopListener: EmitterSubscription | null = null;
  
  private constructor() {
    // 初始化数据库
    initDatabase().catch(err => {
      console.error('[NativeAutomationService] 数据库初始化失败:', err);
    });
    // 初始化时添加原生停止事件监听
    this.initStopListener();
  }
  
  /**
   * 初始化原生停止事件监听
   */
  private initStopListener(): void {
    this.stopListener = addStopListener(() => {
      console.log('[NativeAutomationService] 收到原生停止事件');
      this.isAborted = true;
      this.isRunning = false;
      automationEngine.log('warn', '[原生] 流程已被用户停止（通过悬浮窗按钮）');
    });
  }
  
  static getInstance(): NativeAutomationService {
    if (!NativeAutomationService.instance) {
      NativeAutomationService.instance = new NativeAutomationService();
    }
    return NativeAutomationService.instance;
  }
  
  /**
   * 注册步骤更新回调
   */
  onStepUpdate(callback: (stepName: string, stepIndex: number) => void): void {
    if (!this.stepUpdateCallbacks.includes(callback)) {
      this.stepUpdateCallbacks.push(callback);
    }
  }
  
  /**
   * 取消注册步骤更新回调
   */
  offStepUpdate(callback: (stepName: string, stepIndex: number) => void): void {
    const index = this.stepUpdateCallbacks.indexOf(callback);
    if (index > -1) {
      this.stepUpdateCallbacks.splice(index, 1);
    }
  }
  
  /**
   * 通知所有回调步骤更新
   */
  private notifyStepUpdate(stepName: string, stepIndex: number): void {
    // 更新 Android 悬浮窗
    zbbAutomation.updateFloatingStep(stepName, stepIndex, 14);
    
    // 通知 JS 回调
    this.stepUpdateCallbacks.forEach(callback => {
      try {
        callback(stepName, stepIndex);
      } catch (error) {
        console.error('[NativeAutomationService] 步骤回调执行错误:', error);
      }
    });
  }
  
  /**
   * 检查服务是否就绪
   */
  async checkServiceReady(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      automationEngine.log('error', '[原生] 仅支持 Android 平台');
      return false;
    }
    
    const isRunning = await zbbAutomation.isServiceRunning();
    
    if (!isRunning) {
      automationEngine.log('error', '[原生] 无障碍服务未运行，请前往设置开启');
      return false;
    }
    
    automationEngine.log('info', '[原生] 无障碍服务已就绪');
    return true;
  }
  
  /**
   * 打开无障碍设置
   */
  async openAccessibilitySettings(): Promise<void> {
    await zbbAutomation.openAccessibilitySettings();
  }
  
  // ==================== 诊断功能 ====================
  
  /**
   * 诊断：导出当前窗口节点树
   * 用于调试"找不到元素"的问题
   * 调用后在 ADB 日志中搜索 "WindowTree" 查看节点结构
   */
  async diagnoseDumpWindowTree(): Promise<void> {
    logToBoth('info', '[诊断] 正在导出窗口节点树...');
    await zbbAutomation.dumpWindowTree();
    logToBoth('info', '[诊断] 节点树已导出到日志，请运行: adb logcat -s AccessibilityServiceImpl | grep -A 100 "WindowTree"');
  }
  
  /**
   * 诊断：查找所有包含指定文本的元素
   * 返回所有匹配项的详细信息
   */
  async diagnoseFindElements(text: string): Promise<void> {
    logToBoth('info', `[诊断] 正在查找所有包含"${text}"的元素...`);
    const elements = await zbbAutomation.findElementsByText(text);
    
    if (elements.length === 0) {
      logToBoth('warn', `[诊断] 未找到包含"${text}"的元素`);
      logToBoth('info', '[诊断] 提示：可以先调用 diagnoseDumpWindowTree 查看界面完整结构');
      return;
    }
    
    logToBoth('info', `[诊断] 找到 ${elements.length} 个匹配元素:`);
    elements.forEach((el, index) => {
      logToBoth('info', `[诊断] 元素${index + 1}: text="${el.text || ''}" desc="${el.contentDescription || ''}" bounds=[${el.boundsLeft},${el.boundsTop},${el.boundsRight},${el.boundsBottom}] clickable=${el.clickable}`);
    });
  }
  
  // ==================== 阶段一+二：获取客户信息 ====================
  
  /**
   * 执行获取客户信息流程
   */
  async fetchCustomerInfo(): Promise<CustomerInfo | null> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    this.isAborted = false;
    
    automationEngine.log('info', '[原生] ========== 阶段一+二：获取客户信息 ==========');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 步骤1-7：获取客户信息
      await this.stepOpenDouyin();
      await this.checkAbort();  // 检查是否被停止
      await this.stepClickMessages();
      await this.checkAbort();
      await this.stepFindFriend();
      await this.checkAbort();
      await this.stepClickChat();
      await this.checkAbort();
      await this.stepLongPressMessage();
      await this.checkAbort();
      await this.stepClickCopy();
      await this.checkAbort();
      await this.stepParseMessage();
      
      automationEngine.log('success', '[原生] ========== 客户信息获取完成 ==========');
      return this.customerInfo;
      
    } catch (error) {
      automationEngine.log('error', `[原生] 流程错误: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * 检查是否被停止
   */
  private async checkAbort(): Promise<void> {
    if (this.isAborted) {
      logToBoth('warn', '[原生] 流程已被用户停止');
      this.isRunning = false;
      throw new Error('流程已被用户停止');
    }
  }
  
  private async stepOpenDouyin(): Promise<void> {
    logToBoth('info', '[抖音：步骤1] 正在打开抖音...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('打开抖音');
    
    // 实际启动抖音APP
    const launched = await zbbAutomation.launchApp(APP_PACKAGES.DOUYIN);
    if (launched) {
      logToBoth('info', '[抖音：步骤1] 抖音已启动，等待界面加载...');
    } else {
      logToBoth('error', '[抖音：步骤1] ✗ 抖音启动失败，请检查抖音是否已安装');
    }
    
    // 等待应用加载
    await zbbAutomation.delay(getDelay('openApp'));
    
    // OCR确认：检查抖音是否已加载
    const douyinLoaded = await this.checkScreenText('抖音', 5);
    if (!douyinLoaded) {
      logToBoth('warn', '[抖音：步骤1] 警告：未检测到抖音界面，可能已打开其他界面');
      // 继续执行，让用户观察
    }
    
    // 检查当前包名
    const packageName = await zbbAutomation.getCurrentPackageName();
    logToBoth('info', `[抖音] 当前应用: ${packageName}`);
    
    logToBoth('success', '[抖音：步骤1] 抖音已打开');
  }
  
  private async stepClickMessages(): Promise<void> {
    logToBoth('info', '[抖音：步骤2] 点击"消息"按钮...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('点击消息');
    await zbbAutomation.delay(getDelay('other'));
    
    // ========== 固定坐标点击 ==========
    const CLICK_X = 750;
    const CLICK_Y = 2300;
    
    logToBoth('info', `[抖音：步骤2] 固定坐标: (${CLICK_X}, ${CLICK_Y})`);
    const clicked = await zbbAutomation.click(CLICK_X, CLICK_Y);
    
    if (clicked) {
      logToBoth('success', '[抖音：步骤2] ✓ 点击成功');
      await zbbAutomation.delay(getDelay('other'));
      
      // OCR确认
      const messagesVisible = await this.checkScreenText('消息', 3, '[抖音：步骤2]') || 
                              await this.checkScreenText('私信', 3, '[抖音：步骤2]') ||
                              await this.checkScreenText('栀子树下', 3, '[抖音：步骤2]');
      if (messagesVisible) {
        logToBoth('success', '[抖音：步骤2] ✓ 消息列表已显示');
      }
    } else {
      logToBoth('error', '[抖音：步骤2] ✗ 点击失败');
    }
  }
  
  /**
   * 从节点树中解析按钮坐标（简化格式）
   * 简化格式: [ViewType] ... text="xxx" ... bounds=Rect(l, t - r, b)
   */
  private parseButtonsFromTree(tree: string): Array<{text: string; left: number; top: number; right: number; bottom: number; centerX: number; centerY: number}> {
    const buttons: Array<{text: string; left: number; top: number; right: number; bottom: number; centerX: number; centerY: number}> = [];
    
    // 按行分割
    const lines = tree.split('\n');
    
    for (const line of lines) {
      // 提取 text 或 desc（优先 text，其次 desc）
      let text = '';
      const textMatch = line.match(/text="([^"]+)"/);
      const descMatch = line.match(/desc="([^"]+)"/);
      if (textMatch) {
        text = textMatch[1];
      } else if (descMatch) {
        text = descMatch[1];
      }
      
      // 提取 bounds=Rect(left, top - right, bottom)
      const boundsMatch = line.match(/bounds=Rect\((\d+),\s*(\d+)\s*-\s*(\d+),\s*(\d+)\)/);
      
      // 必须同时有文字和坐标
      if (text && boundsMatch) {
        const left = parseInt(boundsMatch[1]);
        const top = parseInt(boundsMatch[2]);
        const right = parseInt(boundsMatch[3]);
        const bottom = parseInt(boundsMatch[4]);
        
        const centerX = Math.floor((left + right) / 2);
        const centerY = Math.floor((top + bottom) / 2);
        
        buttons.push({ text, left, top, right, bottom, centerX, centerY });
      }
    }
    
    return buttons;
  }
  
  /**
   * 根据文本查找按钮坐标并点击（带重试机制）
   */
  private async clickByTextCoordinate(text: string): Promise<boolean> {
    const element = await findElementByTextWithRetry(text, 3, 1500);
    
    if (!element) {
      logToBoth('error', `[点击] 查找 "${text}" 失败`);
      return false;
    }
    
    // 计算中心点坐标
    const centerX = element.boundsCenterX || element.bounds?.centerX;
    const centerY = element.boundsCenterY || element.bounds?.centerY;
    
    logToBoth('info', `[点击] 找到按钮: "${text}", 坐标: (${centerX}, ${centerY})`);
    
    // 点击中心点
    return await zbbAutomation.click(centerX, centerY);
  }
  
  private async stepFindFriend(): Promise<void> {
    logToBoth('info', '[抖音：步骤3] 查找好友 "' + this.friendName + '"...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('查找好友');
    await zbbAutomation.delay(getDelay('other'));
    
    // ========== 固定坐标点击 ==========
    const CLICK_X = 340;
    const CLICK_Y = 370;
    
    logToBoth('info', `[抖音：步骤3] 固定坐标: (${CLICK_X}, ${CLICK_Y})`);
    const clicked = await zbbAutomation.click(CLICK_X, CLICK_Y);
    
    if (clicked) {
      logToBoth('success', '[抖音：步骤3] ✓ 点击成功');
    } else {
      logToBoth('error', '[抖音：步骤3] ✗ 点击失败');
      throw new Error('点击好友失败');
    }
    
    // 等待进入对话框
    logToBoth('info', '[抖音：步骤3] 等待进入对话框...');
    await zbbAutomation.delay(getDelay('other'));
    
    // 确认是否已进入对话框
    const chatOpened = await this.checkScreenText('发送', 3) || 
                        await this.checkScreenText('栀子树下', 3);
    if (chatOpened) {
      logToBoth('success', '[抖音：步骤3] ✓ 已进入对话框');
    } else {
      logToBoth('warn', '[抖音：步骤3] 警告：可能未进入对话框');
    }
  }
  
  private async stepClickChat(): Promise<void> {
    logToBoth('info', '[抖音：步骤4] 验证已进入对话框...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('进入聊天');
    await zbbAutomation.delay(getDelay('other'));
    
    // 方法1：使用 Kotlin findElementByText("只如初见") 验证顶部导航
    // 根据界面分析：顶部导航显示聊天对象昵称，位置在 y < 500
    logToBoth('info', '[抖音：步骤4] 使用 Kotlin findElementByText("只如初见") 验证...');
    const friendResult = await zbbAutomation.findElementByText('只如初见');
    
    if (friendResult?.found) {
      logToBoth('info', `[抖音：步骤4] 找到顶部导航: 只如初见 (${friendResult.centerX}, ${friendResult.centerY})`);
      
      // 验证是否在顶部导航区域（y < 500 是顶部区域）
      if (friendResult.centerY < 500) {
        logToBoth('success', '[抖音：步骤4] ✓ 已确认进入对话框（顶部导航）');
        return;
      }
    }
    
    // 方法2：检查输入框 "发送消息" 提示文字
    logToBoth('info', '[抖音：步骤4] 检查输入框 "发送消息"...');
    const inputResult = await zbbAutomation.findElementByText('发送消息');
    if (inputResult?.found) {
      logToBoth('success', '[抖音：步骤4] ✓ 已确认进入对话框（输入框）');
      return;
    }
    
    // 方法3：OCR 兜底检查聊天界面特征
    logToBoth('warn', '[抖音：步骤4] Kotlin API 未确认，使用 OCR 兜底...');
    const ocrTexts = await this.recognizeScreenText();
    const hasSendButton = ocrTexts.some(t => t.includes('发送') || t.includes('发消息'));
    const hasFriendName = ocrTexts.some(t => t.includes('只如初见'));
    
    if (hasSendButton && hasFriendName) {
      logToBoth('success', '[抖音：步骤4] ✓ 已确认进入对话框（OCR）');
      return;
    }
    
    logToBoth('warn', '[抖音：步骤4] 警告：未能确认进入对话框');
  }
  
  /**
   * 判断文字是否是干扰项（用户名、时间戳、操作按钮等）
   */
  private isInterferenceText(text: string): boolean {
    // 干扰文字列表（参考文件 + 扩展）
    const interferencePatterns: (string | RegExp)[] = [
      // 时间戳相关
      '刚刚', '分钟前', '小时前', '昨天', '今天',
      /上午\d/, /下午\d/, /晚上\d/,
      /\d{1,2}:\d{2}/, // 10:30 格式
      /\d{2}:\d{2}/,  // 19:06 格式
      // 操作按钮
      '发送', '回复', '撤回', '删除', '转发',
      '复制', '引用', '收藏', '设为未读',
      // 聊天相关关键词
      '消息', '私信', '聊天', '对话框',
      '相册', '摄像头', '麦克风',
      // 抖音聊天快捷按钮
      '打招呼', '比心', '比 心', '捂脸', '[捂脸]', '玫瑰', '[玫瑰]', '语音', '更多面板',
      // 抖音特定
      '抖音', '关注', '粉丝', '直播', '推荐', '同城', '热点', '精选',
      // 快捷表情
      '赞', '评', '收', '藏', '转', '福', '利',
      '比心', '捂脸', '哈欠', '早点睡',
      // 界面元素
      '音视频通话', '更多', '图片', '按钮', '头像',
      '返回', '未读', '通话',
    ];
    
    for (const pattern of interferencePatterns) {
      if (typeof pattern === 'string') {
        if (text === pattern || text.includes(pattern) || pattern.includes(text)) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(text)) {
          return true;
        }
      }
    }
    
    // 过滤过短或过长的文字
    if (text.length < 2 || text.length > 50) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 过滤消息列表，返回可能是消息内容的文字
   */
  private filterMessageTexts(texts: string[]): string[] {
    return texts.filter(text => !this.isInterferenceText(text));
  }
  
  /**
   * 查找元素并获取边界信息
   * 优先使用节点树，如果找不到则使用 OCR recognizeTextWithPosition 获取位置
   */
  private async findElementWithBounds(text: string): Promise<ElementInfo | null> {
    try {
      // 1. 优先使用节点树查找
      const nodeResult = await zbbAutomation.findElementByText(text);
      if (nodeResult?.found) {
        logToBoth('info', `[查找元素] 节点树找到: "${text.substring(0, 20)}..." (${nodeResult.boundsCenterX}, ${nodeResult.boundsCenterY})`);
        return nodeResult;
      }
      
      // 2. 节点树找不到时，使用 recognizeTextWithPosition 获取所有 OCR 结果
      logToBoth('info', `[查找元素] 节点树未找到，使用OCR位置: "${text.substring(0, 20)}..."`);
      
      try {
        // 调用 recognizeTextWithPosition 获取所有识别结果
        const ocrResults = await (zbbAutomation as any).recognizeTextWithPosition();
        
        if (ocrResults && Array.isArray(ocrResults) && ocrResults.length > 0) {
          logToBoth('info', `[查找元素] 原生方案识别到 ${ocrResults.length} 个结果`);
          
          // 精确匹配
          let matched = ocrResults.find((r: any) => r.text === text);
          
          // 模糊匹配：如果精确匹配找不到
          if (!matched) {
            // 对于电话号码，尝试部分匹配
            const phonePattern = /1[3-9]\d{9}/;
            if (phonePattern.test(text)) {
              // 提取数字进行匹配
              const digitsOnly = text.replace(/\D/g, '');
              matched = ocrResults.find((r: any) => {
                const rDigits = (r.text || '').replace(/\D/g, '');
                // 检查数字序列是否包含或被包含
                return rDigits.includes(digitsOnly) || digitsOnly.includes(rDigits);
              });
            }
            
            // 如果还是找不到，尝试包含匹配
            if (!matched) {
              matched = ocrResults.find((r: any) => 
                (r.text || '').includes(text) || text.includes(r.text)
              );
            }
          }
          
          if (matched && matched.bounds) {
            const centerX = matched.bounds.left + (matched.bounds.right - matched.bounds.left) / 2;
            const centerY = matched.bounds.top + (matched.bounds.bottom - matched.bounds.top) / 2;
            logToBoth('info', `[查找元素] OCR找到: "${matched.text}" (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);
            return {
              found: true,
              text: matched.text || text,
              boundsLeft: matched.bounds.left,
              boundsTop: matched.bounds.top,
              boundsRight: matched.bounds.right,
              boundsBottom: matched.bounds.bottom,
              boundsCenterX: centerX,
              boundsCenterY: centerY,
            };
          }
        }
      } catch (ocrError) {
        logToBoth('warn', `[查找元素] recognizeTextWithPosition异常: ${ocrError}`);
      }
      
      logToBoth('warn', `[查找元素] 都未找到: "${text.substring(0, 20)}..."`);
      return null;
    } catch (error) {
      logToBoth('warn', `[查找元素] 异常: ${error}`);
      return null;
    }
  }
  
  /**
   * 查找对方发送的消息（通过坐标判断：对方消息通常在屏幕左侧）
   * @param messageTexts 所有消息文本
   * @param screenWidth 屏幕宽度
   * @param screenHeight 屏幕高度
   * @returns 对方消息及其坐标信息
   */
  private async findFriendMessages(
    messageTexts: string[], 
    screenWidth: number,
    screenHeight: number
  ): Promise<Array<{ text: string; startX: number; y: number }>> {
    const friendMessages: Array<{ text: string; startX: number; y: number }> = [];
    
    // 对方消息区域的X坐标阈值：屏幕左侧 60% 以内为对方消息
    const friendMaxX = screenWidth * 0.6;
    
    logToBoth('info', `[消息分析] 开始查找对方消息，候选数量: ${messageTexts.length}`);
    
    for (const text of messageTexts) {
      // 使用 findElementByText 查找坐标
      const element = await this.findElementWithBounds(text);
      
      if (!element) {
        logToBoth('warn', `[消息分析] 文字无法定位到坐标: "${text.substring(0, 20)}..."`);
        continue;
      }
      
      if (!element?.found) {
        logToBoth('warn', `[消息分析] findElementByText 未找到: "${text.substring(0, 20)}..."`);
        continue;
      }
      
      const centerX = element.boundsCenterX ?? 0;
      const centerY = element.boundsCenterY ?? 0;
      const boundsLeft = element.boundsLeft ?? 0;
      const boundsTop = element.boundsTop ?? 0;
      
      // 验证坐标有效性
      const isValidX = centerX >= 0 && centerX <= screenWidth;
      const isValidY = centerY >= 0 && centerY <= screenHeight;
      
      if (!isValidX || !isValidY) {
        logToBoth('warn', `[消息分析] 坐标无效: "${text.substring(0, 20)}..." (${centerX}, ${centerY})，跳过`);
        continue;
      }
      
      // 判断是否在屏幕左侧（对方消息区域）
      if (centerX < friendMaxX) {
        friendMessages.push({
          text,
          startX: boundsLeft ?? centerX - 50,
          y: boundsTop ?? centerY,
        });
        logToBoth('info', `[消息分析] 对方消息: "${text.substring(0, 20)}..." X=${centerX.toFixed(0)} Y=${centerY.toFixed(0)}`);
      } else {
        logToBoth('info', `[消息分析] 自己的消息(右侧): "${text.substring(0, 20)}..." X=${centerX.toFixed(0)}`);
      }
    }
    
    logToBoth('info', `[消息分析] 找到对方消息数量: ${friendMessages.length}`);
    return friendMessages;
  }
  
  /**
   * 判断文字是否是干扰项（用户名、时间戳、操作按钮等）
   */
  private isInterferenceText(text: string): boolean {
    // 干扰文字列表
    const interferencePatterns = [
      // 时间戳相关
      '刚刚', '分钟前', '小时前', '昨天', '今天',
      /上午\d/, /下午\d/, /晚上\d/,
      /\d{1,2}:\d{2}/, // 10:30 格式
      // 操作按钮
      '发送', '回复', '撤回', '删除', '转发',
      '复制', '引用', '收藏', '设为未读',
      // 聊天相关关键词
      '消息', '私信', '聊天', '对话框',
      '相册', '摄像头', '表情', '麦克风',
      // 抖音聊天快捷按钮
      '打招呼', '比心', '比 心', '捂脸', '[捂脸]', '玫瑰', '[玫瑰]', '语音', '更多面板',
      // 抖音特定
      '抖音', '私信', '关注', '粉丝', '直播', '推荐', '同城', '热点', '精选',
      // 单字符
      '赞', '评', '收', '藏', '转', '福', '利',
    ];
    
    for (const pattern of interferencePatterns) {
      if (typeof pattern === 'string') {
        if (text === pattern || text.includes(pattern)) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(text)) {
          return true;
        }
      }
    }
    
    // 过滤过短或过长的文字
    if (text.length < 2 || text.length > 50) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 过滤消息列表，返回可能是消息内容的文字
   */
  private filterMessageTexts(texts: string[]): string[] {
    return texts.filter(text => !this.isInterferenceText(text));
  }
  
  /**
   * 查找元素并获取边界信息
   */
  private async findElementWithBounds(text: string): Promise<ElementInfo | null> {
    try {
      return await zbbAutomation.findElementByText(text);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 查找对方发送的消息（通过坐标判断：对方消息通常在屏幕左侧）
   */
  private async findFriendMessages(
    messageTexts: string[], 
    screenWidth: number,
    screenHeight: number
  ): Promise<Array<{ text: string; boundsCenterX: number; boundsCenterY: number }>> {
    const friendMessages: Array<{ text: string; boundsCenterX: number; boundsCenterY: number }> = [];
    
    // 对方消息区域的X坐标阈值：屏幕左侧 60% 以内为对方消息
    const friendMaxX = screenWidth * 0.6;
    
    for (const text of messageTexts) {
      const element = await this.findElementWithBounds(text);
      if (element?.found && element.boundsCenterX !== undefined && element.boundsCenterY !== undefined) {
        // 验证坐标有效性
        const isValidX = element.boundsCenterX >= 0 && element.boundsCenterX <= screenWidth;
        const isValidY = element.boundsCenterY >= 0 && element.boundsCenterY <= screenHeight;
        
        if (!isValidX || !isValidY) {
          continue;
        }
        
        // 判断是否在屏幕左侧（对方消息区域）
        if (element.boundsCenterX < friendMaxX) {
          friendMessages.push({
            text,
            boundsCenterX: element.boundsCenterX,
            boundsCenterY: element.boundsCenterY,
          });
        }
      }
    }
    
    return friendMessages;
  }
  
  /**
   * 长按消息并复制（步骤5）
   * 逻辑：
   * 1. 截取屏幕（使用 base64 方式，避免文件路径访问问题）
   * 2. 使用 OCR 识别屏幕上所有文字及其位置
   * 3. 过滤出可能是消息的内容（如包含手机号的行）
   * 4. 找到最下方（Y值最大）且在左侧（X较小）的消息
   * 5. X坐标固定为250，Y坐标使用找到的消息的Y值
   */
  private async stepLongPressMessage(): Promise<void> {
    logToBoth('info', '[抖音：步骤5] 长按消息...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('长按消息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 2. 使用 Kotlin 层的 OCR 识别屏幕上所有文字及其位置
    logToBoth('info', '[抖音：步骤5] 使用 Kotlin OCR 识别屏幕消息...');
    
    let ocrResults: any[] = [];
    
    try {
      // 直接调用 Kotlin 层的 recognizeTextWithPosition
      // 它会自己截图并返回所有文字块
      ocrResults = await zbbAutomation.recognizeTextWithPosition();
      logToBoth('info', `[抖音：步骤5] Kotlin OCR 返回 ${ocrResults.length} 个文字块`);
    } catch (e) {
      logToBoth('error', `[抖音：步骤5] Kotlin OCR 识别异常: ${e}`);
    }
    
    if (!ocrResults || ocrResults.length === 0) {
      logToBoth('warn', '[抖音：步骤5] OCR 未识别到任何内容，使用固定坐标...');
      await this.longPressWithFixedCoords(250, 2050);
      return;
    }
    
    logToBoth('info', `[抖音：步骤5] OCR 识别到 ${ocrResults.length} 个文字`);
    
    // 调试：输出所有识别结果
    logToBoth('info', '[抖音：步骤5] === OCR 识别详情 ===');
    ocrResults.forEach((item, index) => {
      // Kotlin 返回的格式：{ text, centerX, centerY, bounds: { left, top, right, bottom } }
      const centerX = item.centerX || (item.bounds?.left + item.bounds?.width / 2);
      const centerY = item.centerY || (item.bounds?.top + item.bounds?.height / 2);
      logToBoth('info', `[抖音：步骤5] ${index + 1}. "${item.text}" at (${centerX?.toFixed(0)}, ${centerY?.toFixed(0)})`);
    });
    logToBoth('info', '[抖音：步骤5] =======================');
    
    // 3. 检查 OCR 识别结果质量
    const validResults = ocrResults.filter(item => item.text && item.text.trim().length > 0);
    
    if (validResults.length < 3) {
      // 识别结果太少，说明 OCR 可能没有成功识别
      logToBoth('error', `[抖音：步骤5] OCR 识别内容过少 (${validResults.length} 个)，可能识别失败`);
      await this.longPressWithFixedCoords(250, 2050);
      return;
    }
    
    logToBoth('info', `[抖音：步骤5] 有效识别结果: ${validResults.length} 个`);
    
    // 4. 收集消息区域内的所有文字块（不要求包含特定关键词）
    const messageCandidates: Array<{text: string; x: number; y: number}> = [];
    
    for (const item of validResults) {
      const text = item.text.trim();
      // Kotlin 返回的格式：直接有 centerX, centerY 字段
      const centerX = item.centerX || 0;
      const centerY = item.centerY || 0;
      
      // 排除干扰项
      if (this.isInterferenceText(text)) continue;
      
      // 消息区域：y 在 500-2200 之间
      if (centerY < 500 || centerY > 2200) continue;
      
      // 消息在左侧：x < 600
      if (centerX > 600) continue;
      
      // 收集所有符合条件的文字块
      messageCandidates.push({
        text,
        x: centerX,
        y: centerY,
      });
    }
    
    // 5. 输出消息区域内的所有文字块
    logToBoth('info', `[抖音：步骤5] 消息区域内共 ${messageCandidates.length} 个文字块`);
    messageCandidates.forEach((item, index) => {
      logToBoth('info', `[抖音：步骤5]   ${index + 1}. "${item.text.substring(0, 20)}..." at (${item.x.toFixed(0)}, ${item.y.toFixed(0)})`);
    });
    
    // 6. 找到 Y 值最大（最下方）的消息
    let targetY = 2050;  // 默认值
    let targetMessage = null;
    
    if (messageCandidates.length > 0) {
      // 按 Y 值降序排序（Y 最大的在最后 = 最新消息）
      messageCandidates.sort((a, b) => b.y - a.y);
      targetY = messageCandidates[0].y;
      targetMessage = messageCandidates[0];
      logToBoth('info', `[抖音：步骤5] 最新消息: "${targetMessage.text.substring(0, 20)}..." Y=${targetY.toFixed(0)}`);
    } else {
      logToBoth('warn', '[抖音：步骤5] 消息区域未找到文字，使用默认 Y=2050');
    }
    
    // 6. 长按：X 固定为 250，Y 使用找到的消息的 Y 值
    const LONG_PRESS_X = 250;
    
    logToBoth('info', `[抖音：步骤5] 长按坐标: (${LONG_PRESS_X}, ${targetY.toFixed(0)})，时长: 2000ms`);
    await zbbAutomation.longClick(LONG_PRESS_X, targetY, 2000, true);
    await zbbAutomation.delay(getDelay('other'));
    
    // 检查是否出现复制菜单
    const menuVisible = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
    if (menuVisible) {
      logToBoth('success', '[抖音：步骤5] ✓ 长按成功，复制选项已显示');
      return;
    }
    
    // 如果没出现菜单，尝试向上偏移重试
    logToBoth('warn', '[抖音：步骤5] 复制菜单未出现，尝试向上偏移...');
    await zbbAutomation.click(540, 300);  // 点击空白处关闭可能的菜单
    await zbbAutomation.delay(500);
    
    // 尝试向上偏移 100 像素
    const adjustedY = targetY - 100;
    logToBoth('info', `[抖音：步骤5] 调整坐标重试: (${LONG_PRESS_X}, ${adjustedY.toFixed(0)})`);
    await zbbAutomation.longClick(LONG_PRESS_X, adjustedY, 2000, true);
    await zbbAutomation.delay(getDelay('other'));
    
    // 最终检查
    const finalCheck = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
    if (finalCheck) {
      logToBoth('success', '[抖音：步骤5] ✓ 长按成功');
    } else {
      logToBoth('error', '[抖音：步骤5] ✗ 长按失败，未出现复制菜单');
      throw new Error('长按消息失败');
    }
  }
  
  /**
   * 使用固定坐标长按
   */
  private async longPressWithFixedCoords(x: number, y: number): Promise<void> {
    logToBoth('info', `[抖音：步骤5] 固定坐标长按: (${x}, ${y})，时长: 2000ms`);
    await zbbAutomation.longClick(x, y, 2000, true);
    await zbbAutomation.delay(getDelay('other'));
    
    const menuVisible = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
    if (menuVisible) {
      logToBoth('success', '[抖音：步骤5] ✓ 长按成功');
      return;
    }
    
    // 尝试向上偏移
    logToBoth('warn', '[抖音：步骤5] 复制菜单未出现，尝试向上偏移...');
    await zbbAutomation.click(540, 300);
    await zbbAutomation.delay(500);
    
    const adjustedY = y - 100;
    logToBoth('info', `[抖音：步骤5] 调整坐标重试: (${x}, ${adjustedY})`);
    await zbbAutomation.longClick(x, adjustedY, 2000, true);
    await zbbAutomation.delay(getDelay('other'));
    
    const finalCheck = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
    if (finalCheck) {
      logToBoth('success', '[抖音：步骤5] ✓ 长按成功');
    } else {
      logToBoth('error', '[抖音：步骤5] ✗ 长按失败');
      throw new Error('长按消息失败');
    }
  }
  
  private async stepClickCopy(): Promise<void> {
    logToBoth('info', '[抖音：步骤6] 点击"复制"按钮...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('复制信息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 策略1：使用 Kotlin findElementByText 查找"复制"按钮
    logToBoth('info', '[抖音：步骤6] 策略1：Kotlin findElementByText("复制")...');
    const copyResult = await zbbAutomation.findElementByText('复制');
    
    if (copyResult?.found) {
      logToBoth('info', `[抖音：步骤6] 找到复制按钮: (${copyResult.centerX}, ${copyResult.centerY})`);
      
      // 验证坐标在合理范围内（屏幕中上部）
      if (copyResult.centerY > 500 && copyResult.centerY < 2000) {
        await zbbAutomation.click(copyResult.centerX, copyResult.centerY);
        logToBoth('success', '[抖音：步骤6] ✓ 点击复制按钮成功');
        await zbbAutomation.delay(1500);
      } else {
        logToBoth('warn', `[抖音：步骤6] 坐标异常 (${copyResult.centerY})，尝试固定坐标...`);
      }
    }
    
    // 策略2：固定坐标点击复制菜单
    // 根据界面分析，弹出菜单大约在屏幕中部
    // 菜单选项垂直排列，"复制"可能在 y=1800-1950 附近
    const COPY_X = 540;
    const COPY_Y = 1850;
    
    logToBoth('info', `[抖音：步骤6] 策略2：固定坐标点击复制: (${COPY_X}, ${COPY_Y})`);
    await zbbAutomation.click(COPY_X, COPY_Y);
    await zbbAutomation.delay(1500);
    
    // 检查是否出现复制成功提示
    const screenTexts = await this.recognizeScreenText();
    const hasSuccess = screenTexts.some(t => 
      t.includes('复制成功') || 
      t.includes('已复制') || 
      t.includes('Copied')
    );
    
    if (hasSuccess) {
      logToBoth('success', '[抖音：步骤6] ✓ 复制成功');
    } else {
      // 检查是否还在复制菜单
      const stillInMenu = screenTexts.some(t => t.includes('复制') || t.includes('转发'));
      if (stillInMenu) {
        logToBoth('warn', '[抖音：步骤6] 仍在菜单中，尝试其他位置...');
        
        // 尝试其他可能的位置（向上偏移）
        await zbbAutomation.click(COPY_X, COPY_Y - 100);
        await zbbAutomation.delay(1500);
        
        const retryTexts = await this.recognizeScreenText();
        const retrySuccess = retryTexts.some(t => 
          t.includes('复制成功') || t.includes('已复制')
        );
        
        if (retrySuccess) {
          logToBoth('success', '[抖音：步骤6] ✓ 复制成功（重试）');
        } else {
          // 关闭复制菜单
          await zbbAutomation.pressBack();
          await zbbAutomation.delay(1000);
          logToBoth('warn', '[抖音：步骤6] 复制未成功确认');
        }
      } else {
        logToBoth('warn', '[抖音：步骤6] 未检测到复制菜单，可能已复制');
      }
    }
    
    // 读取剪贴板
    const clipboardText = await zbbAutomation.getClipboardText();
    logToBoth('info', '[抖音：步骤6] 剪贴板内容: ' + (clipboardText || '(空)'));
    
    if (clipboardText && clipboardText !== 'null' && clipboardText.length > 0) {
      // 保存到客户信息表格
      const record = await customerTable.addRecord(clipboardText);
      if (record) {
        logToBoth('success', '[抖音：步骤6] 已保存到客户表格: 序号=' + record.id + ', 姓氏=' + record.surname + ', 性别=' + record.gender + ', 电话=' + record.phone);
        // 打印表格统计
        const stats = customerTable.getStats();
        logToBoth('info', '[客户表格] 统计: 共' + stats.total + '条, 待录入' + stats.pending + '条, 已完成' + stats.completed + '条');
        // 打印完整表格
        customerTable.printAllRecords();
        
        // 保存到 SQLite 数据库
        try {
          const copyTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
          await insertReport(copyTime, record.surname, record.phone);
        } catch (dbError) {
          logToBoth('warn', '[抖音：步骤6] SQLite写入失败: ' + (dbError as Error).message);
        }
      } else {
        logToBoth('warn', '[抖音：步骤6] 解析客户数据失败');
      }
    } else {
      logToBoth('warn', '[抖音：步骤6] 剪贴板为空，复制可能失败');
    }
  }
  
  private async stepParseMessage(): Promise<void> {
    logToBoth('info', '[抖音：步骤7] 读取剪贴板（客户信息）...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('读取客户信息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 读取剪贴板 - 获取从好友消息复制的客户信息
    // 预期格式: "姓名\n电话" 或 "姓名 电话" 等
    const clipboardText = await zbbAutomation.getClipboardText();
    
    if (clipboardText) {
      logToBoth('info', `[抖音：步骤7] 剪贴板内容: ${clipboardText.substring(0, 50)}...`);
      
      // 解析姓名和电话（在 executeFullFlow 中完成）
      // 这里只记录日志，实际解析在主流程中
      logToBoth('success', '[抖音：步骤7] 客户信息已从剪贴板读取');
    } else {
      logToBoth('error', '[抖音：步骤7] ✗ 剪贴板为空');
      throw new Error('剪贴板为空，无法获取客户信息');
    }
  }
  
  // ==================== 阶段十一+十二：发送截图 ====================
  
  /**
   * 发送截图到抖音并退出
   */
  async sendScreenshotsAndExit(): Promise<void> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    this.isAborted = false;
    
    logToBoth('info', '[原生] ========== 阶段十一+十二：发送截图 ==========');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 步骤37-43
      await this.stepOpenDouyinSend();
      await this.checkAbort();
      await this.stepClickAdd();
      await this.checkAbort();
      await this.stepClickAlbum();
      await this.checkAbort();
      await this.stepSelectPhotos();
      await this.checkAbort();
      await this.stepSend();
      await this.checkAbort();
      await this.stepExitDouyin();
      
      automationEngine.log('success', '[原生] ========== 发送截图完成 ==========');
      
    } catch (error) {
      automationEngine.log('error', `[原生] 流程错误: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  private async stepOpenDouyinSend(): Promise<void> {
    automationEngine.log('info', '[抖音：步骤9] 打开抖音发送界面...');
    await zbbAutomation.showToast('步骤8: 打开抖音发送界面');
    await zbbAutomation.delay(getDelay('openApp'));
    
    await zbbAutomation.showToast('步骤8完成!');
    automationEngine.log('success', '[抖音：步骤9] 抖音已打开');
  }
  
  private async stepClickAdd(): Promise<void> {
    automationEngine.log('info', '[抖音：步骤10] 点击"+"图标...');
    await zbbAutomation.showToast('步骤9: 点击"+"图标');
    await zbbAutomation.delay(getDelay('other'));
    
    await zbbAutomation.clickByText('+');
    
    await zbbAutomation.showToast('步骤9完成!');
    automationEngine.log('success', '[抖音：步骤10] 点击"+"成功');
  }
  
  private async stepClickAlbum(): Promise<void> {
    automationEngine.log('info', '[抖音：步骤11] 点击"相册"...');
    await zbbAutomation.showToast('步骤10: 点击"相册"');
    await zbbAutomation.delay(getDelay('other'));
    
    await zbbAutomation.clickByText('相册');
    
    await zbbAutomation.showToast('步骤10完成!');
    automationEngine.log('success', '[抖音：步骤11] 点击"相册"成功');
  }
  
  private async stepSelectPhotos(): Promise<void> {
    automationEngine.log('info', '[抖音：步骤12] 选择截图...');
    await zbbAutomation.showToast('步骤11: 选择截图');
    await zbbAutomation.delay(getDelay('other'));
    
    // 选择第一张截图（最新）
    automationEngine.log('info', '[抖音：步骤12] 选择截图');
    
    await zbbAutomation.showToast('步骤11完成!');
    automationEngine.log('success', '[抖音：步骤12] 截图已选择');
  }
  
  private async stepSend(): Promise<void> {
    automationEngine.log('info', '[抖音：步骤13] 发送消息...');
    await zbbAutomation.showToast('步骤12: 发送消息');
    await zbbAutomation.delay(getDelay('other'));
    
    await zbbAutomation.clickByText('发送');
    
    await zbbAutomation.showToast('步骤12完成!');
    automationEngine.log('success', '[抖音：步骤13] 消息已发送');
  }
  
  private async stepExitDouyin(): Promise<void> {
    automationEngine.log('info', '[完成] 退出抖音...');
    await zbbAutomation.showToast('流程完成！请手动退出抖音');
    await zbbAutomation.delay(getDelay('other'));
    
    automationEngine.log('success', '[完成] 流程执行完毕');
  }
  
  // ==================== 通用操作 ====================
  
  /**
   * 截图并保存到相册（使用 screencap 命令）
   */
  async takeScreenshot(projectIndex: number): Promise<string | null> {
    const timestamp = Date.now();
    const fileName = `ZBB_${timestamp}_success_${projectIndex}.png`;
    
    // 截图保存路径
    const screenshotPath = `/sdcard/Pictures/ZBB/${fileName}`;
    
    try {
      // 方案1：使用 screencapShell 截图
      const result = await zbbAutomation.screencapShell(screenshotPath);
      if (result) {
        automationEngine.log('info', `[原生] 截图已保存: ${screenshotPath}`);
        return screenshotPath;
      }
      
      // 方案2：screencapShell 失败，使用帧缓冲截图
      automationEngine.log('info', `[原生] screencapShell 失败，尝试帧缓冲截图`);
      try {
        const fbResult = await zbbAutomation.screenshotViaFrameBuffer();
        if (fbResult) {
          automationEngine.log('info', `[原生] 帧缓冲截图已保存: ${fbResult}`);
          return fbResult as string;
        }
      } catch (fbError) {
        automationEngine.log('error', `[原生] 帧缓冲截图失败: ${fbError}`);
      }
      
      // 方案3：使用 MediaStore API
      automationEngine.log('info', `[原生] 帧缓冲截图失败，尝试 MediaStore API`);
      try {
        const mediaStoreResult = await zbbAutomation.screenshotViaMediaStore();
        if (mediaStoreResult) {
          automationEngine.log('info', `[原生] MediaStore截图已保存: ${mediaStoreResult}`);
          return mediaStoreResult as string;
        }
      } catch (msError) {
        automationEngine.log('error', `[原生] MediaStore截图失败: ${msError}`);
      }
      
      automationEngine.log('error', `[原生] 截图保存失败`);
    } catch (error) {
      automationEngine.log('error', `[原生] 截图异常: ${error}`);
    }
    
    return null;
  }
  
  /**
   * 等待指定文本出现
   */
  async waitForText(text: string, timeout: number = 10000): Promise<boolean> {
    const element = await zbbAutomation.waitForElement(text, undefined, timeout);
    return element?.found ?? false;
  }
  
  /**
   * 点击文本
   */
  async clickText(text: string, isLongPress: boolean = false): Promise<boolean> {
    return await zbbAutomation.clickByText(text, isLongPress);
  }
  
  /**
   * 查找元素
   */
  async findElement(text: string): Promise<ElementInfo | null> {
    return await zbbAutomation.findElementByText(text);
  }
  
  /**
   * 输入文本
   */
  async inputText(text: string): Promise<boolean> {
    return await zbbAutomation.inputText(text);
  }
  
  /**
   * 清空输入并输入文本
   */
  async clearAndInput(text: string): Promise<boolean> {
    await zbbAutomation.clearInput();
    await zbbAutomation.delay(500);
    return await zbbAutomation.inputText(text);
  }
  
  /**
   * 滑动
   */
  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500
  ): Promise<boolean> {
    return await zbbAutomation.swipe(startX, startY, endX, endY, duration);
  }
  
  // ==================== OCR辅助方法 ====================
  
  /**
   * 使用OCR检测是否为聊天界面（参考文件方法）
   * 检测特征：'发送' 或 '摄像头' 或 '相册'
   */
  async checkChatByNode(maxRetries: number = 3): Promise<boolean> {
    const chatIndicators = ['发送', '摄像头', '相册'];
    
    for (let i = 0; i < maxRetries; i++) {
      // OCR 识别并记录耗时
      const startTime = Date.now();
      const allTexts = await zbbAutomation.recognizeText();
      const ocrTime = Date.now() - startTime;
      
      logToBoth('info', `[OCR检测] 识别到 ${allTexts.length} 个文字，耗时 ${ocrTime}ms`);
      logToBoth('info', `[OCR检测] 识别内容: ${JSON.stringify(allTexts.slice(0, 20))}`);
      
      // 检查是否包含目标文字
      let found = false;
      let foundText = '';
      
      for (const indicator of chatIndicators) {
        const textFound = allTexts.includes(indicator) || 
                          allTexts.some(text => text.includes(indicator) || indicator.includes(text));
        if (textFound) {
          found = true;
          foundText = indicator;
          break;
        }
      }
      
      if (found) {
        logToBoth('success', `[OCR检测] 找到聊天界面特征: "${foundText}"`);
        return true;
      }
      
      logToBoth('warn', `[OCR检测] 未找到聊天特征，重试 ${i + 1}/${maxRetries}`);
      await zbbAutomation.delay(2000 + Math.random() * 500);  // 等待 2-2.5 秒
    }
    
    logToBoth('warn', '[OCR检测] 未能找到聊天界面');
    return false;
  }

  /**
   * 使用OCR检查屏幕上是否包含指定文字
   * @param stepPrefix 步骤前缀，用于日志区分
   */
  async checkScreenText(targetText: string, maxRetries: number = 3, stepPrefix?: string): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      // OCR 识别并记录耗时
      const startTime = Date.now();
      const allTexts = await this.recognizeScreenText();
      const ocrTime = Date.now() - startTime;
      
      // 显示 OCR 识别结果
      const logPrefix = stepPrefix || '[OCR]';
      automationEngine.log('info', `${logPrefix} 识别到 ${allTexts.length} 个文字，耗时 ${ocrTime}ms`);
      automationEngine.log('info', `${logPrefix} 识别内容: ${JSON.stringify(allTexts.slice(0, 20))}`);
      
      // 检查是否包含目标文字
      const found = allTexts.includes(targetText) || 
                    allTexts.some(text => text.includes(targetText) || targetText.includes(text));
      
      if (found) {
        automationEngine.log('info', `${logPrefix} 找到: ${targetText}`);
        return true;
      }
      automationEngine.log('warn', `${logPrefix} 未找到"${targetText}"，重试 ${i + 1}/${maxRetries}`);
      await zbbAutomation.delay(2000);
    }
    automationEngine.log('warn', `[OCR] ✗ 未能找到: ${targetText}`);
    return false;
  }
  
  /**
   * 使用原生方案识别当前屏幕文字（带耗时统计）
   */
  async recognizeScreenText(): Promise<string[]> {
    const startTime = Date.now();
    const texts = await zbbAutomation.recognizeText();
    const ocrTime = Date.now() - startTime;
    automationEngine.log('info', `[OCR] 识别到 ${texts.length} 个文字，耗时 ${ocrTime}ms`);
    return texts;
  }
  
  /**
   * 等待指定文字出现（使用OCR）
   */
  async waitForScreenText(targetText: string, timeout: number = 15000): Promise<boolean> {
    const startTime = Date.now();
    const interval = 2000;
    
    while (Date.now() - startTime < timeout) {
      const found = await zbbAutomation.screenContainsText(targetText);
      if (found) {
        return true;
      }
      await zbbAutomation.delay(interval);
    }
    return false;
  }
  
  /**
   * 下拉操作（修复上滑问题）
   */
  async pullDown(): Promise<boolean> {
    const screenSize = await zbbAutomation.getScreenSize();
    if (!screenSize) {
      automationEngine.log('error', '[操作] 无法获取屏幕尺寸');
      return false;
    }
    const centerX = screenSize.width / 2;
    
    // 从中间位置向下滑动（endY > startY 表示下滑）
    const startY = screenSize.height * 0.3;
    const endY = screenSize.height * 0.7;
    
    automationEngine.log('info', `[操作] 执行下拉操作: (${centerX}, ${startY}) -> (${centerX}, ${endY})`);
    return await this.swipe(centerX, startY, centerX, endY, 500);
  }
  
  /**
   * 上滑操作
   */
  async pullUp(): Promise<boolean> {
    const screenSize = await zbbAutomation.getScreenSize();
    if (!screenSize) {
      automationEngine.log('error', '[操作] 无法获取屏幕尺寸');
      return false;
    }
    const centerX = screenSize.width / 2;
    
    // 从中间位置向上滑动（endY < startY 表示上滑）
    const startY = screenSize.height * 0.7;
    const endY = screenSize.height * 0.3;
    
    automationEngine.log('info', `[操作] 执行上滑操作: (${centerX}, ${startY}) -> (${centerX}, ${endY})`);
    return await this.swipe(centerX, startY, centerX, endY, 500);
  }
  
  // ==================== 阶段三：打开企业微信 ====================
  
  /**
   * 打开企业微信应用
   */
  async openWechat(): Promise<void> {
    logToBoth('info', '[流程] 阶段三：打开企业微信');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('打开企业微信');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 检查是否被停止
      await this.checkAbort();
      
      // 使用 launchApp 打开企业微信
      logToBoth('info', '[企业微信] 正在启动企业微信...');
      const launched = await zbbAutomation.launchApp(APP_PACKAGES.WECHAT);
      
      if (launched) {
        logToBoth('success', '[企业微信] 企业微信已启动');
      } else {
        logToBoth('error', '[企业微信] X 启动企业微信失败');
        throw new Error('启动企业微信失败');
      }
      
      // 等待企业微信启动
      await zbbAutomation.delay(getDelay('openApp'));
      
      // 检查当前包名
      const packageName = await zbbAutomation.getCurrentPackageName();
      logToBoth('info', '[企业微信] 当前包名: ' + packageName);
      
      // 确认是企业微信
      if (packageName?.includes('tencent.wework')) {
        logToBoth('success', '[企业微信] 企业微信已打开');
      } else {
        logToBoth('warn', '[企业微信] 警告：当前可能不是企业微信');
      }
    } catch (error) {
      logToBoth('error', '[企业微信] X 打开企业微信失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 阶段四：进入越秀地产悦秀会小程序 ====================
  
  /**
   * 进入越秀地产悦秀会小程序（OCR 版本 - 前台服务版）
   * 流程：打开企业微信 -> 下拉 -> 截图+OCR找"越秀地产悦秀会" -> 点击"越秀地产悦秀会" -> 点击"我要推荐"
   * 使用 ScreenshotService 持有 MediaProjection，解决应用切换后权限失效的问题
   */
  async searchAndEnterMiniApp(): Promise<void> {
    logToBoth('info', '[流程] 阶段三：搜索并进入小程序');
    logToBoth('info', '[流程] 阶段四：进入越秀地产悦秀会小程序');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('OCR找越秀地产悦秀会');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 检查是否被停止
      await this.checkAbort();
      
      // ========== 步骤1：请求截图权限（会启动 ScreenshotService） ==========
      logToBoth('info', '[企业微信] ⑩: 检查截图权限...');
      let hasPermission = await zbbAutomation.isMediaProjectionEnabled();
      
      if (!hasPermission) {
        logToBoth('warn', '[企业微信] ⑩: 截图权限无效，请求授权...');
        logToBoth('info', '[ZBB] 请求 MediaProjection 权限...');
        
        const granted = await zbbAutomation.requestMediaProjectionPermission();
        
        if (!granted) {
          logToBoth('error', '[企业微信] ⑩: 截图权限授权失败');
          throw new Error('截图权限授权失败');
        }
        
        logToBoth('success', '[企业微信] ⑩: 授权成功，准备截图...');
        
        // 等待 ScreenshotService 初始化完成
        await zbbAutomation.delay(500);
      }
      
      // ========== 步骤2：切换到企业微信 ==========
      logToBoth('info', '[企业微信] 正在启动应用: com.tencent.wework');
      await zbbAutomation.launchApp(APP_PACKAGES.WECHAT);
      await zbbAutomation.delay(1500);  // 等待企业微信启动
      
      // 检查是否被停止
      await this.checkAbort();
      
      // ========== 步骤3：使用原生节点查找并点击"工作台" ==========
      logToBoth('info', '[企业微信] 正在查找"工作台"...');
      
      let workbenchResult = null;
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          logToBoth('info', `[企业微信] 第 ${retry + 1} 次重试查找"工作台"...`);
          await zbbAutomation.delay(1000);
        }
        
        workbenchResult = await zbbAutomation.findElementByText('工作台');
        
        if (workbenchResult?.found && workbenchResult.boundsCenterX > 0 && workbenchResult.boundsCenterY > 0) {
          break;
        }
      }
      
      if (workbenchResult?.found && workbenchResult.boundsCenterX > 0 && workbenchResult.boundsCenterY > 0) {
        logToBoth('success', `[企业微信] ⑨: 找到"工作台" @ (${workbenchResult.boundsCenterX}, ${workbenchResult.boundsCenterY})`);
        
        // 点击"工作台"
        await zbbAutomation.delay(300);
        await zbbAutomation.click(workbenchResult.boundsCenterX, workbenchResult.boundsCenterY);
        logToBoth('success', '[企业微信] ⑨: 点击"工作台"');
      } else {
        logToBoth('error', `[企业微信] ⑨: 未找到"工作台"，请检查屏幕`);
        throw new Error('未找到"工作台"，请检查屏幕');
      }
      
      await zbbAutomation.delay(1500);  // 等待工作台页面加载
      
      // 检查是否被停止
      await this.checkAbort();
      
      // ========== 步骤4：使用原生节点查找并点击"越秀地产悦秀会" ==========
      logToBoth('info', '[企业微信] 正在查找"越秀地产悦秀会"...');
      
      let yuexiuResult = null;
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          logToBoth('info', `[企业微信] 第 ${retry + 1} 次重试查找...`);
          await zbbAutomation.delay(1000);
        }
        
        yuexiuResult = await zbbAutomation.findElementByText('越秀地产悦秀会');
        
        if (yuexiuResult?.found && yuexiuResult.boundsCenterX > 0 && yuexiuResult.boundsCenterY > 0) {
          break;
        }
      }
      
      if (yuexiuResult?.found && yuexiuResult.boundsCenterX > 0 && yuexiuResult.boundsCenterY > 0) {
        logToBoth('success', `[企业微信] ⑩: 找到"越秀地产悦秀会" @ (${yuexiuResult.boundsCenterX}, ${yuexiuResult.boundsCenterY})`);
        
        // 点击"越秀地产悦秀会"
        await zbbAutomation.delay(300);
        await zbbAutomation.click(yuexiuResult.boundsCenterX, yuexiuResult.boundsCenterY);
        logToBoth('success', '[企业微信] ⑩: 点击"越秀地产悦秀会"进入小程序');
      } else {
        logToBoth('error', `[企业微信] ⑩: 未找到"越秀地产悦秀会"，请检查屏幕`);
        throw new Error('未找到"越秀地产悦秀会"小程序，请检查屏幕');
      }
      
      // 等待小程序加载
      logToBoth('info', '[企业微信] 等待小程序加载...');
      await zbbAutomation.delay(3000);
      
      // 检查是否被停止
      await this.checkAbort();
      
      // ========== 步骤4：点击"我要推荐" ==========
      logToBoth('info', '[小程序] ⑫: 点击"我要推荐"...');
      
      // 先用 OCR 查找"我要推荐"
      const tuijianResult = await zbbAutomation.findTextByMLKit('我要推荐');
      
      if (tuijianResult?.found && tuijianResult.centerX && tuijianResult.centerY) {
        await zbbAutomation.click(tuijianResult.centerX, tuijianResult.centerY);
        logToBoth('success', '[小程序] ⑫: 点击"我要推荐"成功');
      } else {
        // 尝试原生节点查找
        const recommendElement = await zbbAutomation.findElementByText('我要推荐');
        if (recommendElement?.found && recommendElement.boundsCenterX && recommendElement.boundsCenterY) {
          await zbbAutomation.click(recommendElement.boundsCenterX, recommendElement.boundsCenterY);
          logToBoth('success', '[小程序] ⑫: 点击"我要推荐"(原生节点)');
        } else {
          // 备用坐标：屏幕中心偏下
          const screenSize = await zbbAutomation.getScreenSize();
          const backupX = screenSize?.width ? screenSize.width * 0.5 : 180;
          const backupY = screenSize?.height ? screenSize.height * 0.65 : 506;
          await zbbAutomation.click(backupX, backupY);
          logToBoth('warn', `[小程序] ⑫: 点击"我要推荐"(备用坐标: ${backupX}, ${backupY})`);
        }
      }
      
      // 等待页面加载
      logToBoth('info', '[小程序] 等待页面加载...');
      await zbbAutomation.delay(5000);
      
      // 检查是否被停止
      await this.checkAbort();
      
      // 检查是否进入报备页面
      logToBoth('info', '[小程序] 检查是否进入报备页面...');
      const inReportPage = await this.checkScreenText('姓名', 3) ||
                          await this.checkScreenText('客户', 3) ||
                          await this.checkScreenText('报备', 3);
      
      if (inReportPage) {
        logToBoth('success', '[小程序] 已进入报备页面');
        return;
      }
      
      logToBoth('warn', '[小程序] 未检测到报备页面特征，继续执行...');
      return;
      
    } catch (error) {
      logToBoth('error', '[企业微信] X 进入越秀地产悦秀会小程序失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 校准流程（新增）====================
  
  /**
   * 运行校准流程
   * 由于无法在服务层直接获取用户点击坐标，此方法会通知前端显示校准界面
   * 前端校准完成后，坐标会自动保存到 CalibrationService
   * 
   * 注意：实际的坐标获取在 UI 层面完成
   */
  async runCalibrationFlow(): Promise<void> {
    logToBoth('info', '[校准] 开始校准流程...');
    
    try {
      const calibrationService = CalibrationService.getInstance();
      
      // 通知前端显示校准界面
      // 前端应该监听这个事件并显示校准 UI
      logToBoth('info', '[校准] 等待前端校准界面完成...');
      
      // 由于无法直接在服务层获取点击坐标，我们需要通过事件机制
      // 这里设置一个状态，通知 UI 显示校准界面
      this.isCalibrating = true;
      automationEngine.updateCurrentStep('校准中');
      
      // 提示用户
      await zbbAutomation.showToast('请在校准界面中依次点击两个位置');
      
      // 等待校准完成（由 UI 层调用 completeCalibrationWithCoords 通知完成）
      // 最大等待时间 60 秒
      const maxWaitTime = 60000;
      const startTime = Date.now();
      
      while (this.isCalibrating) {
        if (Date.now() - startTime > maxWaitTime) {
          this.isCalibrating = false;
          throw new Error('校准超时');
        }
        await zbbAutomation.delay(500);
        
        // 检查是否被停止
        await this.checkAbort();
      }
      
      // 检查校准是否成功
      const calibrationData = await calibrationService.getCalibrationData();
      if (!calibrationData.greenCloud || !calibrationData.recommendBtn) {
        throw new Error('校准数据不完整');
      }
      
      logToBoth('success', '[校准] 校准完成！');
      logToBoth('success', `[校准] 越秀地产悦秀会坐标: (${calibrationData.greenCloud.x}, ${calibrationData.greenCloud.y})`);
      logToBoth('success', `[校准] 我要推荐坐标: (${calibrationData.recommendBtn.x}, ${calibrationData.recommendBtn.y})`);
      
    } catch (error) {
      this.isCalibrating = false;
      logToBoth('error', '[校准] 校准失败: ' + error);
      throw error;
    }
  }
  
  /**
   * 完成校准（由 UI 层调用）
   * @param greenCloudX 越秀地产悦秀会 X 坐标
   * @param greenCloudY 越秀地产悦秀会 Y 坐标
   * @param recommendX 我要推荐 X 坐标
   * @param recommendY 我要推荐 Y 坐标
   */
  async completeCalibrationWithCoords(
    greenCloudX: number,
    greenCloudY: number,
    recommendX: number,
    recommendY: number
  ): Promise<void> {
    try {
      const calibrationService = CalibrationService.getInstance();
      
      await calibrationService.saveGreenCloudCoords(greenCloudX, greenCloudY);
      await calibrationService.saveRecommendBtnCoords(recommendX, recommendY);
      await calibrationService.completeCalibration();
      
      this.isCalibrating = false;
      
      logToBoth('success', `[校准] 已保存坐标: 越秀地产悦秀会(${greenCloudX}, ${greenCloudY}), 我要推荐(${recommendX}, ${recommendY})`);
    } catch (error) {
      logToBoth('error', '[校准] 保存坐标失败: ' + error);
      throw error;
    }
  }
  
  /**
   * 取消校准
   */
  cancelCalibration(): void {
    this.isCalibrating = false;
    logToBoth('info', '[校准] 校准已取消');
  }
  
  // ==================== 阶段五：进入项目详情（点击"我要推荐"）====================
  
  /**
   * 进入项目详情 - 点击底部"我要推荐"按钮
   */
  async enterProjectDetails(): Promise<void> {
    logToBoth('info', '[流程] 阶段五：进入项目详情');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('点击我要推荐');
    await zbbAutomation.delay(getDelay('other'));
    
    // 检查是否被停止
    await this.checkAbort();
    
    try {
      // 获取屏幕尺寸
      const screenSize = await zbbAutomation.getScreenSize();
      
      // 先尝试文字匹配
      logToBoth('info', '[报备] 尝试点击"我要推荐"...');
      let clicked = await zbbAutomation.clickByText('我要推荐', false);
      
      // 如果文字匹配失败，使用坐标点击底部导航栏
      if (!clicked && screenSize && screenSize.width && screenSize.height) {
        logToBoth('warn', '[报备] 文字匹配失败，使用坐标点击"我要推荐"');
        // 底部导航栏"我要推荐"是第三个按钮
        const buttonX = screenSize.width * 0.50;
        const buttonY = screenSize.height * 0.92;
        clicked = await clickAtPosition(buttonX, buttonY);
        logToBoth('info', '[报备] 坐标点击: (' + buttonX.toFixed(0) + ', ' + buttonY.toFixed(0) + ')');
      }
      
      if (!clicked) {
        throw new Error('点击"我要推荐"按钮失败');
      }
      
      await zbbAutomation.delay(getDelay('other'));
      
      // OCR确认是否进入报备页面
      logToBoth('info', '[报备] 原生方案识别屏幕...');
      const screenTexts = await this.recognizeScreenText();
      logToBoth('info', '[报备] 屏幕内容: ' + screenTexts.slice(0, 15).join(', '));
      
      const hasCustomerNameField = await this.checkScreenText('客户姓名', 3) ||
                                     await this.checkScreenText('姓名', 3);
      const hasPhoneField = await this.checkScreenText('客户电话', 3) ||
                            await this.checkScreenText('手机号', 3);
      
      if (hasCustomerNameField || hasPhoneField) {
        logToBoth('success', '[报备] 已进入报备页面');
      } else {
        logToBoth('warn', '[报备] 警告：可能未进入报备页面');
      }
    } catch (error) {
      logToBoth('error', '[报备] X 点击"我要推荐"失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 阶段六：输入第一条客户信息 ====================
  
  /**
   * 输入第一条客户信息
   * 从客户表格获取最新待录入的客户信息
   */
  async inputCustomerInfoFirst(): Promise<void> {
    logToBoth('info', '[流程] 阶段六：输入第一条客户信息');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('输入客户信息');
    
    // 检查是否被停止
    await this.checkAbort();
    
    try {
      // 从客户表格获取最新待录入信息
      const customerRecord = customerTable.getLatestPending();
      
      if (!customerRecord) {
        // 备用：使用剪贴板内容
        logToBoth('warn', '[报备] 客户表格无数据，使用剪贴板内容');
        const clipboardText = await zbbAutomation.getClipboardText();
        if (clipboardText) {
          // 解析并保存到表格
          const record = await customerTable.addRecord(clipboardText);
          if (record) {
            await this.inputCustomerInfoFromRecord(record);
            return;
          }
        }
        throw new Error('无法获取客户信息');
      }
      
      await this.inputCustomerInfoFromRecord(customerRecord);
      
    } catch (error) {
      logToBoth('error', '[报备] X 输入客户信息失败: ' + error);
      throw error;
    }
  }
  
  /**
   * 从记录中输入客户信息
   */
  private async inputCustomerInfoFromRecord(record: { surname: string; gender: string; phone: string }): Promise<void> {
    const screenSize = await zbbAutomation.getScreenSize();
    
    // 步骤1: 输入客户姓名
    logToBoth('info', '[报备] 步骤1：输入客户姓名: ' + record.surname + record.gender);
    
    // 点击客户姓名输入框
    let clicked = await zbbAutomation.clickByText('客户姓名', false) ||
                  await zbbAutomation.clickByText('姓名', false);
    
    if (!clicked && screenSize) {
      // 坐标点击姓名输入框（约屏幕中间偏上位置）
      const nameInputX = screenSize.width * 0.5;
      const nameInputY = screenSize.height * 0.25;
      await clickAtPosition(nameInputX, nameInputY);
      clicked = true;
    }
    
    if (clicked) {
      await zbbAutomation.delay(500);
      await zbbAutomation.clearInput();
      await zbbAutomation.delay(200);
      await (zbbAutomation as any).inputText(record.surname + record.gender);
      await zbbAutomation.delay(getDelay('other'));
      logToBoth('success', '[报备] 姓名已输入');
    }
    
    // 步骤2: 输入客户电话
    logToBoth('info', '[报备] 步骤2：输入客户电话: ' + record.phone);
    
    // 点击客户电话输入框
    clicked = await zbbAutomation.clickByText('客户电话', false) ||
              await zbbAutomation.clickByText('手机号', false) ||
              await zbbAutomation.clickByText('电话', false);
    
    if (!clicked && screenSize) {
      // 坐标点击电话输入框（姓名输入框下方）
      const phoneInputX = screenSize.width * 0.5;
      const phoneInputY = screenSize.height * 0.35;
      await clickAtPosition(phoneInputX, phoneInputY);
      clicked = true;
    }
    
    if (clicked) {
      await zbbAutomation.delay(500);
      await zbbAutomation.clearInput();
      await zbbAutomation.delay(200);
      await (zbbAutomation as any).inputText(record.phone);
      await zbbAutomation.delay(getDelay('other'));
      logToBoth('success', '[报备] 电话已输入');
    }
  }
  
  // ==================== 阶段七：选择第一个项目并提交（第1个截图）====================
  
  /**
   * 选择第一个项目并提交
   * 项目1：郑州春月锦庐
   */
  async submitFirstProject(): Promise<void> {
    logToBoth('info', '[流程] 阶段七：选择第一个项目并提交（第1个截图）');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('报备项目1');
    
    try {
      const screenSize = await zbbAutomation.getScreenSize();
      
      // 步骤1: 点击"报备项目"下拉
      logToBoth('info', '[报备1] 步骤1：点击"报备项目"下拉...');
      
      let clicked = await zbbAutomation.clickByText('报备项目', false) ||
                    await zbbAutomation.clickByText('报备项目：', false) ||
                    await zbbAutomation.clickByText('选择项目', false);
      
      if (!clicked && screenSize) {
        // 坐标点击项目下拉框
        const projectDropX = screenSize.width * 0.5;
        const projectDropY = screenSize.height * 0.45;
        await clickAtPosition(projectDropX, projectDropY);
        clicked = true;
      }
      
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤2: 选择第一个项目（郑州春月锦庐）
      logToBoth('info', '[报备1] 步骤2：选择第一个项目（郑州春月锦庐）...');
      
      clicked = await zbbAutomation.clickByText('郑州春月锦庐', false) ||
                await zbbAutomation.clickByText('春月锦庐', false) ||
                await zbbAutomation.clickByText('春月', false);
      
      if (!clicked) {
        // 如果下拉列表没有直接显示，先确认
        await zbbAutomation.clickByText('确定', false);
        await zbbAutomation.clickByText('确认', false);
        logToBoth('warn', '[报备1] 警告：项目选择可能需要手动确认');
      } else {
        logToBoth('success', '[报备1] 项目已选择');
      }
      
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤3: 点击"确认"
      logToBoth('info', '[报备1] 步骤3：点击"确认"...');
      await zbbAutomation.clickByText('确认', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤4: 点击"全民经纪人推荐购房须知"
      logToBoth('info', '[报备1] 步骤4：点击"全民经纪人推荐购房须知"...');
      await zbbAutomation.clickByText('全民经纪人推荐购房须知', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤5: 等待8秒后，点击"我已了解"
      logToBoth('info', '[报备1] 步骤5：等待8秒后，点击"我已了解"...');
      await zbbAutomation.delay(8000);
      await zbbAutomation.clickByText('我已了解', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤6: 点击"立即推荐"
      logToBoth('info', '[报备1] 步骤6：点击"立即推荐"...');
      await zbbAutomation.clickByText('立即推荐', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤7: 自动截图保存
      logToBoth('info', '[报备1] 步骤7：自动截图保存报备成功界面...');
      await this.captureAndSaveScreenshot('first_project');
      
      // 步骤8: 点击"确定"关闭弹窗
      logToBoth('info', '[报备1] 步骤8：点击"确定"关闭弹窗...');
      await zbbAutomation.clickByText('确定', false);
      await zbbAutomation.clickByText('确认', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 更新客户表格状态
      const latestRecord = customerTable.getLatest();
      if (latestRecord) {
        await customerTable.updateStatus(latestRecord.id, 'completed');
      }
      
      logToBoth('success', '[报备1] 第一项目报备完成');
      
    } catch (error) {
      logToBoth('error', '[报备1] X 报备失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 阶段八：输入第二条客户信息（同一组数据）====================
  
  /**
   * 输入第二条客户信息（同一组数据）
   * 直接再次输入相同的姓名和电话
   */
  async inputCustomerInfoSecond(): Promise<void> {
    logToBoth('info', '[流程] 阶段八：输入第二条客户信息（同一组数据）');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('输入客户信息2');
    
    try {
      // 从客户表格获取最新记录
      const customerRecord = customerTable.getLatest();
      
      if (!customerRecord) {
        logToBoth('error', '[报备2] X 无法获取客户信息');
        throw new Error('无法获取客户信息');
      }
      
      const screenSize = await zbbAutomation.getScreenSize();
      
      // 步骤1: 输入客户姓名
      logToBoth('info', '[报备2] 步骤1：输入相同的客户姓名...');
      
      let clicked = await zbbAutomation.clickByText('客户姓名', false) ||
                    await zbbAutomation.clickByText('姓名', false);
      
      if (!clicked && screenSize) {
        const nameInputX = screenSize.width * 0.5;
        const nameInputY = screenSize.height * 0.25;
        await clickAtPosition(nameInputX, nameInputY);
        clicked = true;
      }
      
      if (clicked) {
        await zbbAutomation.delay(500);
        await zbbAutomation.clearInput();
        await zbbAutomation.delay(200);
        await (zbbAutomation as any).inputText(customerRecord.surname + customerRecord.gender);
        await zbbAutomation.delay(getDelay('other'));
        logToBoth('success', '[报备2] 姓名已输入');
      }
      
      // 步骤2: 输入客户电话
      logToBoth('info', '[报备2] 步骤2：输入相同的客户电话...');
      
      clicked = await zbbAutomation.clickByText('客户电话', false) ||
                await zbbAutomation.clickByText('手机号', false) ||
                await zbbAutomation.clickByText('电话', false);
      
      if (!clicked && screenSize) {
        const phoneInputX = screenSize.width * 0.5;
        const phoneInputY = screenSize.height * 0.35;
        await clickAtPosition(phoneInputX, phoneInputY);
        clicked = true;
      }
      
      if (clicked) {
        await zbbAutomation.delay(500);
        await zbbAutomation.clearInput();
        await zbbAutomation.delay(200);
        await (zbbAutomation as any).inputText(customerRecord.phone);
        await zbbAutomation.delay(getDelay('other'));
        logToBoth('success', '[报备2] 电话已输入');
      }
      
    } catch (error) {
      logToBoth('error', '[报备2] X 输入客户信息失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 阶段九：选择第二个项目并提交（第2个截图）====================
  
  /**
   * 选择第二个项目并提交
   * 项目2：郑州湖畔雲庐
   */
  async submitSecondProject(): Promise<void> {
    logToBoth('info', '[流程] 阶段九：选择第二个项目并提交（第2个截图）');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('报备项目2');
    
    try {
      const screenSize = await zbbAutomation.getScreenSize();
      
      // 步骤1: 点击"报备项目"下拉
      logToBoth('info', '[报备2] 步骤1：点击"报备项目"下拉...');
      
      let clicked = await zbbAutomation.clickByText('报备项目', false) ||
                    await zbbAutomation.clickByText('报备项目：', false) ||
                    await zbbAutomation.clickByText('选择项目', false);
      
      if (!clicked && screenSize) {
        const projectDropX = screenSize.width * 0.5;
        const projectDropY = screenSize.height * 0.45;
        await clickAtPosition(projectDropX, projectDropY);
        clicked = true;
      }
      
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤2: 选择第二个项目（郑州湖畔雲庐）
      logToBoth('info', '[报备2] 步骤2：选择第二个项目（郑州湖畔雲庐）...');
      
      clicked = await zbbAutomation.clickByText('郑州湖畔雲庐', false) ||
                await zbbAutomation.clickByText('湖畔雲庐', false) ||
                await zbbAutomation.clickByText('湖畔', false);
      
      if (!clicked) {
        await zbbAutomation.clickByText('确定', false);
        await zbbAutomation.clickByText('确认', false);
        logToBoth('warn', '[报备2] 警告：项目选择可能需要手动确认');
      } else {
        logToBoth('success', '[报备2] 项目已选择');
      }
      
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤3: 点击"确认"
      logToBoth('info', '[报备2] 步骤3：点击"确认"...');
      await zbbAutomation.clickByText('确认', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤4: 点击"全民经纪人推荐购房须知"
      logToBoth('info', '[报备2] 步骤4：点击"全民经纪人推荐购房须知"...');
      await zbbAutomation.clickByText('全民经纪人推荐购房须知', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤5: 等待8秒后，点击"我已了解"
      logToBoth('info', '[报备2] 步骤5：等待8秒后，点击"我已了解"...');
      await zbbAutomation.delay(8000);
      await zbbAutomation.clickByText('我已了解', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤6: 点击"立即推荐"
      logToBoth('info', '[报备2] 步骤6：点击"立即推荐"...');
      await zbbAutomation.clickByText('立即推荐', false);
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤7: 自动截图保存
      logToBoth('info', '[报备2] 步骤7：自动截图保存报备成功界面...');
      await this.captureAndSaveScreenshot('second_project');
      
      // 步骤8: 点击"确定"关闭弹窗
      logToBoth('info', '[报备2] 步骤8：点击"确定"关闭弹窗...');
      await zbbAutomation.clickByText('确定', false);
      await zbbAutomation.clickByText('确认', false);
      await zbbAutomation.delay(getDelay('other'));
      
      logToBoth('success', '[报备2] 第二项目报备完成');
      
    } catch (error) {
      logToBoth('error', '[报备2] X 报备失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 阶段十：返回企业微信首页 ====================
  
  /**
   * 返回企业微信首页/关闭企业微信
   */
  async returnToWechatHome(): Promise<void> {
    logToBoth('info', '[流程] 阶段十：返回企业微信首页');
    automationEngine.updateCurrentApp('企业微信');
    automationEngine.updateCurrentStep('返回企业微信');
    
    try {
      // 按返回键返回企业微信首页
      logToBoth('info', '[返回] 正在返回企业微信首页...');
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(getDelay('other'));
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(getDelay('other'));
      
      logToBoth('success', '[返回] 已返回企业微信首页');
      await zbbAutomation.showToast('返回: 已返回企业微信首页!');
    } catch (error) {
      logToBoth('error', '[返回] X 返回失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 辅助方法 ====================
  
  /**
   * 截图并保存
   */
  private async captureAndSaveScreenshot(type: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').substring(0, 15);
      const filename = `${timestamp}_${type}.png`;
      
      const screenshot = await zbbAutomation.takeScreenshot();
      if (screenshot) {
        this.screenshotPaths.push(screenshot);
        logToBoth('success', '[截图] 已保存: ' + filename);
        await zbbAutomation.showToast('截图已保存: ' + filename);
      } else {
        logToBoth('warn', '[截图] 截图失败');
      }
      
      return filename;
    } catch (error) {
      logToBoth('error', '[截图] 截图异常: ' + error);
      return '';
    }
  }
  
  /**
   * 获取当前客户信息
   */
  getCustomerInfo(): CustomerInfo | null {
    return this.customerInfo;
  }
  
  /**
   * 设置客户信息
   */
  setCustomerInfo(info: CustomerInfo): void {
    this.customerInfo = info;
  }
  
  /**
   * 设置好友名称
   */
  setFriendName(name: string): void {
    this.friendName = name;
  }
  
  /**
   * 是否正在运行
   */
  isInProgress(): boolean {
    return this.isRunning;
  }
  
  // ==================== 完整流程执行 ====================
  
  /**
   * 执行完整的自动化流程
   * 流程：抖音获取信息 -> 企业微信报备 -> 抖音发送截图
   */
  async executeFullFlow(): Promise<{ success: boolean; customerInfo: CustomerInfo | null; screenshots: string[] }> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    this.isAborted = false;
    this.screenshotPaths = [];
    
    // 显示悬浮窗
    await zbbAutomation.showFloatingWindow();
    await zbbAutomation.updateFloatingStep('正在启动...', 0, 14);
    
    await zbbAutomation.showToast('ZBB 自动化流程开始！');
    
    logToBoth('info', '========================================');
    logToBoth('info', '       ZBB 自动化流程开始执行');
    logToBoth('info', '========================================');
    
    try {
      // 阶段一：从抖音获取客户信息
      logToBoth('info', '[流程] 阶段一：从抖音获取客户信息');
      
      this.notifyStepUpdate('打开抖音', 0);
      await this.stepOpenDouyin();
      
      this.notifyStepUpdate('点击消息', 1);
      await this.stepClickMessages();
      
      this.notifyStepUpdate('查找好友', 2);
      await this.stepFindFriend();
      
      this.notifyStepUpdate('进入聊天', 3);
      await this.stepClickChat();
      
      this.notifyStepUpdate('长按消息', 4);
      await this.stepLongPressMessage();
      
      this.notifyStepUpdate('复制信息', 5);
      await this.stepClickCopy();
      
      // 读取并解析客户信息
      await zbbAutomation.showToast('正在读取客户信息...');
      const clipboardText = await zbbAutomation.getClipboardText();
      logToBoth('info', `[流程] 剪贴板内容: "${clipboardText}"`);
      
      if (clipboardText) {
        // 解析姓名和电话
        const phonePattern = /1[3-9]\d{9}/;
        const namePattern = /[\u4e00-\u9fa5]{2,4}/;
        
        const phoneMatch = clipboardText.match(phonePattern);
        const nameMatch = clipboardText.match(namePattern);
        
        logToBoth('info', `[流程] 姓名匹配: ${JSON.stringify(nameMatch)}, 电话匹配: ${JSON.stringify(phoneMatch)}`);
        
        if (nameMatch && phoneMatch) {
          this.customerInfo = {
            name: nameMatch[0],
            phone: phoneMatch[0],
            rawMessage: clipboardText,
          };
          automationEngine.setCustomerInfo(this.customerInfo);
          await zbbAutomation.showToast(`客户信息: ${this.customerInfo.name} ${this.customerInfo.phone}`);
          logToBoth('success', `[流程] 姓名=${this.customerInfo.name}, 电话=${this.customerInfo.phone}`);
        } else {
          logToBoth('warn', '[流程] 信息解析不完整');
          // 尝试拆分流式格式（如"李先生15014236541"）
          if (phoneMatch) {
            const phoneIndex = clipboardText.indexOf(phoneMatch[0]);
            const possibleName = clipboardText.substring(0, phoneIndex).trim();
            const extractedName = possibleName.match(/[\u4e00-\u9fa5]+/);
            if (extractedName) {
              this.customerInfo = {
                name: extractedName[0],
                phone: phoneMatch[0],
                rawMessage: clipboardText,
              };
              automationEngine.setCustomerInfo(this.customerInfo);
              await zbbAutomation.showToast(`客户信息: ${this.customerInfo.name} ${this.customerInfo.phone}`);
              logToBoth('success', `[流程] 姓名=${this.customerInfo.name}, 电话=${this.customerInfo.phone}`);
            }
          }
        }
      }
      
      // ========== 阶段二：打开企业微信 ==========
      // 注意：MediaProjection 权限已在首页检查并授权
      logToBoth('info', '[流程] 阶段二：打开企业微信');
      this.notifyStepUpdate('打开企业微信', 6);
      await this.openWechat();
      
      // 阶段三：搜索并进入越秀地产悦秀会小程序
      logToBoth('info', '[流程] 阶段三：搜索并进入小程序');
      this.notifyStepUpdate('搜索小程序', 7);
      await this.searchAndEnterMiniApp();
      
      // 阶段四：进入项目详情
      logToBoth('info', '[流程] 阶段四：进入项目详情');
      this.notifyStepUpdate('进入项目', 8);
      await this.enterProjectDetails();
      
      // 阶段五：报备第一个项目
      logToBoth('info', '[流程] 阶段五：报备第一项目');
      this.notifyStepUpdate('报备项目1', 9);
      await this.submitFirstProject();
      
      // 阶段六：报备第二个项目
      logToBoth('info', '[流程] 阶段六：报备第二项目');
      this.notifyStepUpdate('报备项目2', 10);
      await this.submitSecondProject();
      
      // 阶段七：返回企业微信首页
      logToBoth('info', '[流程] 阶段七：返回企业微信首页');
      this.notifyStepUpdate('返回企业微信', 11);
      await this.returnToWechatHome();
      
      // 阶段八：发送截图到抖音
      logToBoth('info', '[流程] 阶段八：发送截图到抖音');
      this.notifyStepUpdate('发送截图', 12);
      await this.sendScreenshotsAndExit();
      
      await zbbAutomation.showToast('ZBB 自动化流程执行完成！');
      logToBoth('success', '========================================');
      logToBoth('success', '       ZBB 自动化流程执行完成！');
      logToBoth('success', '========================================');
      
      // 通知流程完成
      this.notifyStepUpdate('流程完成', 13);
      
      // 设置悬浮窗完成状态
      zbbAutomation.setFloatingComplete();
      
      return {
        success: true,
        customerInfo: this.customerInfo,
        screenshots: [...this.screenshotPaths],
      };
      
    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', `       流程执行失败: ${error}`);
      logToBoth('error', '========================================');
      
      // 隐藏悬浮窗
      zbbAutomation.hideFloatingWindow();
      
      return {
        success: false,
        customerInfo: this.customerInfo,
        screenshots: [...this.screenshotPaths],
      };
      
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 调试：打印当前界面所有文字及坐标
   */
  async debugPrintScreenText(): Promise<any[]> {
    try {
      logToBoth('info', '========================================');
      logToBoth('info', '[调试] 打印当前界面所有文字...');
      
      // 使用 Kotlin 方法获取所有文字节点
      const nodes = await zbbAutomation.getAllTextNodes();
      
      if (!nodes || nodes.length === 0) {
        logToBoth('info', '[调试] 未找到任何文字节点');
      } else {
        logToBoth('info', `[调试] 共找到 ${nodes.length} 个文字节点：`);
        
        // 按 Y 坐标排序（从上到下）
        const sortedNodes = [...nodes].sort((a, b) => a.centerY - b.centerY);
        
        sortedNodes.forEach((node, index) => {
          const text = node.text?.substring(0, 30) || '';
          logToBoth('info', `[调试] ${index + 1}. "${text}" @ (${node.centerX?.toFixed(0)}, ${node.centerY?.toFixed(0)}) [${node.type}]`);
        });
        
        // 保存到成员变量，供其他方法使用
        this._lastScreenshotNodes = nodes;
      }
      
      logToBoth('info', '========================================');
      return nodes || [];
    } catch (error) {
      logToBoth('error', `[调试] 打印失败: ${error}`);
      return [];
    }
  }

  /**
   * 使用 getAllTextNodes 查找文字并点击
   * 解决小程序 WebView 中 findElementByText 无法工作的问题
   */
  /**
   * 查找文字并点击
   * @param text 要查找的文字
   * @param maxRetries 最大重试次数
   * @param selectBy 选择逻辑：'first' | 'last' | 'yMin' | 'yMax'
   *   - 'first': 选择第一个（默认）
   *   - 'last': 选择最后一个
   *   - 'yMin': 选择 Y 值最小的（屏幕上方）
   *   - 'yMax': 选择 Y 值最大的（屏幕下方）
   */
  async findTextAndClick(
    text: string, 
    maxRetries: number = 5,
    selectBy: 'first' | 'last' | 'yMin' | 'yMax' = 'first'
  ): Promise<{ success: boolean; centerX?: number; centerY?: number; count?: number }> {
    for (let i = 1; i <= maxRetries; i++) {
      await zbbAutomation.delay(1500);
      
      // 使用 getAllTextNodes 获取所有文字节点
      const nodes = await zbbAutomation.getAllTextNodes();
      
      if (nodes && nodes.length > 0) {
        // 查找所有包含目标文字的节点
        const matchedNodes = nodes.filter(node => 
          node.text?.includes(text) || node.contentDesc?.includes(text)
        );
        
        if (matchedNodes.length > 0) {
          // 根据选择逻辑选择节点
          let targetNode = matchedNodes[0];
          
          if (matchedNodes.length > 1) {
            logToBoth('info', `[查找] 找到 ${matchedNodes.length} 个"${text}"，按 ${selectBy} 选择`);
            
            switch (selectBy) {
              case 'last':
                targetNode = matchedNodes[matchedNodes.length - 1];
                break;
              case 'yMin':
                // Y 值最小的（屏幕上方）
                matchedNodes.sort((a, b) => (a.centerY || 0) - (b.centerY || 0));
                targetNode = matchedNodes[0];
                break;
              case 'yMax':
                // Y 值最大的（屏幕下方）
                matchedNodes.sort((a, b) => (b.centerY || 0) - (a.centerY || 0));
                targetNode = matchedNodes[0];
                break;
              default:
                // 'first' - 使用第一个
                targetNode = matchedNodes[0];
            }
          }
          
          if (targetNode && targetNode.centerX && targetNode.centerY) {
            logToBoth('info', `[查找] 找到"${text}" @ (${targetNode.centerX?.toFixed(0)}, ${targetNode.centerY?.toFixed(0)})`);
            await zbbAutomation.click(targetNode.centerX, targetNode.centerY);
            return { success: true, centerX: targetNode.centerX, centerY: targetNode.centerY, count: matchedNodes.length };
          } else if (targetNode) {
            logToBoth('info', `[查找] 找到"${text}"但坐标无效`);
          }
        }
      }
      
      if (i < maxRetries) {
        logToBoth('info', `[查找] 第 ${i + 1} 次重试查找"${text}"...`);
      }
    }
    
    return { success: false };
  }

  /**
   * 测试企业微信流程（仅测试企业微信部分，不包含抖音）
   * 流程：打开企业微信 -> 点击工作台 -> 点击越秀地产悦秀会 -> 点击我要推荐
   */
  async testWechatOnly(): Promise<{ success: boolean; error?: string }> {
    logToBoth('info', '========================================');
    logToBoth('info', '       开始测试：企业微信流程');
    logToBoth('info', '========================================');
    
    try {
      this.isRunning = true;
      
      // ========== 步骤0：初始化数据库并写入预置客户数据 ==========
      logToBoth('info', '[企业微信测试] 步骤0：初始化数据库并写入预置客户数据');
      const { initDatabase, insertReport, printAllReports } = await import('./DatabaseService');
      await initDatabase();
      
      // 预置客户数据
      const presetCustomers = [
        { name: '刘先生', phone: '13213432247' },
        { name: '王女士', phone: '13213432298' },
        { name: '蔡先生', phone: '13213432324' },
        { name: '蔡先生', phone: '13213432324' },
      ];
      
      // 写入数据库
      const customerIds: number[] = [];
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      for (const customer of presetCustomers) {
        // 提取姓氏（去掉"先生"/"女士"）
        const surname = customer.name.replace(/先生|女士/, '');
        const id = await insertReport(now, surname, customer.phone);
        customerIds.push(id);
        logToBoth('info', `[企业微信测试] 步骤0：写入客户 "${customer.name}" (ID=${id})`);
      }
      
      logToBoth('success', `[企业微信测试] 步骤0：共写入 ${presetCustomers.length} 条客户数据`);
      await printAllReports();
      
      // 检查无障碍服务
      const ready = await this.checkServiceReady();
      if (!ready) {
        throw new Error('无障碍服务未就绪');
      }
      
      // ========== 步骤1：打开企业微信 ==========
      logToBoth('info', '[企业微信测试] 步骤1：打开企业微信');
      await this.openWechat();
      await zbbAutomation.delay(3000);  // 增加等待时间
      
      // ========== 调试：打印当前界面文字 ==========
      await this.debugPrintScreenText();
      
      // ========== 步骤2：点击"工作台" ==========
      logToBoth('info', '[企业微信测试] 步骤2：点击"工作台"');
      
      let workbenchResult = null;
      for (let retry = 0; retry < 5; retry++) {
        if (retry > 0) {
          logToBoth('info', `[企业微信测试] 第 ${retry + 1} 次重试查找"工作台"...`);
          await zbbAutomation.delay(2000);
          await this.debugPrintScreenText();  // 每次重试前打印界面
        }
        
        workbenchResult = await zbbAutomation.findElementByText('工作台');
        
        logToBoth('info', `[企业微信测试] findElementByText 返回: found=${workbenchResult?.found}, x=${workbenchResult?.centerX}, y=${workbenchResult?.centerY}`);
        
        if (workbenchResult?.found && workbenchResult?.centerX && workbenchResult?.centerY) {
          break;
        }
        
        if (workbenchResult?.found && workbenchResult.centerX > 0 && workbenchResult.centerY > 0) {
          break;
        }
      }
      
      if (!workbenchResult?.found || workbenchResult.centerX <= 0 || workbenchResult.centerY <= 0) {
        throw new Error('未找到"工作台"');
      }
      
      logToBoth('success', `[企业微信测试] 找到"工作台" @ (${workbenchResult.centerX}, ${workbenchResult.centerY})`);
      await zbbAutomation.click(workbenchResult.centerX, workbenchResult.centerY);
      
      // ========== 步骤3：进入工作台后，等待并下滑 ==========
      logToBoth('info', '[企业微信测试] 步骤3：进入工作台，等待加载...');
      await zbbAutomation.delay(4000 + Math.random() * 2000);  // 等待 4-6 秒
      
      // 下滑屏幕 3 次
      for (let i = 1; i <= 3; i++) {
        logToBoth('info', `[企业微信测试] 第 ${i} 次下滑...`);
        await zbbAutomation.swipe(540, 1800, 540, 600, 500);
        await zbbAutomation.delay(2000 + Math.random() * 500);  // 等待 2-2.5 秒
      }
      
      // 打印当前界面所有文字
      logToBoth('info', '[企业微信测试] 打印当前界面所有文字...');
      await zbbAutomation.delay(1000 + Math.random() * 1000);  // 等待 1-2 秒
      await this.debugPrintScreenText();
      
      // ========== 步骤4：点击"越秀地产悦秀会" ==========
      logToBoth('info', '[企业微信测试] 步骤4：点击"越秀地产悦秀会"');
      
      const yuexiuResult = await this.findTextAndClick('越秀地产悦秀会');
      
      if (!yuexiuResult.success) {
        throw new Error('未找到"越秀地产悦秀会"');
      }
      
      // 等待 3-4 秒，让页面加载完成（增加等待时间）
      await zbbAutomation.delay(3000 + Math.random() * 1000);
      
      // ========== 步骤5：打印小程序界面文字 ==========
      logToBoth('info', '[企业微信测试] 步骤5：打印小程序界面文字');
      await this.debugPrintScreenText();
      
      // ========== 步骤6：点击"推荐赚佣" ==========
      logToBoth('info', '[企业微信测试] 步骤6：点击"查看更多"');
      
      // 额外等待 2 秒，确保界面稳定
      await zbbAutomation.delay(2000);
      
      // 如果有多个"查看更多"，选择 Y 值最小的（屏幕上方）
      const viewMoreResult = await this.findTextAndClick('查看更多', 5, 'yMin');
      
      if (!viewMoreResult.success) {
        throw new Error('未找到"查看更多"');
      }
      
      // ========== 步骤7：打印点击后的界面内容 ==========
      logToBoth('info', '[企业微信测试] 步骤7：打印点击后界面内容');
      await zbbAutomation.delay(4000 + Math.random() * 1000);  // 等待 4-5 秒，让页面加载完成
      await this.debugPrintScreenText();
      
      // ========== 步骤8：点击"去推荐"（越秀·金水云启，下方第一个）============
      /**
       * 点击"去推荐"的逻辑：
       * 1. 优先找越秀·金水云启下方的"去推荐"（Y值最小，最接近楼盘）
       * 2. 找不到越秀·金水云启时，找任意"去推荐"并选择中间位置的
       */
      const clickGoRecommend = async (): Promise<{ success: boolean; goRecommendBtn?: any }> => {
        const nodes = await zbbAutomation.getAllTextNodes();
        
        // 1. 找"越秀·金水云启"
        const targetBuilding = nodes.find(n => n.text && n.text.includes('越秀·金水云启'));
        
        if (targetBuilding) {
          logToBoth('info', `[企业微信测试] 找到"越秀·金水云启" @ (${targetBuilding.centerX}, ${targetBuilding.centerY})`);
          
          // 2. 找所有"去推荐"
          const allGoRecommend = nodes.filter(n => n.text === '去推荐');
          
          if (allGoRecommend.length === 0) {
            logToBoth('error', '[企业微信测试] 未找到任何"去推荐"');
            return { success: false };
          }
          
          // 3. 筛选 Y 值大于金水云启的"去推荐"
          const goRecommendBelow = allGoRecommend.filter(n => n.centerY > targetBuilding.centerY);
          
          let targetButton;
          if (goRecommendBelow.length > 0) {
            // 4. 选择 Y 值最小的（最接近楼盘的）
            targetButton = goRecommendBelow.reduce((min, curr) => 
              curr.centerY < min.centerY ? curr : min
            );
            logToBoth('info', `[企业微信测试] 找到越秀·金水云启下方 ${goRecommendBelow.length} 个"去推荐"，选择 Y 值最小 @ (${targetButton.centerX}, ${targetButton.centerY})`);
          } else {
            // 降级：找不到下方的，选择中间的"去推荐"
            const middleIndex = Math.floor(allGoRecommend.length / 2);
            targetButton = allGoRecommend[middleIndex];
            logToBoth('warn', `[企业微信测试] 无越秀·金水云启下方的"去推荐"，选择中间的 @ (${targetButton.centerX}, ${targetButton.centerY})`);
          }
          
          logToBoth('info', `[企业微信测试] 点击"去推荐" @ (${targetButton.centerX}, ${targetButton.centerY})`);
          await zbbAutomation.click(targetButton.centerX, targetButton.centerY);
          return { success: true, goRecommendBtn: targetButton };
        } else {
          // 降级：找不到"越秀·金水云启"
          logToBoth('warn', '[企业微信测试] 未找到"越秀·金水云启"，尝试点击中间的"去推荐"');
          const allGoRecommend = nodes.filter(n => n.text === '去推荐');
          
          if (allGoRecommend.length === 0) {
            logToBoth('error', '[企业微信测试] 未找到任何"去推荐"');
            return { success: false };
          }
          
          // 选择中间的"去推荐"，避免点到最上面或最下面的
          const middleIndex = Math.floor(allGoRecommend.length / 2);
          const targetButton = allGoRecommend[middleIndex];
          logToBoth('info', `[企业微信测试] 选择中间的"去推荐"(${middleIndex + 1}/${allGoRecommend.length}) @ (${targetButton.centerX}, ${targetButton.centerY})`);
          await zbbAutomation.click(targetButton.centerX, targetButton.centerY);
          return { success: true, goRecommendBtn: targetButton };
        }
      };
      
      // 执行步骤8
      logToBoth('info', '[企业微信测试] 步骤8：点击"去推荐"');
      const clickResult = await clickGoRecommend();
      
      if (!clickResult.success) {
        throw new Error('未找到"去推荐"按钮');
      }
      
      // ========== 步骤8.5：验证是否成功进入推荐页面 ==========
      logToBoth('info', '[企业微信测试] 步骤8.5：验证是否成功进入推荐页面');
      
      await zbbAutomation.delay(2500);  // 等待页面加载
      
      let verifyNodes = await zbbAutomation.getAllTextNodes();
      let hasNameField = verifyNodes.some(n => n.text && n.text.includes('*姓名'));
      let hasPhoneField = verifyNodes.some(n => n.text && (n.text.includes('+86') || n.text.includes('手机')));
      
      // 重试机制：最多重试3次
      let retryCount = 0;
      const maxRetries = 3;
      
      while ((!hasNameField && !hasPhoneField) && retryCount < maxRetries) {
        retryCount++;
        logToBoth('warn', `[企业微信测试] 验证失败（第${retryCount}次）：未找到"姓名"或"手机号"字段`);
        logToBoth('info', `[企业微信测试] 右滑退回，重新点击"去推荐"...`);
        
        // 右滑退回上一页
        await zbbAutomation.swipe(800, 600, 100, 600, 500);
        await zbbAutomation.delay(2000);  // 等待页面返回
        
        // 打印界面
        logToBoth('info', '[企业微信测试] 打印退回后的界面内容');
        await this.debugPrintScreenText();
        
        // 重新点击"去推荐"
        logToBoth('info', '[企业微信测试] 重新点击"去推荐"');
        const retryResult = await clickGoRecommend();
        
        if (!retryResult.success) {
          throw new Error(`重试${retryCount}次后仍未找到"去推荐"按钮`);
        }
        
        await zbbAutomation.delay(2500);  // 等待页面加载
        verifyNodes = await zbbAutomation.getAllTextNodes();
        hasNameField = verifyNodes.some(n => n.text && n.text.includes('*姓名'));
        hasPhoneField = verifyNodes.some(n => n.text && (n.text.includes('+86') || n.text.includes('手机')));
      }
      
      if (hasNameField || hasPhoneField) {
        logToBoth('success', `[企业微信测试] 验证通过：已进入推荐页面（重试${retryCount}次）`);
      } else {
        logToBoth('error', `[企业微信测试] 重试${maxRetries}次后仍未进入推荐页面`);
        throw new Error('多次重试后仍未成功进入推荐页面');
      }
      
      // ========== 步骤9：打印点击"去推荐"后界面内容 ==========
      logToBoth('info', '[企业微信测试] 步骤9：打印点击"去推荐"后界面内容');
      
      // 等待页面加载
      await zbbAutomation.delay(2000 + Math.random() * 1000);
      
      // 打印当前界面
      await this.debugPrintScreenText();
      
      // ========== 步骤9.5：从数据库获取待报备客户列表 ==========
      logToBoth('info', '[企业微信测试] 步骤9.5：从数据库获取待报备客户列表');
      const { getAllReports, updateReportSuccess, updateReportFailed } = await import('./DatabaseService');
      const allReports = await getAllReports();
      const pendingReports = allReports.filter(r => r.report_status === 'pending');
      
      if (pendingReports.length === 0) {
        logToBoth('error', '[企业微信测试] 步骤9.5：数据库中没有待报备的客户');
        throw new Error('没有待报备的客户');
      }
      
      logToBoth('info', `[企业微信测试] 步骤9.5：找到 ${pendingReports.length} 个待报备客户`);
      
      // ========== 循环处理每个客户 ==========
      for (let customerIndex = 0; customerIndex < pendingReports.length; customerIndex++) {
        const customer = pendingReports[customerIndex];
        const fullName = customer.surname + (customer.surname.includes('蔡') ? '先生' : (customer.surname.includes('王') ? '女士' : '先生'));
        
        logToBoth('info', '========================================');
        logToBoth('info', `[企业微信测试] 开始处理第 ${customerIndex + 1}/${pendingReports.length} 个客户: ${fullName} ${customer.phone}`);
        logToBoth('info', '========================================');
        
        // 粘贴按钮相对于输入框的偏移量（根据实测校准）
        const PASTE_OFFSET_X = -100;
        const PASTE_OFFSET_Y = -100;
        
        // ========== 步骤10：输入姓名 ==========
        logToBoth('info', `[企业微信测试] 步骤10：输入姓名"${fullName}"`);
        
        // 1. 复制到剪贴板
        logToBoth('info', `[企业微信测试] 步骤10：复制"${fullName}"到剪贴板`);
        await zbbAutomation.pasteText(fullName);
        await zbbAutomation.delay(500);
        
        // 2. 点击姓名输入框（姓名标签"*"在177,1130，输入框在其右侧）
        const nameInputX = 350;
        const nameInputY = 1130;
        logToBoth('info', `[企业微信测试] 步骤10：点击姓名输入框 (${nameInputX}, ${nameInputY})`);
        await zbbAutomation.click(nameInputX, nameInputY);
        await zbbAutomation.delay(1500);  // 等待键盘弹出
        
        // 3. 长按输入框，触发粘贴弹出菜单
        logToBoth('info', `[企业微信测试] 步骤10：长按输入框触发粘贴菜单`);
        await zbbAutomation.longClick(nameInputX, nameInputY, 1200);
        await zbbAutomation.delay(800);  // 等待粘贴菜单出现
        
        // 4. 打印界面，查找"粘贴"选项
        logToBoth('info', `[企业微信测试] 步骤10：打印界面查找粘贴选项`);
        await this.debugPrintScreenText();
        
        // 5. 查找并点击"粘贴"选项
        let pasted = false;
        const pasteNode = this._lastScreenNodes?.find(n => 
          n.text === '粘贴' || n.text === 'Paste' || n.text?.includes('粘贴')
        );
        if (pasteNode) {
          logToBoth('success', `[企业微信测试] 步骤10：点击"粘贴"(OCR) @ (${pasteNode.centerX}, ${pasteNode.centerY})`);
          await zbbAutomation.click(pasteNode.centerX, pasteNode.centerY);
          pasted = true;
        } else {
          // 降级：使用相对偏移计算粘贴按钮位置
          const pasteX = nameInputX + PASTE_OFFSET_X;
          const pasteY = nameInputY + PASTE_OFFSET_Y;
          logToBoth('warn', `[企业微信测试] 步骤10：OCR未找到，使用偏移计算粘贴位置 (${pasteX}, ${pasteY})`);
          await zbbAutomation.click(pasteX, pasteY);
          pasted = true;
        }
        await zbbAutomation.delay(1000);
        
        // ========== 步骤11：输入手机号 ==========
        logToBoth('info', `[企业微信测试] 步骤11：输入手机号"${customer.phone}"`);
        
        // 1. 复制到剪贴板
        logToBoth('info', `[企业微信测试] 步骤11：复制"${customer.phone}"到剪贴板`);
        await zbbAutomation.pasteText(customer.phone);
        await zbbAutomation.delay(500);
        
        // 2. 点击手机号输入框（+86在174,1262，输入框在其右侧）
        const phoneInputX = 350;
        const phoneInputY = 1262;
        logToBoth('info', `[企业微信测试] 步骤11：点击手机号输入框 (${phoneInputX}, ${phoneInputY})`);
        await zbbAutomation.click(phoneInputX, phoneInputY);
        await zbbAutomation.delay(1500);  // 等待键盘弹出
        
        // 3. 长按输入框，触发粘贴弹出菜单
        logToBoth('info', `[企业微信测试] 步骤11：长按输入框触发粘贴菜单`);
        await zbbAutomation.longClick(phoneInputX, phoneInputY, 1200);
        await zbbAutomation.delay(800);  // 等待粘贴菜单出现
        
        // 4. 打印界面，查找"粘贴"选项
        logToBoth('info', `[企业微信测试] 步骤11：打印界面查找粘贴选项`);
        await this.debugPrintScreenText();
        
        // 5. 查找并点击"粘贴"选项
        let phonePasted = false;
        const phonePasteNode = this._lastScreenNodes?.find(n => 
          n.text === '粘贴' || n.text === 'Paste' || n.text?.includes('粘贴')
        );
        if (phonePasteNode) {
          logToBoth('success', `[企业微信测试] 步骤11：点击"粘贴"(OCR) @ (${phonePasteNode.centerX}, ${phonePasteNode.centerY})`);
          await zbbAutomation.click(phonePasteNode.centerX, phonePasteNode.centerY);
          phonePasted = true;
        } else {
          // 降级：使用相对偏移计算粘贴按钮位置
          const pasteX = phoneInputX + PASTE_OFFSET_X;
          const pasteY = phoneInputY + PASTE_OFFSET_Y;
          logToBoth('warn', `[企业微信测试] 步骤11：OCR未找到，使用偏移计算粘贴位置 (${pasteX}, ${pasteY})`);
          await zbbAutomation.click(pasteX, pasteY);
          phonePasted = true;
        }
        await zbbAutomation.delay(1000);
        
        // ========== 步骤11.5：点击性别（根据姓名自动判断）============
        /**
         * 根据姓名判断性别
         * 女：女士、小姐、太太
         * 男：先生
         * 无法判断：抛出错误
         */
        const customerName = fullName;
        const isFemale = /[女士、小姐、太太]/.test(customerName);
        const isMale = /先生/.test(customerName);
        
        if (!isFemale && !isMale) {
          logToBoth('error', `[企业微信测试] 步骤11.5：无法从姓名"${customerName}"判断性别`);
          throw new Error(`无法从姓名"${customerName}"判断性别`);
        }
        
        const gender = isFemale ? '女' : '男';
        logToBoth('info', `[企业微信测试] 步骤11.5：根据姓名"${customerName}"判断性别为"${gender}"`);
        
        // 点击对应的性别按钮（女:933,1265  男:816,1265）
        const genderBtnX = isFemale ? 933 : 816;
        const genderBtnY = 1265;
        logToBoth('info', `[企业微信测试] 步骤11.5：点击"${gender}" @ (${genderBtnX}, ${genderBtnY})`);
        await zbbAutomation.click(genderBtnX, genderBtnY);
        logToBoth('success', `[企业微信测试] 步骤11.5：点击"${gender}"成功`);
        await zbbAutomation.delay(500);
        
        // ========== 步骤12：验证输入内容 ==========
        logToBoth('info', '[企业微信测试] 步骤12：验证输入内容');
        
        // 先点击空白处收起键盘
        logToBoth('info', '[企业微信测试] 步骤12：收起键盘');
        await zbbAutomation.click(540, 300);  // 点击空白区域
        await zbbAutomation.delay(1500);
        
        // 打印界面，查看输入框中的内容
        await this.debugPrintScreenText();
        
        // 获取所有节点
        const verifyInputNodes = await zbbAutomation.getAllTextNodes();
        
        // 从数据库获取的姓名和手机号
        const expectedName = fullName;
        const expectedPhone = customer.phone;
        
        // 查找可能包含输入内容的节点
        const nameMatched = verifyInputNodes.some(n => 
          n.text && (n.text.includes(expectedName) || n.text === expectedName)
        );
        const phoneMatched = verifyInputNodes.some(n => 
          n.text && (n.text.includes(expectedPhone) || n.text === expectedPhone)
        );
        
        // 性别验证
        const genderMatched = true; // TODO: 根据实际界面状态判断
        
        logToBoth('info', `[企业微信测试] 步骤12：姓名验证 "${expectedName}" → ${nameMatched ? '✓ 通过' : '✗ 未通过'}`);
        logToBoth('info', `[企业微信测试] 步骤12：手机号验证 "${expectedPhone}" → ${phoneMatched ? '✓ 通过' : '✗ 未通过'}`);
        logToBoth('info', `[企业微信测试] 步骤12：性别验证 "${gender}" → ${genderMatched ? '✓ 通过' : '✗ 未通过'}`);
        
        // 如果验证不通过，需要重新输入
        if (!nameMatched || !phoneMatched) {
          logToBoth('warn', '[企业微信测试] 步骤12：验证未通过，需要重新输入');
          
          // 清空并重新输入姓名
          if (!nameMatched) {
            logToBoth('info', '[企业微信测试] 步骤12：重新输入姓名');
            await zbbAutomation.click(nameInputX, nameInputY);
            await zbbAutomation.delay(500);
            await zbbAutomation.inputText('');  // 清空
            await zbbAutomation.delay(300);
            await zbbAutomation.pasteText(expectedName);
            await zbbAutomation.delay(300);
            await zbbAutomation.longClick(nameInputX, nameInputY, 1000);
            await zbbAutomation.delay(500);
            await zbbAutomation.click(nameInputX + PASTE_OFFSET_X, nameInputY + PASTE_OFFSET_Y);
            await zbbAutomation.delay(500);
          }
          
          // 清空并重新输入手机号
          if (!phoneMatched) {
            logToBoth('info', '[企业微信测试] 步骤12：重新输入手机号');
            await zbbAutomation.click(phoneInputX, phoneInputY);
            await zbbAutomation.delay(500);
            await zbbAutomation.inputText('');  // 清空
            await zbbAutomation.delay(300);
            await zbbAutomation.pasteText(expectedPhone);
            await zbbAutomation.delay(300);
            await zbbAutomation.longClick(phoneInputX, phoneInputY, 1000);
            await zbbAutomation.delay(500);
            await zbbAutomation.click(phoneInputX + PASTE_OFFSET_X, phoneInputY + PASTE_OFFSET_Y);
            await zbbAutomation.delay(500);
          }
          
          // 重新点击性别
          logToBoth('info', `[企业微信测试] 步骤12：重新点击性别 "${gender}"`);
          await zbbAutomation.click(genderBtnX, genderBtnY);
          await zbbAutomation.delay(300);
          
          // 收起键盘并再次验证
          await zbbAutomation.click(540, 300);
          await zbbAutomation.delay(1000);
          await this.debugPrintScreenText();
        } else {
          logToBoth('success', '[企业微信测试] 步骤12：验证通过，输入内容正确');
        }
        
        // ========== 步骤12.5：勾选"我已阅读并同意" ==========
        logToBoth('info', '[企业微信测试] 步骤12.5：勾选"我已阅读并同意"');
        // 选择框在"我"字前，文字在(213, 2066)，点击左侧复选框位置
        await zbbAutomation.click(170, 2066);
        await zbbAutomation.delay(500);
        logToBoth('success', '[企业微信测试] 步骤12.5：勾选成功');
        
        // ========== 步骤13：点击"立即推荐" ==========
        logToBoth('info', '[企业微信测试] 步骤13：点击"立即推荐"');
        
        // 先收起键盘
        await zbbAutomation.click(540, 300);
        await zbbAutomation.delay(1000);
        
        // 获取所有节点，查找"立即推荐"
        const recommendNodes = await zbbAutomation.getAllTextNodes();
        const recommendBtn = recommendNodes.find(n => n.text === '立即推荐');
        
        if (recommendBtn) {
          logToBoth('info', `[企业微信测试] 步骤13：找到"立即推荐" @ (${recommendBtn.centerX}, ${recommendBtn.centerY})`);
          await zbbAutomation.click(recommendBtn.centerX, recommendBtn.centerY);
          logToBoth('success', '[企业微信测试] 步骤13：点击"立即推荐"成功');
        } else {
          logToBoth('warn', '[企业微信测试] 步骤13：未找到"立即推荐"，使用固定坐标 (540, 1463)');
          await zbbAutomation.click(540, 1463);
        }
        
        // ========== 步骤14：验证报备结果并更新数据库 ==========
        logToBoth('info', `[企业微信测试] 步骤14：验证报备结果`);
        
        // 等待 2-3 秒
        await zbbAutomation.delay(2000 + Math.random() * 1000);
        
        // 获取当前界面所有文字
        const resultNodes = await zbbAutomation.getAllTextNodes();
        
        // 检查是否有"待确认"
        const hasPendingConfirm = resultNodes.some(n => 
          n.text && (n.text.includes('待确认') || n.text === '待确认')
        );
        
        if (hasPendingConfirm) {
          logToBoth('success', `[企业微信测试] 步骤14：报备成功！客户"${fullName}"找到"待确认"`);
          
          // 更新数据库状态为成功
          try {
            await updateReportSuccess(customer.id);
            logToBoth('success', `[企业微信测试] 步骤14：数据库已更新为"成功"`);
          } catch (dbError) {
            logToBoth('warn', `[企业微信测试] 步骤14：更新数据库失败: ${(dbError as Error).message}`);
          }
        } else {
          logToBoth('error', `[企业微信测试] 步骤14：报备失败！客户"${fullName}"未找到"待确认"`);
          
          // 更新数据库状态为失败
          try {
            await updateReportFailed(customer.id);
            logToBoth('error', `[企业微信测试] 步骤14：数据库已更新为"失败"`);
          } catch (dbError) {
            logToBoth('warn', `[企业微信测试] 步骤14：更新数据库失败: ${(dbError as Error).message}`);
          }
          
          // 打印界面内容帮助调试
          logToBoth('info', '[企业微信测试] 步骤14：打印当前界面内容');
          await this.debugPrintScreenText();
          
          // 停留5秒
          logToBoth('info', '[企业微信测试] 步骤14：停留5秒');
          await zbbAutomation.delay(5000);
        }
        
        // 如果不是最后一个客户，需要返回重新输入
        if (customerIndex < pendingReports.length - 1) {
          logToBoth('info', `[企业微信测试] 不是最后一个客户，返回重新输入下一个`);
          
          // 导航键位置（三键导航模式）
          const NAV_RECENT = { x: 300, y: 2300 };  // 多任务键（左侧）
          const NAV_TRASH = { x: 540, y: 2150 };   // 垃圾箱（Home键上方）
          const NAV_HOME = { x: 540, y: 2300 };     // Home键（中间）
          
          // 1. 点击多任务键，显示最近应用
          logToBoth('info', '[企业微信测试] 返回：点击多任务键');
          await zbbAutomation.click(NAV_RECENT.x, NAV_RECENT.y);
          await zbbAutomation.delay(1000);
          
          // 2. 点击垃圾箱，关闭当前应用
          logToBoth('info', '[企业微信测试] 返回：点击垃圾箱关闭应用');
          await zbbAutomation.click(NAV_TRASH.x, NAV_TRASH.y);
          await zbbAutomation.delay(1000);
          
          // 3. 按Home键确保回到桌面
          logToBoth('info', '[企业微信测试] 返回：按Home键回到桌面');
          await zbbAutomation.click(NAV_HOME.x, NAV_HOME.y);
          await zbbAutomation.delay(1000);
          
          // 等待2-3秒随机时间
          const waitTime = 2000 + Math.random() * 1000;
          logToBoth('info', `[企业微信测试] 返回：等待 ${(waitTime / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitTime);
          
          // 重新打开企业微信
          logToBoth('info', '[企业微信测试] 返回：重新打开企业微信');
          await this.openWechat();
          await zbbAutomation.delay(3000);
          
          // 重新点击工作台
          logToBoth('info', '[企业微信测试] 返回：点击"工作台"');
          const workbenchResult = await zbbAutomation.findElementByText('工作台');
          if (workbenchResult?.found && workbenchResult.centerX > 0 && workbenchResult.centerY > 0) {
            await zbbAutomation.click(workbenchResult.centerX, workbenchResult.centerY);
          }
          await zbbAutomation.delay(2000);
          
          // 重新点击"越秀地产悦秀会"小程序
          logToBoth('info', '[企业微信测试] 返回：查找并点击"越秀地产悦秀会"');
          await this.debugPrintScreenText();
          
          // 查找"越秀地产悦秀会"
          let foundYueXiu = false;
          for (let retry = 0; retry < 5; retry++) {
            if (retry > 0) {
              logToBoth('info', `[企业微信测试] 返回：第 ${retry + 1} 次重试查找"越秀地产悦秀会"...`);
              await zbbAutomation.delay(2000);
              await this.debugPrintScreenText();
            }
            
            const nodes = await zbbAutomation.getAllTextNodes();
            const yueXiuNodes = nodes.filter(n => 
              n.text && (n.text.includes('越秀') && n.text.includes('悦秀'))
            );
            
            if (yueXiuNodes.length > 0) {
              // 找包含"越秀"和"悦秀"的节点
              const targetNode = yueXiuNodes.find(n => 
                n.text!.includes('越秀') && n.text!.includes('悦秀')
              ) || yueXiuNodes[0];
              
              if (targetNode && targetNode.centerX > 0 && targetNode.centerY > 0) {
                logToBoth('success', `[企业微信测试] 返回：找到"越秀地产悦秀会" @ (${targetNode.centerX}, ${targetNode.centerY})`);
                await zbbAutomation.click(targetNode.centerX, targetNode.centerY);
                foundYueXiu = true;
                break;
              }
            }
          }
          
          if (!foundYueXiu) {
            logToBoth('error', '[企业微信测试] 返回：未能找到"越秀地产悦秀会"，尝试使用固定坐标 (540, 1200)');
            await zbbAutomation.click(540, 1200);
          }
          
          await zbbAutomation.delay(3000);
          
          // 重新点击"我要推荐"
          logToBoth('info', '[企业微信测试] 返回：点击"我要推荐"');
          const recommendResult = await zbbAutomation.findElementByText('我要推荐');
          if (recommendResult?.found && recommendResult.centerX > 0 && recommendResult.centerY > 0) {
            await zbbAutomation.click(recommendResult.centerX, recommendResult.centerY);
          } else {
            logToBoth('warn', '[企业微信测试] 返回：未找到"我要推荐"，尝试使用固定坐标 (540, 1450)');
            await zbbAutomation.click(540, 1450);
          }
          await zbbAutomation.delay(3000);
        }
      } // 客户循环结束
      
      // ========== 步骤15：清理界面，退出小程序 ==========
      logToBoth('info', '[企业微信测试] 步骤15：清理界面，退出小程序');
      
      // 导航键位置（三键导航模式）
      const NAV_RECENT = { x: 300, y: 2300 };  // 多任务键（左侧）
      const NAV_TRASH = { x: 540, y: 2150 };   // 垃圾箱（Home键上方）
      const NAV_HOME = { x: 540, y: 2300 };     // Home键（中间）
      
      // 1. 点击多任务键，显示最近应用
      logToBoth('info', '[企业微信测试] 步骤15：点击多任务键');
      await zbbAutomation.click(NAV_RECENT.x, NAV_RECENT.y);
      await zbbAutomation.delay(1000);
      
      // 2. 点击垃圾箱，关闭当前应用
      logToBoth('info', '[企业微信测试] 步骤15：点击垃圾箱关闭应用');
      await zbbAutomation.click(NAV_TRASH.x, NAV_TRASH.y);
      await zbbAutomation.delay(1000);
      
      // 3. 按Home键确保回到桌面
      logToBoth('info', '[企业微信测试] 步骤15：按Home键回到桌面');
      await zbbAutomation.click(NAV_HOME.x, NAV_HOME.y);
      await zbbAutomation.delay(1000);
      
      // ========== 步骤16：打印完整数据库内容 ==========
      logToBoth('info', '========================================');
      logToBoth('info', '[企业微信测试] 步骤16：打印完整数据库内容');
      logToBoth('info', '========================================');
      await printAllReports();
      
      logToBoth('success', '========================================');
      logToBoth('success', '       企业微信测试流程完成！');
      logToBoth('success', '========================================');
      
      return { success: true };
      
    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', `       企业微信测试失败: ${error}`);
      logToBoth('error', '========================================');
      
      // 发生错误时也打印数据库内容
      try {
        const { printAllReports } = await import('./DatabaseService');
        logToBoth('info', '========================================');
        logToBoth('info', '[企业微信测试] 发生错误，打印数据库内容：');
        logToBoth('info', '========================================');
        await printAllReports();
      } catch (e) {
        // 忽略打印错误
      }
      
      return { success: false, error: String(error) };
      
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 测试保利端企业微信流程
   * 流程：初始化数据库 -> 打开企业微信 -> 点击工作台 -> 下滑3次 -> 点击"云和家经纪云" -> 打印界面
   */
  async testBaoliWechat(): Promise<{ success: boolean; error?: string }> {
    logToBoth('info', '========================================');
    logToBoth('info', '       开始测试：保利端企业微信流程');
    logToBoth('info', '========================================');
    
    try {
      this.isRunning = true;
      
      // ========== 步骤0：初始化数据库并写入预置保利客户数据 ==========
      logToBoth('info', '[保利端] 步骤0：初始化数据库并写入预置保利客户数据');
      const { initDatabase, insertBaoliReport, printAllReports } = await import('./DatabaseService');
      await initDatabase();
      
      // 预置保利客户数据
      const presetBaoliCustomer = {
        customerName: '桂女士',
        customerGender: '女',
        customerPhone: '159****1318',
        reportProject: '保利缦城和颂',
        propertyType: '住宅',
        reportSubmitTime: '2026/05/03 16:59',
        expectedVisitTime: '2026-05-04 13:59',
        agentName: '董紫阳',
        agentRemark: '',
      };
      
      // 写入数据库
      const baoliId = await insertBaoliReport(presetBaoliCustomer);
      logToBoth('success', `[保利端] 步骤0：写入客户 "${presetBaoliCustomer.customerName}" (ID=${baoliId})`);
      logToBoth('success', `[保利端] 步骤0：报备项目: ${presetBaoliCustomer.reportProject}`);
      logToBoth('success', `[保利端] 步骤0：经纪人: ${presetBaoliCustomer.agentName}`);
      
      // 打印数据库内容
      await printAllReports();
      
      // 检查无障碍服务
      const ready = await this.checkServiceReady();
      if (!ready) {
        throw new Error('无障碍服务未就绪');
      }
      
      // ========== 步骤1：打开企业微信 ==========
      logToBoth('info', '[保利端] 步骤1：打开企业微信');
      await this.openWechat();
      await zbbAutomation.delay(3000);
      
      // 打印当前界面
      await this.debugPrintScreenText();
      
      // ========== 步骤2：点击"工作台" ==========
      logToBoth('info', '[保利端] 步骤2：点击"工作台"');
      
      let workbenchResult = null;
      for (let retry = 0; retry < 5; retry++) {
        if (retry > 0) {
          logToBoth('info', `[保利端] 第 ${retry + 1} 次重试查找"工作台"...`);
          await zbbAutomation.delay(2000);
          await this.debugPrintScreenText();
        }
        
        workbenchResult = await zbbAutomation.findElementByText('工作台');
        
        if (workbenchResult?.found && workbenchResult?.centerX && workbenchResult?.centerY) {
          break;
        }
      }
      
      if (!workbenchResult?.found || workbenchResult.centerX <= 0 || workbenchResult.centerY <= 0) {
        throw new Error('未找到"工作台"');
      }
      
      logToBoth('success', `[保利端] 找到"工作台" @ (${workbenchResult.centerX}, ${workbenchResult.centerY})`);
      await zbbAutomation.click(workbenchResult.centerX, workbenchResult.centerY);
      await zbbAutomation.delay(2000);
      
      // ========== 步骤3：下滑3次 ==========
      logToBoth('info', '[保利端] 步骤3：下滑3次查找"云和家经纪云"');
      
      // 从屏幕中间位置开始上滑（下滑页面）
      const swipeStartX = 540;
      const swipeStartY = 1500;
      const swipeEndX = 540;
      const swipeEndY = 400;
      const swipeDuration = 500;
      
      for (let i = 1; i <= 3; i++) {
        logToBoth('info', `[保利端] 步骤3：第 ${i} 次上滑（查找"云和家经纪云"...）`);
        await zbbAutomation.swipe(swipeStartX, swipeStartY, swipeEndX, swipeEndY, swipeDuration);
        await zbbAutomation.delay(1500);
        
        // 检查是否找到了"云和家经纪云"
        const nodes = await zbbAutomation.getAllTextNodes();
        const targetNode = nodes.find(n => 
          n.text && n.text.includes('云和家经纪云')
        );
        
        if (targetNode && targetNode.centerX > 0 && targetNode.centerY > 0) {
          logToBoth('success', `[保利端] 步骤3：找到"云和家经纪云" @ (${targetNode.centerX}, ${targetNode.centerY})`);
          
          // 点击进入
          await zbbAutomation.click(targetNode.centerX, targetNode.centerY);
          await zbbAutomation.delay(3000);
          
          // ========== 步骤4：打印当前界面 ==========
          logToBoth('info', '[保利端] 步骤4：打印当前界面');
          
          // 打印前等待2-3秒随机时间
          const waitTimeBeforePrint = 2000 + Math.random() * 1000;
          logToBoth('info', `[保利端] 打印前等待 ${(waitTimeBeforePrint / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitTimeBeforePrint);
          
          // 步骤4截图并保存结果
          const step4Nodes = await this.debugPrintScreenText();
          
          // ========== 步骤5：点击"郑州保利山水和颂" ==========
          logToBoth('info', '[保利端] 步骤5：点击"郑州保利山水和颂"');
          
          // 直接点击固定坐标 (560, 1350)
          const clickX = 560;
          const clickY = 1350;
          logToBoth('info', `[保利端] 直接点击 (${clickX}, ${clickY})`);
          await zbbAutomation.tap(clickX, clickY);
          
          // 点击后等待2-3秒随机时间
          const waitTimeAfterClick = 2000 + Math.random() * 1000;
          logToBoth('info', `[保利端] 点击后等待 ${(waitTimeAfterClick / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitTimeAfterClick);
          
          // 使用 Android ML Kit 文字识别方案查找并打印当前界面文字
          logToBoth('info', '[保利端] ML Kit 方案查找当前界面文字...');
          const mlKitNodes = await this.debugPrintScreenText();
          
          if (mlKitNodes && mlKitNodes.length > 0) {
            logToBoth('info', `[保利端] ML Kit 方案共找到 ${mlKitNodes.length} 个文字节点`);
            mlKitNodes.forEach((node: any, index: number) => {
              if (index < 30) { // 限制打印数量
                logToBoth('info', `[保利端] ${index + 1}. "${node.text}" @ (${node.centerX}, ${node.centerY})`);
              }
            });
            if (mlKitNodes.length > 30) {
              logToBoth('info', `[保利端] ... 还有 ${mlKitNodes.length - 30} 个节点未显示`);
            }
          } else {
            logToBoth('error', '[保利端] ML Kit 方案未识别到任何文字');
          }
          
          // 步骤6：点击"我要报备"/"报备"
          logToBoth('info', '[保利端] 步骤6：点击"报备"');
          const baobeiNode = mlKitNodes?.find((n: any) => n.text === '我要报备' || n.text === '报备');
          if (baobeiNode && baobeiNode.centerX > 0 && baobeiNode.centerY > 0) {
            logToBoth('info', `[保利端] 找到"${baobeiNode.text}" @ (${baobeiNode.centerX}, ${baobeiNode.centerY})`);
            await zbbAutomation.tap(baobeiNode.centerX, baobeiNode.centerY);
          } else {
            logToBoth('error', '[保利端] 未找到"报备"按钮');
          }
          
          // 点击后等待2-3秒随机时间
          const waitAfterTap = 2000 + Math.random() * 1000;
          logToBoth('info', `[保利端] 点击后等待 ${(waitAfterTap / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitAfterTap);
          
          // 步骤7：打印当前界面
          logToBoth('info', '[保利端] 步骤7：查找并打印当前界面文字');
          const step7Nodes = await this.debugPrintScreenText();
          
          if (step7Nodes && step7Nodes.length > 0) {
            logToBoth('info', `[保利端] 共找到 ${step7Nodes.length} 个文字节点`);
            step7Nodes.forEach((node: any, index: number) => {
              logToBoth('info', `[保利端] ${index + 1}. "${node.text}" @ (${node.centerX}, ${node.centerY})`);
            });
          } else {
            logToBoth('error', '[保利端] 未识别到任何文字');
          }

          // 步骤8：点击"报备"
          logToBoth('info', '[保利端] 步骤8：点击"报备"');
          // 在步骤7的节点中找到"报备"的坐标
          const baobeiNodeForTap = step7Nodes?.find((n: any) => n.text === '报备');
          if (baobeiNodeForTap) {
            logToBoth('info', `[保利端] 找到"报备" @ (${baobeiNodeForTap.centerX}, ${baobeiNodeForTap.centerY})`);
            await zbbAutomation.tap(baobeiNodeForTap.centerX, baobeiNodeForTap.centerY);
          } else {
            logToBoth('error', '[保利端] 未在当前界面找到"报备"');
          }

          // 等待3-4秒随机时间
          const waitBaobei = 3000 + Math.random() * 1000;
          logToBoth('info', `[保利端] 等待 ${(waitBaobei / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitBaobei);

          // 步骤9：打印当前界面
          logToBoth('info', '[保利端] 步骤9：打印当前界面内容');
          const step9Nodes = await this.debugPrintScreenText();

          if (step9Nodes && step9Nodes.length > 0) {
            logToBoth('info', `[保利端] 共找到 ${step9Nodes.length} 个文字节点`);
            step9Nodes.forEach((node: any, index: number) => {
              logToBoth('info', `[保利端] ${index + 1}. "${node.text}" @ (${node.centerX}, ${node.centerY})`);
            });
          } else {
            logToBoth('error', '[保利端] 未识别到任何文字');
          }

          // 步骤10：从数据库获取最新记录并复制到剪贴板
          logToBoth('info', '[保利端] 步骤10：从数据库获取最新客户信息并复制到剪贴板');
          try {
            const baoliReports = await getAllBaoliReports();
            if (baoliReports && baoliReports.length > 0) {
              // 按 report_submit_time 降序排序，获取最新一条
              const sortedReports = baoliReports.sort((a: any, b: any) => {
                const timeA = new Date(a.report_submit_time).getTime();
                const timeB = new Date(b.report_submit_time).getTime();
                return timeB - timeA;
              });
              const latestReport = sortedReports[0];
              logToBoth('info', `[保利端] 获取到最新客户: ${latestReport.customer_name} ${latestReport.customer_phone}`);
              logToBoth('info', `[保利端] full_record: ${latestReport.full_record}`);

              // 复制到剪贴板
              if (latestReport.full_record) {
                await zbbAutomation.setClipboardText(latestReport.full_record);
                logToBoth('info', '[保利端] 已复制到剪贴板');
              }
            } else {
              logToBoth('error', '[保利端] 数据库中无保利客户记录');
            }
          } catch (error) {
            logToBoth('error', `[保利端] 读取数据库失败: ${error}`);
          }

          // 步骤11：长按"粘贴完整客户信息，点击智能识别，都可快速填充"文本框2秒
          logToBoth('info', '[保利端] 步骤11：长按"粘贴完整客户信息..."');
          const pasteHintNode = step9Nodes?.find((n: any) => 
            n.text && n.text.includes('粘贴完整客户信息')
          );
          if (pasteHintNode) {
            logToBoth('info', `[保利端] 找到"粘贴完整客户信息..." @ (${pasteHintNode.centerX}, ${pasteHintNode.centerY})`);
            // 长按2秒
            logToBoth('info', '[保利端] 长按2秒...');
            await zbbAutomation.longPress(pasteHintNode.centerX, pasteHintNode.centerY, 2000);
            // 等待1秒
            await zbbAutomation.delay(1000);
            logToBoth('info', '[保利端] 长按完成');
          } else {
            logToBoth('error', '[保利端] 未找到"粘贴完整客户信息..."');
          }

          // 步骤12：直接点击粘贴坐标 (130, 710)
          logToBoth('info', '[保利端] 步骤12：点击粘贴');
          logToBoth('info', '[保利端] 直接点击粘贴坐标 (130, 710)');
          await zbbAutomation.tap(130, 710);

          // 点击后等待1秒
          await zbbAutomation.delay(1000);

          // 步骤13：点击选择分期 - 先获取当前界面节点
          logToBoth('info', '[保利端] 步骤13：点击选择分期');
          const step13Nodes = await this.debugPrintScreenText();
          logToBoth('info', `[保利端] 当前界面共 ${step13Nodes?.length || 0} 个文字节点`);
          const stageNode = step13Nodes?.find((n: any) => n.text === '请选择分期' || n.text === '分期');
          if (stageNode) {
            logToBoth('info', `[保利端] 找到"分期" @ (${stageNode.centerX}, ${stageNode.centerY})`);
            await zbbAutomation.tap(stageNode.centerX, stageNode.centerY);
          } else {
            logToBoth('error', '[保利端] 未找到"分期"选项');
          }

          // 步骤14：等待2-3秒随机时间
          const waitStage = 2000 + Math.random() * 1000;
          logToBoth('info', `[保利端] 步骤14：等待 ${(waitStage / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitStage);

          // 步骤15：查找并打印当前界面所有文字
          logToBoth('info', '[保利端] 步骤15：查找并打印当前界面文字');
          const step15Nodes = await this.debugPrintScreenText();
          logToBoth('info', `[保利端] 当前界面共 ${step15Nodes?.length || 0} 个文字节点`);
          step15Nodes?.forEach((n: any, i: number) => {
            if (i < 50) {
              logToBoth('info', `[保利端] ${i + 1}. "${n.text}" @ (${n.centerX}, ${n.centerY})`);
            }
          });

          // 步骤16：点击项目名称
          logToBoth('info', '[保利端] 步骤16：点击项目名称');
          const projectNode = step15Nodes?.find((n: any) => 
            n.text && n.text.includes('保利缦城和颂')
          );
          if (projectNode) {
            logToBoth('info', `[保利端] 找到"${projectNode.text}" @ (${projectNode.centerX}, ${projectNode.centerY})`);
            await zbbAutomation.tap(projectNode.centerX, projectNode.centerY);
          }

          // 步骤17：等待0-1秒随机时间
          const waitProject = Math.random() * 1000;
          logToBoth('info', `[保利端] 步骤17：等待 ${(waitProject / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitProject);

          // 步骤18：点击"确认"
          logToBoth('info', '[保利端] 步骤18：点击确认');
          const confirmNode = step15Nodes?.find((n: any) => n.text === '确认');
          if (confirmNode) {
            await zbbAutomation.tap(confirmNode.centerX, confirmNode.centerY);
          }

          // 步骤19：等待0-1秒随机时间
          const waitSmart = Math.random() * 1000;
          logToBoth('info', `[保利端] 步骤19：等待 ${(waitSmart / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitSmart);

          // 步骤20：点击"智能识别"
          logToBoth('info', '[保利端] 步骤20：点击智能识别');
          await zbbAutomation.tap(919, 1360);

          // 步骤21：等待1-2秒随机时间
          const waitSmart2 = 1000 + Math.random() * 1000;
          logToBoth('info', `[保利端] 步骤21：等待 ${(waitSmart2 / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitSmart2);

          // 步骤22：点击"报备"
          logToBoth('info', '[保利端] 步骤22：点击报备');
          await zbbAutomation.tap(540, 2174);

          // 步骤23：等待1-2秒随机时间
          const waitBaobei = 1000 + Math.random() * 1000;
          logToBoth('info', `[保利端] 步骤23：等待 ${(waitBaobei / 1000).toFixed(1)} 秒`);
          await zbbAutomation.delay(waitBaobei);

          // 步骤24：查找并打印当前界面所有文字及坐标
          logToBoth('info', '[保利端] 步骤24：查找并打印当前界面文字');
          const step24Nodes = await this.debugPrintScreenText();
          step24Nodes?.forEach((n: any, i: number) => {
            logToBoth('info', `[保利端] ${i + 1}. "${n.text}" @ (${n.centerX}, ${n.centerY})`);
          });

          logToBoth('info', '[保利端] ========================================');
          logToBoth('info', '[保利端] 保利端流程全部完成！');
          logToBoth('info', '[保利端] ========================================');

          return { success: true };
        }
      }
      
      // 3次滑动后仍未找到
      logToBoth('error', '[保利端] 步骤3：3次滑动后未找到"云和家经纪云"');
      await this.debugPrintScreenText();
      
      logToBoth('success', '========================================');
      logToBoth('success', '       保利端企业微信流程完成！');
      logToBoth('success', '========================================');
      
      return { success: true };
      
    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', `       保利端企业微信测试失败: ${error}`);
      logToBoth('error', '========================================');
      
      return { success: false, error: String(error) };
      
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 执行抖音流程（仅获取客户信息，不包含微信报备）
   * 流程：打开抖音 -> 点击消息 -> 查找好友 -> 进入聊天 -> 长按消息 -> 复制信息
   */
  async executeDouyinOnlyFlow(): Promise<{ success: boolean; customerInfo: CustomerInfo | null; screenshots: string[] }> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    this.isAborted = false;
    this.screenshotPaths = [];
    
    // 显示悬浮窗
    await zbbAutomation.showFloatingWindow();
    await zbbAutomation.updateFloatingStep('正在启动...', 0, 5);
    
    await zbbAutomation.showToast('抖音信息获取流程开始！');
    
    logToBoth('info', '========================================');
    logToBoth('info', '       抖音流程开始执行');
    logToBoth('info', '========================================');
    
    try {
      // 步骤1：打开抖音
      logToBoth('info', '[流程] 步骤1：打开抖音');
      this.notifyStepUpdate('打开抖音', 0);
      await this.stepOpenDouyin();
      
      // 步骤2：点击消息
      logToBoth('info', '[流程] 步骤2：点击消息');
      this.notifyStepUpdate('点击消息', 1);
      await this.stepClickMessages();
      
      // 步骤3：查找好友
      logToBoth('info', '[流程] 步骤3：查找好友');
      this.notifyStepUpdate('查找好友', 2);
      await this.stepFindFriend();
      
      // 步骤4：进入聊天
      logToBoth('info', '[流程] 步骤4：进入聊天');
      this.notifyStepUpdate('进入聊天', 3);
      await this.stepClickChat();
      
      // 步骤5：长按消息
      logToBoth('info', '[流程] 步骤5：长按消息');
      this.notifyStepUpdate('长按消息', 4);
      await this.stepLongPressMessage();
      
      // 步骤6：复制信息
      logToBoth('info', '[流程] 步骤6：复制信息');
      this.notifyStepUpdate('复制信息', 5);
      await this.stepClickCopy();
      
      // 读取并解析客户信息
      await zbbAutomation.showToast('正在读取客户信息...');
      const clipboardText = await zbbAutomation.getClipboardText();
      logToBoth('info', `[流程] 剪贴板内容: "${clipboardText}"`);
      
      if (clipboardText) {
        // 解析姓名和电话
        const phonePattern = /1[3-9]\d{9}/;
        const namePattern = /[\u4e00-\u9fa5]{2,4}/;
        
        const phoneMatch = clipboardText.match(phonePattern);
        const nameMatch = clipboardText.match(namePattern);
        
        logToBoth('info', `[流程] 姓名匹配: ${JSON.stringify(nameMatch)}, 电话匹配: ${JSON.stringify(phoneMatch)}`);
        
        if (nameMatch && phoneMatch) {
          this.customerInfo = {
            name: nameMatch[0],
            phone: phoneMatch[0],
            rawMessage: clipboardText,
          };
          automationEngine.setCustomerInfo(this.customerInfo);
          await zbbAutomation.showToast(`客户信息: ${this.customerInfo.name} ${this.customerInfo.phone}`);
          logToBoth('success', `[流程] 姓名=${this.customerInfo.name}, 电话=${this.customerInfo.phone}`);
        }
      }
      
      await zbbAutomation.showToast('抖音流程执行完成！');
      logToBoth('success', '========================================');
      logToBoth('success', '       抖音流程执行完成！');
      logToBoth('success', '========================================');
      
      // 通知流程完成
      this.notifyStepUpdate('流程完成', 5);
      
      // 设置悬浮窗完成状态
      zbbAutomation.setFloatingComplete();
      
      return {
        success: true,
        customerInfo: this.customerInfo,
        screenshots: [...this.screenshotPaths],
      };
      
    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', `       流程执行失败: ${error}`);
      logToBoth('error', '========================================');
      
      // 隐藏悬浮窗
      zbbAutomation.hideFloatingWindow();
      
      return {
        success: false,
        customerInfo: this.customerInfo,
        screenshots: [...this.screenshotPaths],
      };
      
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * 停止
   */
  stop(): void {
    this.isAborted = true;
    this.isRunning = false;
    automationEngine.log('warn', '[原生] 流程已停止');
    
    // 通知原生层停止
    zbbAutomation.stopAutomation();
    
    // 隐藏悬浮窗
    zbbAutomation.hideFloatingWindow();
  }
  
  /**
   * 暂停
   */
  pause(): void {
    this.isPaused = true;
    automationEngine.log('warn', '[原生] 流程已暂停');
  }
  
  /**
   * 恢复
   */
  resume(): void {
    this.isPaused = false;
    automationEngine.log('info', '[原生] 流程已恢复');
  }
  
  /**
   * 备选方案：从节点树中解析坐标并点击
   * 解析节点树格式：[Button] desc="xxx" clickable enabled bounds=Rect(x1, y1 - x2, y2)
   */
  async clickFriendByTreeSearch(friendName: string): Promise<boolean> {
    try {
      logToBoth('info', '[备选方案] 正在从节点树中搜索好友: ' + friendName);
      
      // 获取节点树字符串
      const treeStr = await zbbAutomation.dumpWindowTreeString();
      
      // 解析节点树，找到包含该好友名字的按钮及其坐标
      // 格式: [Button] desc="只如初见," clickable enabled bounds=Rect(312, 142 - 463, 320)
      const regex = new RegExp(`\\[Button\\][^\\[]*?(desc|text)="([^"]*${friendName}[^"]*)"[^\\[]*?bounds=Rect\\((\\d+),\\s*(\\d+)\\s*-\\s*(\\d+),\\s*(\\d+)\\)`);
      const match = treeStr.match(regex);
      
      if (match) {
        const x1 = parseInt(match[3], 10);
        const y1 = parseInt(match[4], 10);
        const x2 = parseInt(match[5], 10);
        const y2 = parseInt(match[6], 10);
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        
        logToBoth('info', '[备选方案] 找到节点坐标: (' + centerX + ', ' + centerY + ')');
        
        // 使用坐标点击
        const clicked = await clickAtPosition(centerX, centerY);
        if (clicked) {
          logToBoth('success', '[备选方案] 点击成功');
          return true;
        }
      }
      
      // 如果正则没匹配到，尝试更简单的方式：查找包含文字的行
      const lines = treeStr.split('\n');
      for (const line of lines) {
        if (line.includes('text="' + friendName + '"') || line.includes('desc="' + friendName)) {
          // 查找同一行或后续行中的 bounds
          const boundsMatch = line.match(/bounds=Rect\((\d+),\s*(\d+)\s*-\s*(\d+),\s*(\d+)\)/);
          if (boundsMatch) {
            const centerX = (parseInt(boundsMatch[1]) + parseInt(boundsMatch[3])) / 2;
            const centerY = (parseInt(boundsMatch[2]) + parseInt(boundsMatch[4])) / 2;
            
            logToBoth('info', '[备选方案] 从文字行找到坐标: (' + centerX + ', ' + centerY + ')');
            
            const clicked = await clickAtPosition(centerX, centerY);
            if (clicked) {
              logToBoth('success', '[备选方案] 点击成功');
              return true;
            }
          }
        }
      }
      
      logToBoth('error', '[备选方案] 未找到匹配节点');
      return false;
    } catch (error) {
      logToBoth('error', '[备选方案] 解析节点树失败: ' + (error as Error).message);
      return false;
    }
  }
}

// 导出单例
export const nativeAutomationService = NativeAutomationService.getInstance();
export { NativeAutomationService };
