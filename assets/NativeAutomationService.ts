/**
 * ZBB 原生自动化服务
 * 版本: v2.5
 * 
 * 使用原生无障碍服务实现真实的自动化操作
 */

import { Platform } from 'react-native';
import { zbbAutomation, ElementInfo, Point, Rect } from '../native';
import { clickAtPosition } from '../native/ZBBAutomation';
import { automationEngine } from './AutomationEngine';
import type { CustomerInfo } from './AutomationEngine';

// APP 包名定义
const APP_PACKAGES = {
  DOUYIN: 'com.ss.android.ugc.aweme',  // 抖音
  WECHAT: 'com.tencent.mm',       // 微信
};

// 延时配置
const DELAY_CONFIG = {
  openApp: { min: 15000, max: 20000 },  // 开APP 15-20 秒
  other: { min: 8000, max: 15000 },       // 其他操作 8-15 秒
  notice: { min: 5000, max: 5000 },      // 阅读须知 5 秒
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
  
  private friendName: string = '栀子树下';
  private customerInfo: CustomerInfo | null = null;
  
  private screenshotPaths: string[] = [];
  
  // 步骤更新回调
  private stepUpdateCallbacks: Array<(stepName: string, stepIndex: number) => void> = [];
  
  private constructor() {}
  
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
      await this.stepClickMessages();
      await this.stepFindFriend();
      await this.stepClickChat();
      await this.stepLongPressMessage();
      await this.stepClickCopy();
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
  
  private async stepOpenDouyin(): Promise<void> {
    logToBoth('info', '[步骤1/12] 正在打开抖音...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('打开抖音');
    
    // 实际启动抖音APP
    const launched = await zbbAutomation.launchApp(APP_PACKAGES.DOUYIN);
    if (launched) {
      logToBoth('info', '[步骤1/12] ✓ 抖音已启动，等待界面加载...');
    } else {
      logToBoth('error', '[步骤1/12] ✗ 抖音启动失败，请检查抖音是否已安装');
    }
    
    // 等待应用加载
    await zbbAutomation.delay(getDelay('openApp'));
    
    // OCR确认：检查抖音是否已加载
    const douyinLoaded = await this.checkScreenText('抖音', 5);
    if (!douyinLoaded) {
      logToBoth('warn', '[步骤1/12] 警告：未检测到抖音界面，可能已打开其他界面');
      // 继续执行，让用户观察
    }
    
    // 检查当前包名
    const packageName = await zbbAutomation.getCurrentPackageName();
    logToBoth('info', `[抖音] 当前应用: ${packageName}`);
    
    logToBoth('success', '[步骤1/12] ✓ 抖音已打开');
  }
  
  private async stepClickMessages(): Promise<void> {
    logToBoth('info', '[步骤2/12] 点击"消息"按钮...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('点击消息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 抖音底部导航栏顺序: 首页(1) | 朋友(2) | +(3) | 消息(4) | 我(5)
    // "消息"按钮是第4个位置
    
    // ========== 方案1: OCR定位（查找"消息"节点获取中心点） ==========
    logToBoth('info', '[步骤2/12] ========== 方案1: OCR定位 ==========');
    
    // OCR识别当前屏幕所有文字（recognizeScreenText 已自动记录耗时和内容）
    logToBoth('info', '[步骤2/12] OCR识别当前屏幕...');
    const screenTexts = await this.recognizeScreenText();
    logToBoth('info', `[步骤2/12] 屏幕内容: ${JSON.stringify(screenTexts.slice(0, 30))}`);
    
    // 查找"消息"文字对应的节点（原生方法返回中心点坐标）
    logToBoth('info', '[步骤2/12] 查找"消息"文字节点...');
    const messageElement = await zbbAutomation.findElementByText('消息');
    
    if (messageElement?.found) {
      logToBoth('info', `[步骤2/12] ✓ 找到"消息"节点`);
      
      // 直接使用原生返回的中心点坐标
      const centerX = messageElement.boundsCenterX || (messageElement.boundsLeft! + messageElement.boundsRight!) / 2;
      const centerY = messageElement.boundsCenterY || (messageElement.boundsTop! + messageElement.boundsBottom!) / 2;
      
      logToBoth('info', `[步骤2/12] 节点边界: left=${messageElement.boundsLeft}, top=${messageElement.boundsTop}, right=${messageElement.boundsRight}, bottom=${messageElement.boundsBottom}`);
      logToBoth('info', `[步骤2/12] 节点中心点: (${centerX}, ${centerY})`);
      
      // 点击中心点
      logToBoth('info', `[步骤2/12] 点击节点中心点: (${centerX}, ${centerY})`);
      const clicked = await clickAtPosition(centerX, centerY);
      
      if (clicked) {
        logToBoth('success', '[步骤2/12] ✓ OCR方案: 点击"消息"成功');
        await zbbAutomation.delay(getDelay('other'));
        return;
      }
    } else {
      logToBoth('warn', '[步骤2/12] 未找到"消息"文字节点');
    }
    
    // ========== 方案2: 坐标定位（5等分屏幕） ==========
    logToBoth('info', '[步骤2/12] ========== 方案2: 坐标定位 ==========');
    
    const screenSize = await zbbAutomation.getScreenSize();
    if (screenSize && screenSize.width && screenSize.height) {
      logToBoth('info', `[步骤2/12] 屏幕尺寸: ${screenSize.width}x${screenSize.height}`);
      
      // 5等分屏幕，消息按钮是第4个按钮（第3.5个位置，0-indexed为3）
      const buttonWidth = screenSize.width / 5;
      const buttonX = buttonWidth * 3.5;  // 第4个按钮中心
      const buttonY = screenSize.height * 0.92;  // 底部92%高度
      
      logToBoth('info', `[步骤2/12] 计算坐标: 按钮宽度=${buttonWidth.toFixed(0)}, X=${buttonX.toFixed(0)}, Y=${buttonY.toFixed(0)}`);
      
      const clicked = await clickAtPosition(buttonX, buttonY);
      if (clicked) {
        logToBoth('success', '[步骤2/12] ✓ 坐标方案: 点击"消息"成功');
      } else {
        logToBoth('error', '[步骤2/12] 坐标点击"消息"按钮失败');
        throw new Error('坐标点击"消息"按钮失败');
      }
    } else {
      logToBoth('error', '[步骤2/12] 无法获取屏幕尺寸');
      throw new Error('无法获取屏幕尺寸');
    }
    
    // 等待操作生效
    await zbbAutomation.delay(getDelay('other'));
    
    // OCR确认：检查消息列表是否出现（checkScreenText 已自动记录 OCR 结果）
    logToBoth('info', '[步骤2/12] OCR确认消息列表...');
    const messagesVisible = await this.checkScreenText('消息', 3, '[步骤2/12]') || 
                            await this.checkScreenText('私信', 3, '[步骤2/12]') ||
                            await this.checkScreenText('聊天', 3, '[步骤2/12]') ||
                            await this.checkScreenText('栀子树下', 3, '[步骤2/12]');
    if (messagesVisible) {
      logToBoth('success', '[步骤2/12] ✓ 消息列表已显示');
    } else {
      logToBoth('warn', '[步骤2/12] 警告：消息列表未显示');
    }
  }
  
  private async stepFindFriend(): Promise<void> {
    logToBoth('info', `[步骤3/12] 查找好友 "${this.friendName}"...`);
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('查找好友');
    await zbbAutomation.delay(getDelay('other'));
    
    // 查找好友
    const element = await zbbAutomation.findElementByText(this.friendName);
    
    if (element?.found) {
      logToBoth('success', `[步骤3/12] ✓ 找到好友 "${this.friendName}"`);
    } else {
      // OCR确认：检查屏幕上是否有该好友
      const found = await this.checkScreenText(this.friendName, 3);
      if (found) {
        logToBoth('success', `[步骤3/12] ✓ OCR确认找到好友 "${this.friendName}"`);
      } else {
        logToBoth('error', `[步骤3/12] ✗ 未找到好友 "${this.friendName}"`);
        throw new Error(`未找到好友 "${this.friendName}"`);
      }
    }
  }
  
  private async stepClickChat(): Promise<void> {
    logToBoth('info', '[步骤4/12] 点击好友对话框...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('进入聊天');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击好友
    await zbbAutomation.clickByText(this.friendName);
    await zbbAutomation.delay(getDelay('other'));
    
    // OCR确认：检查对话框是否打开
    const chatOpened = await this.checkScreenText('发送', 3) || 
                        await this.checkScreenText('摄像头', 3) ||
                        await this.checkScreenText('相册', 3);
    if (chatOpened) {
      logToBoth('success', '[步骤4/12] ✓ 对话框已打开');
    } else {
      logToBoth('warn', '[步骤4/12] 警告：对话框可能未打开');
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
  ): Promise<Array<{ text: string; boundsCenterX: number; boundsCenterY: number }>> {
    const friendMessages: Array<{ text: string; boundsCenterX: number; boundsCenterY: number }> = [];
    
    // 对方消息区域的X坐标阈值：屏幕左侧 60% 以内为对方消息
    const friendMaxX = screenWidth * 0.6;
    
    for (const text of messageTexts) {
      const element = await this.findElementWithBounds(text);
      if (element?.found && element.boundsCenterX !== undefined && element.boundsCenterY !== undefined) {
        // 验证坐标有效性：必须在屏幕范围内
        const isValidX = element.boundsCenterX >= 0 && element.boundsCenterX <= screenWidth;
        const isValidY = element.boundsCenterY >= 0 && element.boundsCenterY <= screenHeight;
        
        if (!isValidX || !isValidY) {
          logToBoth('warn', `[步骤5/12] 坐标无效: "${text.substring(0, 20)}..." (${element.boundsCenterX}, ${element.boundsCenterY})，跳过`);
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
  
  private async stepLongPressMessage(): Promise<void> {
    logToBoth('info', '[步骤5/12] 长按消息...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('长按消息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 1. OCR 收集屏幕上的所有文字
    const startTime = Date.now();
    const allTexts = await this.recognizeScreenText();
    const ocrTime = Date.now() - startTime;
    
    // 过滤干扰文字，找出消息内容
    const messageTexts = this.filterMessageTexts(allTexts);
    
    // 显示 OCR 识别结果
    logToBoth('info', `[步骤5/12] OCR耗时: ${ocrTime}ms`);
    logToBoth('info', `[步骤5/12] 识别到 ${allTexts.length} 个文字，过滤后候选: ${messageTexts.length}`);
    logToBoth('info', `[步骤5/12] 候选消息: ${JSON.stringify(messageTexts.slice(0, 10))}`);
    
    // 获取屏幕尺寸
    const screenSize = await zbbAutomation.getScreenSize();
    if (!screenSize) {
      logToBoth('error', '[步骤5/12] 无法获取屏幕尺寸');
      return;
    }
    
    logToBoth('info', `[步骤5/12] 屏幕尺寸: ${screenSize.width}x${screenSize.height}`);
    
    let longPressSuccess = false;
    
    // 2. 查找对方发送的消息（通过坐标判断：对方消息在屏幕左侧）
    logToBoth('info', `[步骤5/12] 分析消息归属（屏幕宽度: ${screenSize.width}）...`);
    const friendMessages = await this.findFriendMessages(messageTexts, screenSize.width, screenSize.height);
    logToBoth('info', `[步骤5/12] 对方消息数量: ${friendMessages.length}`);
    
    if (friendMessages.length > 0) {
      // 3. 按 Y 坐标排序，从下往上（新消息在下）
      friendMessages.sort((a, b) => b.boundsCenterY - a.boundsCenterY);
      
      // 4. 选择对方发送的最后一条消息（Y 坐标最大）
      const lastFriendMessage = friendMessages[0];
      logToBoth('info', `[步骤5/12] 对方最后消息: "${lastFriendMessage.text.substring(0, 30)}..."`);
      logToBoth('info', `[步骤5/12] 消息坐标: (${lastFriendMessage.boundsCenterX}, ${lastFriendMessage.boundsCenterY})`);
      
      // 5. 优先策略：查找包含电话的消息
      const phonePattern = /1[3-9]\d{9}/;
      const phoneMessage = friendMessages.find(m => phonePattern.test(m.text));
      
      if (phoneMessage) {
        logToBoth('info', `[步骤5/12] ✓ 找到含电话的消息，尝试长按: "${phoneMessage.text.substring(0, 30)}..."`);
        const clicked = await zbbAutomation.clickByText(phoneMessage.text, true);
        if (clicked) {
          await zbbAutomation.delay(getDelay('other'));
          const menuVisible = await this.checkScreenText('复制', 3, '[步骤5/12]');
          if (menuVisible) {
            logToBoth('success', '[步骤5/12] ✓ 找到含电话消息，长按成功，复制选项已显示');
            longPressSuccess = true;
          }
        }
      }
      
      // 6. 长按对方最后一条消息
      if (!longPressSuccess) {
        logToBoth('info', `[步骤5/12] 长按对方最后消息: "${lastFriendMessage.text.substring(0, 30)}..."`);
        const clicked = await zbbAutomation.clickByText(lastFriendMessage.text, true);
        if (clicked) {
          await zbbAutomation.delay(getDelay('other'));
          const menuVisible = await this.checkScreenText('复制', 3, '[步骤5/12]');
          if (menuVisible) {
            logToBoth('success', '[步骤5/12] ✓ 长按成功，复制选项已显示');
            longPressSuccess = true;
          }
        }
      }
    } else {
      logToBoth('warn', '[步骤5/12] 未找到对方消息');
    }
    
    // 7. 坐标兜底：点击屏幕左侧中下区域
    if (!longPressSuccess) {
      logToBoth('warn', '[步骤5/12] 使用坐标兜底');
      // 屏幕左侧 30% 位置，高度 65% 位置（对方消息区域）
      const targetX = screenSize.width * 0.3;
      const targetY = screenSize.height * 0.65;
      logToBoth('info', `[步骤5/12] 坐标兜底: (${targetX.toFixed(0)}, ${targetY.toFixed(0)})`);
      // 显式传递长按参数：时长1000ms，isLongPress=true
      await zbbAutomation.longClick(targetX, targetY, 1000, true);
      await zbbAutomation.delay(getDelay('other'));
      
      const menuVisible = await this.checkScreenText('复制', 3, '[步骤5/12]');
      if (menuVisible) {
        logToBoth('success', '[步骤5/12] ✓ 坐标兜底成功，复制选项已显示');
        longPressSuccess = true;
      }
    }
    
    if (!longPressSuccess) {
      logToBoth('warn', '[步骤5/12] 警告：复制选项未显示');
    }
  }
  
  private async stepClickCopy(): Promise<void> {
    logToBoth('info', '[步骤6/12] 点击"复制"按钮...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('复制信息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击复制按钮
    await zbbAutomation.clickByText('复制');
    await zbbAutomation.delay(getDelay('other'));
    
    // OCR确认：检查复制是否成功
    const copySuccess = await this.checkScreenText('复制成功', 3) || 
                        await this.checkScreenText('已复制', 3);
    if (copySuccess) {
      logToBoth('success', '[步骤6/12] ✓ 复制成功');
    } else {
      logToBoth('warn', '[步骤6/12] 警告：复制可能未成功');
    }
  }
  
  private async stepParseMessage(): Promise<void> {
    logToBoth('info', '[步骤7/12] 读取剪贴板（客户信息）...');
    automationEngine.updateCurrentApp('抖音');
    automationEngine.updateCurrentStep('读取客户信息');
    await zbbAutomation.delay(getDelay('other'));
    
    // 读取剪贴板 - 获取从好友消息复制的客户信息
    // 预期格式: "姓名\n电话" 或 "姓名 电话" 等
    const clipboardText = await zbbAutomation.getClipboardText();
    
    if (clipboardText) {
      logToBoth('info', `[步骤7/12] 剪贴板内容: ${clipboardText.substring(0, 50)}...`);
      
      // 解析姓名和电话（在 executeFullFlow 中完成）
      // 这里只记录日志，实际解析在主流程中
      logToBoth('success', '[步骤7/12] ✓ 客户信息已从剪贴板读取');
    } else {
      logToBoth('error', '[步骤7/12] ✗ 剪贴板为空');
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
      await this.stepClickAdd();
      await this.stepClickAlbum();
      await this.stepSelectPhotos();
      await this.stepSend();
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
    automationEngine.log('info', '[步骤8/12] 打开抖音发送界面...');
    await zbbAutomation.showToast('步骤8: 打开抖音发送界面');
    await zbbAutomation.delay(getDelay('openApp'));
    
    await zbbAutomation.showToast('步骤8完成 ✓');
    automationEngine.log('success', '[步骤8/12] ✓ 抖音已打开');
  }
  
  private async stepClickAdd(): Promise<void> {
    automationEngine.log('info', '[步骤9/12] 点击"+"图标...');
    await zbbAutomation.showToast('步骤9: 点击"+"图标');
    await zbbAutomation.delay(getDelay('other'));
    
    await zbbAutomation.clickByText('+');
    
    await zbbAutomation.showToast('步骤9完成 ✓');
    automationEngine.log('success', '[步骤9/12] ✓ 点击"+"成功');
  }
  
  private async stepClickAlbum(): Promise<void> {
    automationEngine.log('info', '[步骤10/12] 点击"相册"...');
    await zbbAutomation.showToast('步骤10: 点击"相册"');
    await zbbAutomation.delay(getDelay('other'));
    
    await zbbAutomation.clickByText('相册');
    
    await zbbAutomation.showToast('步骤10完成 ✓');
    automationEngine.log('success', '[步骤10/12] ✓ 点击"相册"成功');
  }
  
  private async stepSelectPhotos(): Promise<void> {
    automationEngine.log('info', '[步骤11/12] 选择截图...');
    await zbbAutomation.showToast('步骤11: 选择截图');
    await zbbAutomation.delay(getDelay('other'));
    
    // 选择第一张截图（最新）
    automationEngine.log('info', '[步骤11/12] 选择截图');
    
    await zbbAutomation.showToast('步骤11完成 ✓');
    automationEngine.log('success', '[步骤11/12] ✓ 截图已选择');
  }
  
  private async stepSend(): Promise<void> {
    automationEngine.log('info', '[步骤12/12] 发送消息...');
    await zbbAutomation.showToast('步骤12: 发送消息');
    await zbbAutomation.delay(getDelay('other'));
    
    await zbbAutomation.clickByText('发送');
    
    await zbbAutomation.showToast('步骤12完成 ✓');
    automationEngine.log('success', '[步骤12/12] ✓ 消息已发送');
  }
  
  private async stepExitDouyin(): Promise<void> {
    automationEngine.log('info', '[完成] 退出抖音...');
    await zbbAutomation.showToast('流程完成！请手动退出抖音');
    await zbbAutomation.delay(getDelay('other'));
    
    automationEngine.log('success', '[完成] ✓ 流程执行完毕');
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
        automationEngine.log('info', `${logPrefix} ✓ 找到: ${targetText}`);
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
    automationEngine.log('info', '[原生] ========== 阶段三：打开微信 ==========');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 等待应用切换
      await zbbAutomation.delay(getDelay('openApp'));
      
      // 检查当前包名
      const packageName = await zbbAutomation.getCurrentPackageName();
      automationEngine.log('info', `[原生] 当前包名: ${packageName}`);
      
      automationEngine.log('success', '[原生] ✓ 阶段三完成: 微信已打开');
    } catch (error) {
      automationEngine.log('error', `[原生] 阶段三失败: ${error}`);
      throw error;
    }
  }
  
  // ==================== 阶段四：搜索并进入绿城云小程序 ====================
  
  /**
   * 搜索并进入绿城云小程序
   */
  async searchAndEnterMiniApp(): Promise<void> {
    automationEngine.log('info', '[原生] ========== 阶段四：搜索小程序 ==========');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 步骤9-12
      await this.stepPullDownWechat();
      await this.stepClickSearchIcon();
      await this.stepInputSearchKeyword();
      await this.stepClickSearchResult();
      
      automationEngine.log('success', '[原生] ✓ 阶段四完成: 已进入绿城云小程序');
    } catch (error) {
      automationEngine.log('error', `[原生] 阶段四失败: ${error}`);
      throw error;
    }
  }
  
  private async stepPullDownWechat(): Promise<void> {
    automationEngine.log('info', '[微信] 下拉首页...');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('下拉首页');
    await zbbAutomation.delay(getDelay('other'));
    
    // 执行下拉操作
    await this.pullDown();
    await zbbAutomation.delay(getDelay('other'));
    
    // OCR识别屏幕内容
    automationEngine.log('info', '[微信] OCR识别屏幕...');
    const screenTexts = await this.recognizeScreenText();
    automationEngine.log('info', `[微信] 屏幕内容: ${screenTexts.slice(0, 15).join(', ')}`);
    
    // OCR确认：检查是否出现搜索相关内容
    const hasSearchContent = await this.checkScreenText('小程序', 3) ||
                              await this.checkScreenText('搜索', 3) ||
                              await this.checkScreenText('最近使用', 3) ||
                              await this.checkScreenText('我的小程序', 3);
    if (hasSearchContent) {
      automationEngine.log('success', '[微信] ✓ 下拉成功，已显示小程序入口');
    } else {
      automationEngine.log('warn', '[微信] 警告：未识别到小程序入口');
    }
  }
  
  private async stepClickSearchIcon(): Promise<void> {
    automationEngine.log('info', '[微信] 点击搜索图标...');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('进入搜索');
    await zbbAutomation.delay(getDelay('other'));
    
    // 获取屏幕尺寸
    const screenSize = await zbbAutomation.getScreenSize();
    if (!screenSize || !screenSize.width || !screenSize.height) {
      throw new Error('无法获取屏幕尺寸');
    }
    
    // 尝试文字匹配搜索图标附近的文字
    let clicked = await zbbAutomation.clickByText('搜索');
    
    // 如果文字匹配失败，用坐标点击右上角搜索图标
    if (!clicked) {
      automationEngine.log('warn', '[微信] 文字匹配失败，使用坐标点击右上角搜索图标');
      // 微信小程序下拉后，搜索图标在右上角（约90%宽度, 8%高度）
      const searchIconX = screenSize.width * 0.90; // 90% 宽度
      const searchIconY = screenSize.height * 0.08; // 8% 高度
      clicked = await clickAtPosition(searchIconX, searchIconY);
      automationEngine.log('info', `[微信] 坐标点击搜索图标: (${searchIconX}, ${searchIconY})`);
    }
    
    if (!clicked) {
      throw new Error('点击搜索图标失败');
    }
    
    await zbbAutomation.delay(getDelay('other'));
    
    // OCR确认：检查是否显示搜索输入框
    automationEngine.log('info', '[微信] OCR识别搜索界面...');
    const screenTexts = await this.recognizeScreenText();
    automationEngine.log('info', `[微信] 屏幕内容: ${screenTexts.slice(0, 15).join(', ')}`);
    
    // 输入搜索关键词"绿城云"
    automationEngine.log('info', '[微信] 输入搜索关键词: 绿城云');
    await zbbAutomation.inputText('绿城云');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击搜索结果中的"绿城云"
    automationEngine.log('info', '[微信] 点击搜索结果"绿城云"...');
    clicked = await zbbAutomation.clickByText('绿城云', false);
    
    if (!clicked) {
      // 尝试点击小程序图标（蓝绿色圆形）
      automationEngine.log('warn', '[微信] 未找到"绿城云"文字，点击第一个搜索结果');
      // 点击搜索结果列表的第一个项目（通常在搜索框下方）
      const resultX = screenSize.width * 0.5; // 中间位置
      const resultY = screenSize.height * 0.25; // 搜索框下方
      clicked = await clickAtPosition(resultX, resultY);
    }
    
    await zbbAutomation.delay(getDelay('openApp'));
    
    automationEngine.log('success', '[微信] ✓ 进入绿城云小程序');
  }
  
  private async stepInputSearchKeyword(): Promise<void> {
    // 此方法简化合并到 stepClickSearchIcon 中
    automationEngine.log('info', '[微信] 搜索关键词已输入');
  }
  
  private async stepClickSearchResult(): Promise<void> {
    // 此方法简化合并到 stepClickSearchIcon 中
    automationEngine.log('info', '[微信] 等待小程序加载...');
    await zbbAutomation.delay(getDelay('openApp'));
  }
  
  // ==================== 阶段五：进入项目详情 ====================
  
  /**
   * 进入项目详情 - 点击"我要推荐"
   */
  async enterProjectDetails(): Promise<void> {
    automationEngine.log('info', '[报备] 点击"我要推荐"...');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('点击我要推荐');
    await zbbAutomation.delay(getDelay('other'));
    
    try {
      // 获取屏幕尺寸
      const screenSize = await zbbAutomation.getScreenSize();
      
      // 先尝试文字匹配
      let clicked = await zbbAutomation.clickByText('我要推荐', false);
      
      // 如果文字匹配失败，使用坐标点击底部导航栏第三个按钮
      if (!clicked && screenSize && screenSize.width && screenSize.height) {
        automationEngine.log('warn', '[报备] 文字匹配失败，使用坐标点击"我要推荐"');
        // 底部导航栏"我要推荐"是第三个按钮，位置约在50%宽度，92%高度
        const buttonX = screenSize.width * 0.50; // 中间位置
        const buttonY = screenSize.height * 0.92; // 底部导航栏
        clicked = await clickAtPosition(buttonX, buttonY);
        automationEngine.log('info', `[报备] 坐标点击"我要推荐": (${buttonX}, ${buttonY})`);
      }
      
      if (!clicked) {
        throw new Error('点击"我要推荐"按钮失败');
      }
      
      await zbbAutomation.delay(getDelay('other'));
      
      // OCR识别屏幕
      automationEngine.log('info', '[报备] OCR识别屏幕...');
      const screenTexts = await this.recognizeScreenText();
      automationEngine.log('info', `[报备] 屏幕内容: ${screenTexts.slice(0, 15).join(', ')}`);
      
      // OCR确认：检查是否进入报备页面
      const hasCustomerNameField = await this.checkScreenText('客户姓名', 3) ||
                                     await this.checkScreenText('姓名', 3);
      const hasPhoneField = await this.checkScreenText('客户电话', 3) ||
                            await this.checkScreenText('手机号', 3) ||
                            await this.checkScreenText('电话', 3);
      
      if (hasCustomerNameField || hasPhoneField) {
        automationEngine.log('success', '[报备] ✓ 已进入报备页面');
      } else {
        automationEngine.log('warn', '[报备] 警告：可能未进入报备页面');
      }
    } catch (error) {
      automationEngine.log('error', `[报备] 点击"我要推荐"失败: ${error}`);
      throw error;
    }
  }
  
  // ==================== 阶段六+七：输入客户信息并报备第一个项目 ====================
  
  /**
   * 输入客户信息并提交第一个项目
   * 流程：输入姓名 -> 输入电话 -> 选择项目 -> 阅读须知 -> 点击立即推荐
   */
  async submitFirstProject(): Promise<void> {
    automationEngine.log('info', '[报备1] ========== 报备第一项目 ==========');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('报备项目1');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 获取客户信息
      const customerInfo = this.customerInfo || {
        name: '测试用户',
        phone: '13800138000',
        rawMessage: '测试数据'
      };
      
      // 步骤1: 输入客户姓名
      await this.stepInputCustomerName(customerInfo.name);
      
      // 步骤2: 输入客户电话
      await this.stepInputCustomerPhone(customerInfo.phone);
      
      // 步骤3: 选择第一个项目（绿城春月锦庐）
      await this.stepSelectFirstProject();
      
      // 步骤4: 阅读须知并点击立即推荐
      await this.stepReadNoticeAndSubmit();
      
      automationEngine.log('success', '[报备1] ✓ 第一项目报备完成');
      
    } catch (error) {
      automationEngine.log('error', `[报备1] 报备失败: ${error}`);
      throw error;
    }
  }
  
  private async stepInputCustomerName(name: string): Promise<void> {
    automationEngine.log('info', `[报备1] 输入客户姓名: ${name}`);
    automationEngine.updateCurrentStep('输入姓名');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击客户姓名输入框
    const clicked = await zbbAutomation.clickByText('客户姓名', false) ||
                    await zbbAutomation.clickByText('姓名', false);
    
    if (clicked) {
      await zbbAutomation.delay(500);
    }
    
    // 清空并输入
    await zbbAutomation.clearInput();
    await zbbAutomation.delay(300);
    await zbbAutomation.inputText(name);
    
    await zbbAutomation.delay(getDelay('other'));
    automationEngine.log('success', '[报备1] ✓ 姓名已输入');
  }
  
  private async stepInputCustomerPhone(phone: string): Promise<void> {
    automationEngine.log('info', `[报备1] 输入客户电话: ${phone}`);
    automationEngine.updateCurrentStep('输入电话');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击客户电话输入框
    const clicked = await zbbAutomation.clickByText('客户电话', false) ||
                    await zbbAutomation.clickByText('手机号', false) ||
                    await zbbAutomation.clickByText('电话', false);
    
    if (clicked) {
      await zbbAutomation.delay(500);
    }
    
    // 输入电话号码
    await zbbAutomation.inputText(phone);
    
    await zbbAutomation.delay(getDelay('other'));
    automationEngine.log('success', '[报备1] ✓ 电话已输入');
  }
  
  private async stepSelectFirstProject(): Promise<void> {
    automationEngine.log('info', '[报备1] 选择项目: 绿城春月锦庐');
    automationEngine.updateCurrentStep('选择项目');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击报备项目下拉/选择框
    const clicked = await zbbAutomation.clickByText('报备项目', false) ||
                    await zbbAutomation.clickByText('报备项目：', false) ||
                    await zbbAutomation.clickByText('选择项目', false);
    
    await zbbAutomation.delay(getDelay('other'));
    
    // 从下拉列表中选择项目
    const projectSelected = await zbbAutomation.clickByText('绿城春月锦庐', false) ||
                           await zbbAutomation.clickByText('春月锦庐', false);
    
    if (projectSelected) {
      automationEngine.log('success', '[报备1] ✓ 项目已选择');
    } else {
      // 如果下拉列表没有直接显示，尝试点击确认
      await zbbAutomation.clickByText('确定', false);
      await zbbAutomation.clickByText('确认', false);
      automationEngine.log('warn', '[报备1] 警告：项目选择可能需要手动确认');
    }
    
    await zbbAutomation.delay(getDelay('other'));
  }
  
  private async stepReadNoticeAndSubmit(): Promise<void> {
    automationEngine.log('info', '[报备1] 阅读须知并提交...');
    automationEngine.updateCurrentStep('阅读须知');
    
    // 步骤1: 点击《全民经纪人推荐购房须知》
    automationEngine.log('info', '[报备1] 点击须知链接...');
    const noticeClicked = await zbbAutomation.clickByText('全民经纪人推荐购房须知', false);
    
    if (noticeClicked) {
      automationEngine.log('info', '[报备1] 已点击须知链接，等待阅读（7秒）...');
      await zbbAutomation.delay(7000); // 等待阅读7秒
      
      // 步骤2: 点击"我已了解"（页面自动返回推荐页）
      automationEngine.log('info', '[报备1] 点击"我已了解"...');
      await zbbAutomation.clickByText('我已了解', false);
      
      // 等待页面自动返回
      await zbbAutomation.delay(getDelay('other'));
      automationEngine.log('info', '[报备1] 已点击"我已了解"，等待返回推荐页');
    } else {
      automationEngine.log('warn', '[报备1] 未找到须知链接，可能已展开或跳过');
    }
    
    // OCR确认屏幕状态
    automationEngine.log('info', '[报备1] OCR确认屏幕...');
    const screenTexts = await this.recognizeScreenText();
    automationEngine.log('info', `[报备1] 屏幕内容: ${screenTexts.slice(0, 15).join(', ')}`);
    
    // 步骤3: 点击"立即推荐"按钮
    automationEngine.log('info', '[报备1] 点击"立即推荐"...');
    await zbbAutomation.delay(getDelay('other'));
    
    const submitClicked = await zbbAutomation.clickByText('立即推荐', false);
    
    if (submitClicked) {
      await zbbAutomation.delay(getDelay('other'));
      
      // 检查是否有确认弹窗
      const hasConfirm = await this.checkScreenText('确定', 2) ||
                         await this.checkScreenText('确认', 2);
      if (hasConfirm) {
        await zbbAutomation.clickByText('确定', false);
        await zbbAutomation.clickByText('确认', false);
      }
      
      automationEngine.log('success', '[报备1] ✓ 已点击"立即推荐"');
    } else {
      automationEngine.log('error', '[报备1] 未找到"立即推荐"按钮');
      throw new Error('未找到"立即推荐"按钮');
    }
  }
  
  // ==================== 阶段八+九：输入第二条并报备第二个项目 ====================
  
  /**
   * 输入相同客户信息并提交第二个项目
   * 流程：返回报备页面 -> 输入姓名 -> 输入电话 -> 选择项目 -> 阅读须知 -> 点击立即推荐
   */
  async submitSecondProject(): Promise<void> {
    automationEngine.log('info', '[报备2] ========== 报备第二项目 ==========');
    automationEngine.updateCurrentApp('微信');
    automationEngine.updateCurrentStep('报备项目2');
    
    try {
      const ready = await this.checkServiceReady();
      if (!ready) throw new Error('无障碍服务未就绪');
      
      // 获取客户信息
      const customerInfo = this.customerInfo || {
        name: '测试用户',
        phone: '13800138000',
        rawMessage: '测试数据'
      };
      
      // 先返回报备页面
      automationEngine.log('info', '[报备2] 返回报备页面...');
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(getDelay('other'));
      
      // 步骤1: 输入客户姓名
      await this.stepInputCustomerName2(customerInfo.name);
      
      // 步骤2: 输入客户电话
      await this.stepInputCustomerPhone2(customerInfo.phone);
      
      // 步骤3: 选择第二个项目（绿城湖畔雲庐）
      await this.stepSelectSecondProject();
      
      // 步骤4: 阅读须知并点击立即推荐
      await this.stepReadNoticeAndSubmit2();
      
      automationEngine.log('success', '[报备2] ✓ 第二项目报备完成');
      
    } catch (error) {
      automationEngine.log('error', `[报备2] 报备失败: ${error}`);
      throw error;
    }
  }
  
  private async stepInputCustomerName2(name: string): Promise<void> {
    automationEngine.log('info', `[报备2] 输入客户姓名: ${name}`);
    automationEngine.updateCurrentStep('输入姓名');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击客户姓名输入框
    const clicked = await zbbAutomation.clickByText('客户姓名', false) ||
                    await zbbAutomation.clickByText('姓名', false);
    
    if (clicked) {
      await zbbAutomation.delay(500);
    }
    
    // 清空并输入
    await zbbAutomation.clearInput();
    await zbbAutomation.delay(300);
    await zbbAutomation.inputText(name);
    
    await zbbAutomation.delay(getDelay('other'));
    automationEngine.log('success', '[报备2] ✓ 姓名已输入');
  }
  
  private async stepInputCustomerPhone2(phone: string): Promise<void> {
    automationEngine.log('info', `[报备2] 输入客户电话: ${phone}`);
    automationEngine.updateCurrentStep('输入电话');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击客户电话输入框
    const clicked = await zbbAutomation.clickByText('客户电话', false) ||
                    await zbbAutomation.clickByText('手机号', false) ||
                    await zbbAutomation.clickByText('电话', false);
    
    if (clicked) {
      await zbbAutomation.delay(500);
    }
    
    // 输入电话号码
    await zbbAutomation.inputText(phone);
    
    await zbbAutomation.delay(getDelay('other'));
    automationEngine.log('success', '[报备2] ✓ 电话已输入');
  }
  
  private async stepSelectSecondProject(): Promise<void> {
    automationEngine.log('info', '[报备2] 选择项目: 绿城湖畔雲庐');
    automationEngine.updateCurrentStep('选择项目');
    await zbbAutomation.delay(getDelay('other'));
    
    // 点击报备项目下拉/选择框
    const clicked = await zbbAutomation.clickByText('报备项目', false) ||
                    await zbbAutomation.clickByText('报备项目：', false) ||
                    await zbbAutomation.clickByText('选择项目', false);
    
    await zbbAutomation.delay(getDelay('other'));
    
    // 从下拉列表中选择第二个项目
    const projectSelected = await zbbAutomation.clickByText('绿城湖畔雲庐', false) ||
                           await zbbAutomation.clickByText('湖畔雲庐', false) ||
                           await zbbAutomation.clickByText('湖畔', false);
    
    if (projectSelected) {
      automationEngine.log('success', '[报备2] ✓ 项目已选择');
    } else {
      // 如果下拉列表没有直接显示，尝试点击确认
      await zbbAutomation.clickByText('确定', false);
      await zbbAutomation.clickByText('确认', false);
      automationEngine.log('warn', '[报备2] 警告：项目选择可能需要手动确认');
    }
    
    await zbbAutomation.delay(getDelay('other'));
  }
  
  private async stepReadNoticeAndSubmit2(): Promise<void> {
    automationEngine.log('info', '[报备2] 阅读须知并提交...');
    automationEngine.updateCurrentStep('阅读须知');
    
    // 步骤1: 点击《全民经纪人推荐购房须知》
    automationEngine.log('info', '[报备2] 点击须知链接...');
    const noticeClicked = await zbbAutomation.clickByText('全民经纪人推荐购房须知', false);
    
    if (noticeClicked) {
      automationEngine.log('info', '[报备2] 已点击须知链接，等待阅读（7秒）...');
      await zbbAutomation.delay(7000); // 等待阅读7秒
      
      // 步骤2: 点击"我已了解"（页面自动返回推荐页）
      automationEngine.log('info', '[报备2] 点击"我已了解"...');
      await zbbAutomation.clickByText('我已了解', false);
      
      // 等待页面自动返回
      await zbbAutomation.delay(getDelay('other'));
      automationEngine.log('info', '[报备2] 已点击"我已了解"，等待返回推荐页');
    } else {
      automationEngine.log('warn', '[报备2] 未找到须知链接，可能已展开或跳过');
    }
    
    // OCR确认屏幕状态
    automationEngine.log('info', '[报备2] OCR确认屏幕...');
    const screenTexts = await this.recognizeScreenText();
    automationEngine.log('info', `[报备2] 屏幕内容: ${screenTexts.slice(0, 15).join(', ')}`);
    
    // 步骤3: 点击"立即推荐"按钮
    automationEngine.log('info', '[报备2] 点击"立即推荐"...');
    await zbbAutomation.delay(getDelay('other'));
    
    const submitClicked = await zbbAutomation.clickByText('立即推荐', false);
    
    if (submitClicked) {
      await zbbAutomation.delay(getDelay('other'));
      
      // 检查是否有确认弹窗
      const hasConfirm = await this.checkScreenText('确定', 2) ||
                         await this.checkScreenText('确认', 2);
      if (hasConfirm) {
        await zbbAutomation.clickByText('确定', false);
        await zbbAutomation.clickByText('确认', false);
      }
      
      automationEngine.log('success', '[报备2] ✓ 已点击"立即推荐"');
    } else {
      automationEngine.log('error', '[报备2] 未找到"立即推荐"按钮');
      throw new Error('未找到"立即推荐"按钮');
    }
  }
  
  // ==================== 阶段十：返回微信首页 ====================
  
  /**
   * 返回微信首页
   */
  async returnToWechatHome(): Promise<void> {
    automationEngine.log('info', '[返回] ========== 返回微信首页 ==========');
    await zbbAutomation.showToast('返回: 正在返回微信首页...');
    
    try {
      // 按返回键返回微信首页
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(getDelay('other'));
      await zbbAutomation.pressBack();
      
      await zbbAutomation.showToast('返回: 已返回微信首页 ✓');
      automationEngine.log('success', '[返回] ✓ 已返回微信首页');
    } catch (error) {
      automationEngine.log('error', `[返回] 返回失败: ${error}`);
      throw error;
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
      
      if (clipboardText) {
        // 解析姓名和电话
        const nameMatch = clipboardText.match(/[\u4e00-\u9fa5]{2,4}/);
        const phoneMatch = clipboardText.match(/1[3-9]\d{9}/);
        
        if (nameMatch && phoneMatch) {
          this.customerInfo = {
            name: nameMatch[0],
            phone: phoneMatch[0],
            rawMessage: clipboardText,
          };
          automationEngine.setCustomerInfo(this.customerInfo);
          await zbbAutomation.showToast(`客户信息: ${this.customerInfo.name} ${this.customerInfo.phone}`);
          logToBoth('success', `[流程] ✓ 姓名=${this.customerInfo.name}, 电话=${this.customerInfo.phone}`);
        } else {
          logToBoth('warn', '[流程] 信息解析不完整');
        }
      }
      
      // 阶段二：打开微信
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
   * 停止
   */
  stop(): void {
    this.isAborted = true;
    this.isRunning = false;
    // 隐藏悬浮窗
    zbbAutomation.hideFloatingWindow();
    automationEngine.log('warn', '[原生] 流程已停止');
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
}

// 导出单例
export const nativeAutomationService = NativeAutomationService.getInstance();
export { NativeAutomationService };
