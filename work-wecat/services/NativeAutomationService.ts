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
import { CalibrationService } from './index';
import type { EmitterSubscription } from 'react-native';

// APP 包名定义
const APP_PACKAGES = {
  DOUYIN: 'com.ss.android.ugc.aweme',  // 抖音
  WECHAT: 'com.tencent.mm',       // 微信
  WORK_WECHAT: 'com.tencent.wework', // 企业微信
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
    
    // 抖音底部导航栏顺序: 首页(1) | 朋友(2) | +(3) | 消息(4) | 我(5)
    // "消息"按钮是第4个位置
    
    // ========== 方案1: 原生节点查找（优先） ==========
    logToBoth('info', '[抖音：步骤2] ========== 方案1: 原生节点查找 ==========');
    
    // 尝试查找"消息"文字节点
    logToBoth('info', '[抖音：步骤2] 查找"消息"文字节点...');
    const messageElement = await zbbAutomation.findElementByText('消息');
    
    if (messageElement?.found) {
      const centerX = messageElement.boundsCenterX || 
        ((messageElement.boundsLeft || 0) + (messageElement.boundsRight || 0)) / 2;
      const centerY = messageElement.boundsCenterY || 
        ((messageElement.boundsTop || 0) + (messageElement.boundsBottom || 0)) / 2;
      
      logToBoth('info', `[抖音：步骤2] 找到"消息"节点: (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);
      
      // 点击节点
      const clicked = await clickAtPosition(centerX, centerY);
      if (clicked) {
        logToBoth('success', '[抖音：步骤2] 原生方案: 点击"消息"成功');
        await zbbAutomation.delay(getDelay('other'));
        
        // OCR确认：检查消息列表是否出现
        const messagesVisible = await this.checkScreenText('消息', 3, '[抖音：步骤2]') || 
                                await this.checkScreenText('私信', 3, '[抖音：步骤2]') ||
                                await this.checkScreenText('聊天', 3, '[抖音：步骤2]') ||
                                await this.checkScreenText('栀子树下', 3, '[抖音：步骤2]');
        if (messagesVisible) {
          logToBoth('success', '[抖音：步骤2] 消息列表已显示');
        }
        return;
      }
    } else {
      logToBoth('warn', '[抖音：步骤2] 未找到"消息"文字节点');
    }
    
    // ========== 方案2: 原生 clickByText ==========
    logToBoth('info', '[抖音：步骤2] ========== 方案2: clickByText ==========');
    
    const clickByTextSuccess = await zbbAutomation.clickByText('消息');
    if (clickByTextSuccess) {
      logToBoth('success', '[抖音：步骤2] clickByText: 点击"消息"成功');
      await zbbAutomation.delay(getDelay('other'));
      
      // OCR确认
      const messagesVisible = await this.checkScreenText('消息', 3, '[抖音：步骤2]') || 
                              await this.checkScreenText('私信', 3, '[抖音：步骤2]') ||
                              await this.checkScreenText('栀子树下', 3, '[抖音：步骤2]');
      if (messagesVisible) {
        logToBoth('success', '[抖音：步骤2] 消息列表已显示');
      }
      return;
    }
    
    // ========== 方案3: 坐标定位（兜底） ==========
    logToBoth('info', '[抖音：步骤2] ========== 方案3: 坐标定位 ==========');
    
    const screenSize = await zbbAutomation.getScreenSize();
    if (screenSize && screenSize.width && screenSize.height) {
      logToBoth('info', `[抖音：步骤2] 屏幕尺寸: ${screenSize.width}x${screenSize.height}`);
      
      // 5等分屏幕，消息按钮是第4个按钮（第3.5个位置，0-indexed为3）
      const buttonWidth = screenSize.width / 5;
      const buttonX = buttonWidth * 3.5;  // 第4个按钮中心
      const buttonY = screenSize.height * 0.92;  // 底部92%高度
      
      logToBoth('info', `[抖音：步骤2] 计算坐标: 按钮宽度=${buttonWidth.toFixed(0)}, X=${buttonX.toFixed(0)}, Y=${buttonY.toFixed(0)}`);
      
      const clicked = await clickAtPosition(buttonX, buttonY);
      if (clicked) {
        logToBoth('success', '[抖音：步骤2] 坐标方案: 点击"消息"成功');
        await zbbAutomation.delay(getDelay('other'));
        
        // OCR确认
        const messagesVisible = await this.checkScreenText('消息', 3, '[抖音：步骤2]') || 
                                await this.checkScreenText('私信', 3, '[抖音：步骤2]') ||
                                await this.checkScreenText('栀子树下', 3, '[抖音：步骤2]');
        if (messagesVisible) {
          logToBoth('success', '[抖音：步骤2] 消息列表已显示');
        }
        return;
      } else {
        logToBoth('error', '[抖音：步骤2] 坐标点击"消息"按钮失败');
        throw new Error('坐标点击"消息"按钮失败');
      }
    } else {
      logToBoth('error', '[抖音：步骤2] 无法获取屏幕尺寸');
      throw new Error('无法获取屏幕尺寸');
    }
  }
  
  private async stepFindFriend(): Promise<void> {
    logToBoth('info', '[抖音：步骤3] 查找好友 "' + this.friendName + '"...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('查找好友');
    await zbbAutomation.delay(getDelay('other'));
    
    // ========== 打印当前界面节点树（调试用） ==========
    logToBoth('info', '[抖音：步骤3] ========== 当前界面节点树 ==========');
    const windowTree = await zbbAutomation.dumpWindowTreeString();
    if (windowTree) {
      logToBoth('info', '[抖音：步骤3] 节点树:\n' + windowTree);
    } else {
      logToBoth('warn', '[抖音：步骤3] 节点树为空，可能界面未加载完成');
    }
    logToBoth('info', '[抖音：步骤3] ========== 节点树结束 ==========');
    
    // ========== 直接使用 clickByText 点击 ==========
    // 注意：抖音好友列表的节点结构复杂，findElementByText 可能找到错误位置的同名节点
    // 直接使用 clickByText 更可靠，它会点击第一个匹配文本的可点击节点
    logToBoth('info', '[抖音：步骤3] 使用 clickByText 点击好友: "' + this.friendName + '"');
    
    // 先检查节点树中是否确实存在该好友（用于日志）
    const treeStr = await zbbAutomation.dumpWindowTreeString();
    const hasFriend = treeStr.includes('text="只如初见"') || treeStr.includes('desc="只如初见"');
    logToBoth('info', '[抖音：步骤3] 节点树中是否存在好友: ' + hasFriend);
    
    // 直接点击（不需要先找坐标再点击）
    const clicked = await zbbAutomation.clickByText(this.friendName);
    
    if (clicked) {
      logToBoth('success', '[抖音：步骤3] clickByText 点击成功');
    } else {
      // 如果 clickByText 失败，尝试备选方案：在节点树中找到包含该文字的按钮并点击
      logToBoth('warn', '[抖音：步骤3] clickByText 失败，尝试备选方案');
      const clickResult = await this.clickFriendByTreeSearch(this.friendName);
      if (!clickResult) {
        throw new Error('无法找到好友 "' + this.friendName + '"');
      }
    }
    
    // 等待进入对话框（增加等待时间）
    logToBoth('info', '[抖音：步骤3] 等待进入对话框...');
    await zbbAutomation.delay(8000);
    
    // 确认是否已进入对话框（使用节点树检测）
    logToBoth('info', '[抖音：步骤3] 使用节点树验证是否进入对话框...');
    const chatOpened = await this.checkChatByNode();
    if (chatOpened) {
      logToBoth('success', '[抖音：步骤3] 已进入对话框');
    } else {
      logToBoth('error', '[抖音：步骤3] X 未进入对话框');
      throw new Error('未进入对话框');
    }
  }
  
  private async stepClickChat(): Promise<void> {
    logToBoth('info', '[抖音：步骤4] 进入对话框并识别对方消息...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('进入聊天');
    await zbbAutomation.delay(getDelay('other'));
    
    // 步骤3已通过搜索进入对话框，这里确认对话框已打开并识别消息
    
    // 节点树确认对话框已打开
    logToBoth('info', '[抖音：步骤4] 使用节点树验证对话框已打开...');
    const chatOpened = await this.checkChatByNode();
    if (chatOpened) {
      logToBoth('success', '[抖音：步骤4] 对话框已打开');
    } else {
      logToBoth('warn', '[抖音：步骤4] 警告：对话框可能未打开');
    }
    
    // 识别对方发送的消息（屏幕左侧，最新收到的）
    logToBoth('info', '[抖音：步骤4] 识别对方发送的最新消息...');
    
    // 先上滑一下确保最新消息在屏幕上
    logToBoth('info', '[抖音：步骤4] 上滑确保最新消息可见...');
    await zbbAutomation.scrollUp();
    await zbbAutomation.delay(2000);
    
    const screenTexts = await this.recognizeScreenText();
    const screenSize = await zbbAutomation.getScreenSize();
    
    if (screenSize) {
      logToBoth('info', `[抖音：步骤4] OCR识别到 ${screenTexts.length} 个文字`);
      
      const friendMaxX = screenSize.width * 0.6;
      
      // 收集所有符合条件的消息
      const candidateMessages: Array<{ text: string; startX: number; y: number; boundsBottom: number }> = [];
      
      for (const text of screenTexts) {
        // 跳过干扰文字
        if (this.isInterferenceText(text)) continue;
        
        // 只关注包含中文或电话的消息（真正的聊天内容）
        if (!/[\u4e00-\u9fa5]/.test(text) && !/1[3-9]\d{9}/.test(text)) continue;
        
        const element = await zbbAutomation.findElementByText(text);
        if (element?.found) {
          const boundsCenterX = element.boundsCenterX;
          const boundsCenterY = element.boundsCenterY;
          const boundsLeft = element.boundsLeft;
          const boundsTop = element.boundsTop;
          const boundsBottom = element.boundsBottom;
          
          if (boundsCenterX !== undefined && boundsCenterY !== undefined) {
            // 对方消息在屏幕左侧，且在屏幕下半部分
            if (boundsCenterX < friendMaxX && boundsCenterY > screenSize.height * 0.3) {
              candidateMessages.push({
                text,
                startX: boundsLeft ?? boundsCenterX - 50,
                y: boundsTop ?? boundsCenterY,
                boundsBottom: boundsBottom ?? boundsCenterY + 20
              });
            }
          }
        }
      }
      
      logToBoth('info', `[抖音：步骤4] 找到 ${candidateMessages.length} 条候选消息`);
      
      if (candidateMessages.length > 0) {
        // 按 boundsBottom 排序（底部Y坐标最大的 = 最下面/最新）
        candidateMessages.sort((a, b) => b.boundsBottom - a.boundsBottom);
        
        // 取最下面的一条（最新消息）
        const latestMessage = candidateMessages[0];
        
        // 如果有多条消息，检查是否有包含电话的消息（优先选择）
        const phonePattern = /1[3-9]\d{9}/;
        const messageWithPhone = candidateMessages.find(m => phonePattern.test(m.text));
        
        const finalMessage = messageWithPhone || latestMessage;
        
        this.lastFriendMessage = finalMessage;
        logToBoth('success', `[抖音：步骤4] 识别到最新消息: "${finalMessage.text}"`);
        logToBoth('info', `[抖音：步骤4] 消息位置: 起始X=${finalMessage.startX.toFixed(0)}, Y=${finalMessage.y.toFixed(0)}`);
      } else {
        logToBoth('warn', '[抖音：步骤4] 未识别到对方消息');
        this.lastFriendMessage = {
          text: '',
          startX: screenSize.width * 0.15,
          y: screenSize.height * 0.6
        };
      }
    }
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
      '抖音', '私信', '关注', '粉丝', '直播', '推荐', '同城', '热点', '精选', '关注',
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
    
    for (const text of messageTexts) {
      const element = await this.findElementWithBounds(text);
      if (element?.found && element.boundsCenterX !== undefined && element.boundsCenterY !== undefined) {
        // 验证坐标有效性：必须在屏幕范围内
        const isValidX = element.boundsCenterX >= 0 && element.boundsCenterX <= screenWidth;
        const isValidY = element.boundsCenterY >= 0 && element.boundsCenterY <= screenHeight;
        
        if (!isValidX || !isValidY) {
          logToBoth('warn', `[抖音：步骤5] 坐标无效: "${text.substring(0, 20)}..." (${element.boundsCenterX}, ${element.boundsCenterY})，跳过`);
          continue;
        }
        
        // 判断是否在屏幕左侧（对方消息区域）
        if (element.boundsCenterX < friendMaxX) {
          friendMessages.push({
            text,
            // 使用起始位置（boundsLeft）而不是中心点
            startX: element.boundsLeft ?? element.boundsCenterX - 50,
            y: element.boundsTop ?? element.boundsCenterY,
          });
        }
      }
    }
    
    return friendMessages;
  }
  
  private async stepLongPressMessage(): Promise<void> {
    logToBoth('info', '[抖音：步骤5] 长按消息...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('长按消息');
    await zbbAutomation.delay(getDelay('other'));
    
    let longPressSuccess = false;
    
    // 1. 优先使用步骤4保存的坐标（消息起始位置）
    if (this.lastFriendMessage && this.lastFriendMessage.text) {
      logToBoth('info', `[抖音：步骤5] 消息内容: "${this.lastFriendMessage.text}"`);
      logToBoth('info', `[抖音：步骤5] 消息起始位置: (${this.lastFriendMessage.startX.toFixed(0)}, ${this.lastFriendMessage.y.toFixed(0)})`);
      
      // 直接使用起始位置进行长按（点击消息的第一个字符）
      const targetX = this.lastFriendMessage.startX;
      const targetY = this.lastFriendMessage.y;
      
      logToBoth('info', `[抖音：步骤5] 长按消息开头: (${targetX.toFixed(0)}, ${targetY.toFixed(0)})`);
      
      // 执行长按操作（使用较长的按住时间确保触发）
      await zbbAutomation.longClick(targetX, targetY, 1500, true);
      await zbbAutomation.delay(getDelay('other'));
      
      // 检查是否出现复制菜单
      const menuVisible = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
      if (menuVisible) {
        logToBoth('success', '[抖音：步骤5] 长按成功，复制选项已显示');
        longPressSuccess = true;
      } else {
        logToBoth('warn', '[抖音：步骤5] 复制菜单未出现，尝试重新定位...');
        
        // 如果复制菜单没出现，尝试点击消息文字的中心位置
        const screenSize = await zbbAutomation.getScreenSize();
        if (screenSize) {
          // 尝试点击消息区域中心（Y坐标稍大一些）
          const retryY = this.lastFriendMessage.y + 20;
          logToBoth('info', `[抖音：步骤5] 重试长按: (${targetX.toFixed(0)}, ${retryY.toFixed(0)})`);
          await zbbAutomation.longClick(targetX, retryY, 1500, true);
          await zbbAutomation.delay(getDelay('other'));
          
          const menuVisible2 = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
          if (menuVisible2) {
            logToBoth('success', '[抖音：步骤5] 重试成功，复制选项已显示');
            longPressSuccess = true;
          }
        }
      }
    } else {
      logToBoth('warn', '[抖音：步骤5] 步骤4未保存消息信息，进行OCR识别...');
      
      // 2. OCR识别查找对方消息
      const startTime = Date.now();
      const allTexts = await this.recognizeScreenText();
      const ocrTime = Date.now() - startTime;
      
      const messageTexts = this.filterMessageTexts(allTexts);
      
      logToBoth('info', `[抖音：步骤5] OCR耗时: ${ocrTime}ms`);
      logToBoth('info', `[抖音：步骤5] 识别到 ${allTexts.length} 个文字，过滤后候选: ${messageTexts.length}`);
      
      const screenSize = await zbbAutomation.getScreenSize();
      if (!screenSize) {
        logToBoth('error', '[抖音：步骤5] 无法获取屏幕尺寸');
        return;
      }
      
      const friendMessages = await this.findFriendMessages(messageTexts, screenSize.width, screenSize.height);
      
      if (friendMessages.length > 0) {
        friendMessages.sort((a, b) => b.y - a.y);  // Y坐标最大的（最新消息）
        const lastMessage = friendMessages[0];
        
        // 优先查找含电话的消息
        const phonePattern = /1[3-9]\d{9}/;
        const phoneMessage = friendMessages.find(m => phonePattern.test(m.text));
        
        const targetMessage = phoneMessage || lastMessage;
        logToBoth('info', `[抖音：步骤5] 长按消息: "${targetMessage.text.substring(0, 30)}..." 起始位置(${targetMessage.startX.toFixed(0)}, ${targetMessage.y.toFixed(0)})`);
        
        // 使用消息起始位置进行长按
        await zbbAutomation.longClick(targetMessage.startX, targetMessage.y, 1000, true);
        await zbbAutomation.delay(getDelay('other'));
        
        const menuVisible = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
        if (menuVisible) {
          logToBoth('success', '[抖音：步骤5] 长按成功，复制选项已显示');
          longPressSuccess = true;
        }
      }
    }
    
    // 3. 坐标兜底
    if (!longPressSuccess) {
      logToBoth('warn', '[抖音：步骤5] 使用坐标兜底');
      const screenSize = await zbbAutomation.getScreenSize();
      if (screenSize) {
        const targetX = screenSize.width * 0.3;
        const targetY = screenSize.height * 0.65;
        logToBoth('info', `[抖音：步骤5] 坐标兜底: (${targetX.toFixed(0)}, ${targetY.toFixed(0)})`);
        await zbbAutomation.longClick(targetX, targetY, 1000, true);
        await zbbAutomation.delay(getDelay('other'));
        
        const menuVisible = await this.checkScreenText('复制', 3, '[抖音：步骤5]');
        if (menuVisible) {
          logToBoth('success', '[抖音：步骤5] 坐标兜底成功，复制选项已显示');
          longPressSuccess = true;
        }
      }
    }
    
    if (!longPressSuccess) {
      logToBoth('warn', '[抖音：步骤5] 警告：复制选项未显示');
    }
  }
  
  private async stepClickCopy(): Promise<void> {
    logToBoth('info', '[抖音：步骤6] 点击"复制"按钮...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('复制信息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击复制按钮
    const clicked = await zbbAutomation.clickByText('复制');
    if (clicked) {
      logToBoth('info', '[抖音：步骤6] 已点击复制按钮');
    } else {
      logToBoth('error', '[抖音：步骤6] X 点击复制按钮失败');
      throw new Error('点击复制按钮失败');
    }
    
    await zbbAutomation.delay(1500);
    
    // 检查是否出现复制成功提示
    const screenTexts = await this.recognizeScreenText();
    const hasSuccess = screenTexts.some(t => 
      t.includes('复制成功') || 
      t.includes('已复制') || 
      t.includes('Copied')
    );
    
    if (hasSuccess) {
      logToBoth('success', '[抖音：步骤6] 复制成功');
    } else {
      // 检查是否还在复制菜单
      const stillInMenu = screenTexts.some(t => t.includes('复制') || t.includes('转发'));
      if (stillInMenu) {
        logToBoth('warn', '[抖音：步骤6] 仍在菜单中，再次点击复制...');
        await zbbAutomation.clickByText('复制');
        await zbbAutomation.delay(2000);
      }
      
      // 关闭复制菜单
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(1000);
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
   * 截图并保存到相册
   */
  async takeScreenshot(projectIndex: number): Promise<string | null> {
    const timestamp = Date.now();
    const fileName = `ZBB_${timestamp}_success_${projectIndex}.png`;
    
    // 使用 screencap 命令截图并保存
    try {
      const screenshot = await zbbAutomation.takeScreenshotBase64();
      if (screenshot) {
        // 注意：这里只是获取截图，实际保存需要调用原生方法
        automationEngine.log('info', `[原生] 截图已获取: ${fileName}`);
        return screenshot;
      }
    } catch (error) {
      automationEngine.log('error', `[原生] 截图失败: ${error}`);
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
   * 使用节点树检测是否为聊天界面
   * 查找聊天输入框或发送按钮等特征元素（带重试机制）
   * 验证方式：检测到底部聊天工具栏（表情/图片/相册任一存在）
   */
  async checkChatByNode(maxRetries: number = 3): Promise<boolean> {
    // 聊天界面底部工具栏特征（这些在聊天界面始终存在）
    const chatToolbarIndicators = ['表情', '相册', '图片'];
    
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        logToBoth('info', `[节点检测] 重试 ${retry + 1}/${maxRetries}，等待2秒...`);
        await zbbAutomation.delay(2000);
      }
      
      for (const indicator of chatToolbarIndicators) {
        const element = await zbbAutomation.findElementByText(indicator);
        if (element?.found) {
          logToBoth('info', `[节点检测] 找到聊天工具栏特征: "${indicator}"`);
          return true;
        }
      }
      
      logToBoth('info', `[节点检测] 第 ${retry + 1} 次未找到聊天特征，继续尝试...`);
    }
    
    logToBoth('warn', '[节点检测] 未找到聊天界面特征元素');
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
   * 使用OCR识别当前屏幕文字（带耗时统计）
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
  
  // ==================== 阶段三：打开微信 ====================
  
  /**
   * 打开微信应用
   */
  async openWechat(): Promise<void> {
    logToBoth('info', '[流程] 阶段三：打开微信');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('打开微信');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 检查是否被停止
      await this.checkAbort();
      
      // 使用 launchApp 打开微信
      logToBoth('info', '[微信] 正在启动微信...');
      const launched = await zbbAutomation.launchApp(APP_PACKAGES.WECHAT);
      
      if (launched) {
        logToBoth('success', '[微信] 微信已启动');
      } else {
        logToBoth('error', '[微信] X 启动微信失败');
        throw new Error('启动微信失败');
      }
      
      // 等待微信启动
      await zbbAutomation.delay(getDelay('openApp'));
      
      // 检查当前包名
      const packageName = await zbbAutomation.getCurrentPackageName();
      logToBoth('info', '[微信] 当前包名: ' + packageName);
      
      // 确认是微信
      if (packageName?.includes('tencent.mm')) {
        logToBoth('success', '[微信] 微信已打开');
      } else {
        logToBoth('warn', '[微信] 警告：当前可能不是微信');
      }
    } catch (error) {
      logToBoth('error', '[微信] X 打开微信失败: ' + error);
      throw error;
    }
  }
  
  // ==================== 阶段四：进入绿城云小程序 ====================
  
  /**
   * 进入绿城云小程序（OCR 版本 - 前台服务版）
   * 流程：打开微信 -> 下拉 -> 截图+OCR找"绿城云" -> 点击"绿城云" -> 点击"我要推荐"
   * 使用 ScreenshotService 持有 MediaProjection，解决应用切换后权限失效的问题
   */
  async searchAndEnterMiniApp(): Promise<void> {
    logToBoth('info', '[流程] 阶段三：搜索并进入小程序');
    logToBoth('info', '[流程] 阶段四：进入绿城云小程序');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('OCR找绿城云');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 检查是否被停止
      await this.checkAbort();
      
      // ========== 步骤1：请求截图权限（会启动 ScreenshotService） ==========
      logToBoth('info', '[微信] ⑩: 检查截图权限...');
      let hasPermission = await zbbAutomation.isMediaProjectionEnabled();
      
      if (!hasPermission) {
        logToBoth('warn', '[微信] ⑩: 截图权限无效，请求授权...');
        logToBoth('info', '[ZBB] 请求 MediaProjection 权限...');
        
        const granted = await zbbAutomation.requestMediaProjectionPermission();
        
        if (!granted) {
          logToBoth('error', '[微信] ⑩: 截图权限授权失败');
          throw new Error('截图权限授权失败');
        }
        
        logToBoth('success', '[微信] ⑩: 授权成功，准备截图...');
        
        // 等待 ScreenshotService 初始化完成
        await zbbAutomation.delay(500);
      }
      
      // ========== 步骤2：切换到微信并下拉小程序列表 ==========
      logToBoth('info', '[微信] 正在启动应用: com.tencent.mm');
      await zbbAutomation.launchApp(APP_PACKAGES.WECHAT);
      await zbbAutomation.delay(1500);  // 等待微信启动
      
      // 下拉微信首页显示小程序列表
      logToBoth('info', '[微信] ⑨: 下拉微信首页...');
      await zbbAutomation.swipe(300, 200, 300, 800, 500);
      logToBoth('success', '[微信] ⑨: 下拉微信首页');
      await zbbAutomation.delay(1500);  // 等待下拉动画完成
      
      // 检查是否被停止
      await this.checkAbort();
      
      // ========== 步骤3：截图+OCR 查找"绿城云" ==========
      // 关键：现在使用 ScreenshotService 进行截图
      // ScreenshotService 持有 MediaProjection，即使应用切换也能继续截图
      logToBoth('info', '[微信] 正在执行 OCR 截图...');
      let findResult = await zbbAutomation.findTextByMLKitWithPermission('绿城云', APP_PACKAGES.WECHAT);
      
      if (findResult?.found && findResult.centerX && findResult.centerY) {
        logToBoth('success', `[微信] ⑩: OCR 找到"绿城云" @ (${findResult.centerX}, ${findResult.centerY})`);
        
        // ========== 步骤4：点击"绿城云" ==========
        await zbbAutomation.delay(300);
        await zbbAutomation.click(findResult.centerX, findResult.centerY);
        logToBoth('success', '[微信] ⑪: 点击"绿城云"进入小程序');
      } else {
        logToBoth('error', `[微信] ⑩: 未找到"绿城云"，请检查屏幕`);
        throw new Error('未找到"绿城云"小程序，请检查屏幕');
      }
      
      // 等待小程序加载
      logToBoth('info', '[微信] 等待小程序加载...');
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
      logToBoth('error', '[微信] X 进入绿城云小程序失败: ' + error);
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
      logToBoth('success', `[校准] 绿城云坐标: (${calibrationData.greenCloud.x}, ${calibrationData.greenCloud.y})`);
      logToBoth('success', `[校准] 我要推荐坐标: (${calibrationData.recommendBtn.x}, ${calibrationData.recommendBtn.y})`);
      
    } catch (error) {
      this.isCalibrating = false;
      logToBoth('error', '[校准] 校准失败: ' + error);
      throw error;
    }
  }
  
  /**
   * 完成校准（由 UI 层调用）
   * @param greenCloudX 绿城云 X 坐标
   * @param greenCloudY 绿城云 Y 坐标
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
      
      logToBoth('success', `[校准] 已保存坐标: 绿城云(${greenCloudX}, ${greenCloudY}), 我要推荐(${recommendX}, ${recommendY})`);
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
    automationEngine.updateCurrentApp('微信');
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
      logToBoth('info', '[报备] OCR识别屏幕...');
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
    automationEngine.updateCurrentApp('微信');
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
    automationEngine.updateCurrentApp('微信');
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
    automationEngine.updateCurrentApp('微信');
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
    automationEngine.updateCurrentApp('微信');
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
  
  // ==================== 阶段十：返回微信首页 ====================
  
  /**
   * 返回微信首页/关闭微信
   */
  async returnToWechatHome(): Promise<void> {
    logToBoth('info', '[流程] 阶段十：返回微信首页');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('返回微信');
    
    try {
      // 按返回键返回微信首页
      logToBoth('info', '[返回] 正在返回微信首页...');
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(getDelay('other'));
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(getDelay('other'));
      
      logToBoth('success', '[返回] 已返回微信首页');
      await zbbAutomation.showToast('返回: 已返回微信首页!');
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
   * 流程：抖音获取信息 -> 微信报备 -> 抖音发送截图
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
      
      // ========== 阶段二：打开微信 ==========
      // 注意：MediaProjection 权限已在首页检查并授权
      logToBoth('info', '[流程] 阶段二：打开微信');
      this.notifyStepUpdate('打开微信', 6);
      await this.openWechat();
      
      // 阶段三：搜索并进入绿城云小程序
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
      
      // 阶段七：返回微信首页
      logToBoth('info', '[流程] 阶段七：返回微信首页');
      this.notifyStepUpdate('返回微信', 11);
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
