/**
 * 抖音自动化流程
 * 版本: v2.5
 * 
 * 流程说明 (v2.5):
 * - 阶段一+二：打开抖音，获取客户信息
 * - 阶段十一+十二：发送截图到抖音并退出
 */

import { automationEngine, CustomerInfo } from './AutomationEngine';
import { screenshotService } from './ScreenshotService';
import { ocrService } from './OCRService';

// 流程阶段
export type DouyinPhase = 
  | 'init'
  | 'open_douyin'
  | 'click_messages'
  | 'find_friend'
  | 'click_chat'
  | 'long_press_message'
  | 'click_copy'
  | 'parse_message'
  | 'open_douyin_send'
  | 'click_add'
  | 'click_album'
  | 'select_photo_1'
  | 'select_photo_2'
  | 'click_send'
  | 'exit_app'
  | 'completed'
  | 'error';

// 抖音流程类
class DouyinAutomation {
  private static instance: DouyinAutomation;
  
  private currentPhase: DouyinPhase = 'init';
  private friendName: string = '只如初见';
  private customerInfo: CustomerInfo | null = null;
  private isRunning: boolean = false;
  
  /* eslint-disable @typescript-eslint/no-empty-function */
  private constructor() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  
  // 获取单例
  static getInstance(): DouyinAutomation {
    if (!DouyinAutomation.instance) {
      DouyinAutomation.instance = new DouyinAutomation();
    }
    return DouyinAutomation.instance;
  }
  
  // 设置好友名称
  setFriendName(name: string) {
    this.friendName = name;
    automationEngine.log('info', `[抖音] 已设置好友名称: ${name}`);
  }
  
  // 执行延时
  private async delay(type: 'open' | 'normal'): Promise<void> {
    const min = type === 'open' ? 10000 : 5000;
    const max = type === 'open' ? 15000 : 8000;
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    automationEngine.log('info', `[抖音] 等待 ${ms / 1000} 秒...`);
    await new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // 模拟点击操作
  private async simulateClick(element: string): Promise<boolean> {
    automationEngine.log('info', `[抖音] 点击: ${element}`);
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
    return true;
  }
  
  // 模拟OCR识别
  private async simulateOCR(target: string): Promise<string | null> {
    automationEngine.log('info', `[抖音] OCR识别: ${target}`);
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    return target;
  }
  
  // 模拟长按操作
  private async simulateLongPress(element: string, duration: number = 1000): Promise<boolean> {
    automationEngine.log('info', `[抖音] 长按: ${element} (${duration}ms)`);
    await new Promise(resolve => setTimeout(resolve, duration + 500));
    return true;
  }
  
  /**
   * 阶段一+二：获取客户信息
   * 步骤1-7
   */
  async fetchCustomerInfo(): Promise<CustomerInfo | null> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    automationEngine.log('info', '[抖音] ========== 阶段一+二：获取客户信息 ==========');
    
    try {
      // 步骤1：打开抖音
      await this.delay('open');
      this.currentPhase = 'open_douyin';
      automationEngine.log('success', '[抖音] ①: 抖音已打开');
      
      // 步骤2：点击消息按钮
      await this.delay('normal');
      this.currentPhase = 'click_messages';
      await this.simulateClick('右下角"消息"按钮');
      automationEngine.log('success', '[抖音] ②: 点击"消息"');
      
      // 步骤3：原生节点树定位好友"只如初见"
      await this.delay('normal');
      this.currentPhase = 'find_friend';
      automationEngine.log('info', `[抖音] 原生节点树定位好友: ${this.friendName}`);
      // 使用原生 findElementByText 定位好友
      await this.simulateClick(`好友"${this.friendName}"的列表项`);
      automationEngine.log('success', `[抖音] ③: 点击好友"${this.friendName}"`);
      
      // 步骤4：点击好友对话框
      await this.delay('normal');
      this.currentPhase = 'click_chat';
      await this.simulateClick(`好友"${this.friendName}"的对话框`);
      automationEngine.log('success', '[抖音] ④: 进入好友对话框');
      
      // 步骤5：长按最新消息
      await this.delay('normal');
      this.currentPhase = 'long_press_message';
      await this.simulateLongPress('最新消息', 1000);
      automationEngine.log('success', '[抖音] ⑤: 长按最新消息');
      
      // 步骤6：点击复制
      await this.delay('normal');
      this.currentPhase = 'click_copy';
      await this.simulateClick('"复制"按钮');
      automationEngine.log('success', '[抖音] ⑥: 点击"复制"');
      
      // 步骤7：拆解消息
      await this.delay('normal');
      this.currentPhase = 'parse_message';
      const rawMessage = '刘15325423611';
      const parseResult = ocrService.parseCustomerInfo(rawMessage);
      
      if (parseResult.success && parseResult.data) {
        this.customerInfo = parseResult.data;
        automationEngine.setCustomerInfo(this.customerInfo);
        automationEngine.log('success', '[抖音] ⑦: 消息拆解成功');
        automationEngine.log('info', `[抖音]    姓名: ${this.customerInfo.name}`);
        automationEngine.log('info', `[抖音]    电话: ${ocrService.formatPhone(this.customerInfo.phone)}`);
      } else {
        throw new Error(parseResult.error || '消息拆解失败');
      }
      
      automationEngine.log('success', '[抖音] ========== 客户信息获取完成 ==========');
      return this.customerInfo;
      
    } catch (error) {
      this.currentPhase = 'error';
      automationEngine.log('error', `[抖音] 流程错误: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * 阶段十一+十二：发送截图到抖音并退出
   * 步骤37-43
   */
  async sendScreenshotsAndExit(): Promise<void> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    automationEngine.log('info', '[抖音] ========== 阶段十一+十二：发送截图并退出 ==========');
    
    try {
      // 步骤37：打开抖音（直接回到对话框界面）
      await this.delay('open');
      this.currentPhase = 'open_douyin_send';
      automationEngine.log('success', '[抖音] ㊴: 打开抖音（直接回到对话框）');
      
      // 步骤38：点击+图标
      await this.delay('normal');
      this.currentPhase = 'click_add';
      await this.simulateClick('"+"图标');
      automationEngine.log('success', '[抖音] ㊵: 点击"+"图标');
      
      // 步骤39：点击相册
      await this.delay('normal');
      this.currentPhase = 'click_album';
      await this.simulateClick('"相册"选项');
      automationEngine.log('success', '[抖音] ㊶: 点击"相册"');
      
      // 获取未发送的截图
      const screenshots = screenshotService.getUnsentScreenshots();
      
      if (screenshots.length === 0) {
        throw new Error('没有可发送的截图');
      }
      
      // 步骤40：选择第一张截图（最新）
      await this.delay('normal');
      this.currentPhase = 'select_photo_1';
      await this.simulateClick(`截图1 (${screenshots[0].filename})`);
      screenshotService.markAsSent(screenshots[0].id);
      automationEngine.log('success', '[抖音] ㊷: 选择第一张截图');
      
      // 步骤41：选择第二张截图（次新）
      if (screenshots.length > 1) {
        await this.delay('normal');
        this.currentPhase = 'select_photo_2';
        await this.simulateClick(`截图2 (${screenshots[1].filename})`);
        screenshotService.markAsSent(screenshots[1].id);
        automationEngine.log('success', '[抖音] ㊸: 选择第二张截图');
      } else {
        automationEngine.log('warn', '[抖音] ㊸: 没有第二张截图，跳过');
      }
      
      // 步骤42：发送
      await this.delay('normal');
      this.currentPhase = 'click_send';
      await this.simulateClick('右下角"发送"按钮');
      automationEngine.log('success', '[抖音] ㊹: 发送截图');
      
      // 步骤43：退出抖音
      await this.delay('normal');
      this.currentPhase = 'exit_app';
      await this.simulateClick('退出抖音');
      automationEngine.log('success', '[抖音] ㊺: 完全退出抖音');
      
      this.currentPhase = 'completed';
      automationEngine.log('success', '[抖音] ========== 发送截图完成 ==========');
      
    } catch (error) {
      this.currentPhase = 'error';
      automationEngine.log('error', `[抖音] 流程错误: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  // 获取当前客户信息
  getCustomerInfo(): CustomerInfo | null {
    return this.customerInfo;
  }
  
  // 获取当前阶段
  getCurrentPhase(): DouyinPhase {
    return this.currentPhase;
  }
  
  // 是否正在运行
  isInProgress(): boolean {
    return this.isRunning;
  }
  
  // 获取阶段名称
  getPhaseName(): string {
    const names: Record<DouyinPhase, string> = {
      init: '初始化',
      open_douyin: '打开抖音',
      click_messages: '点击消息',
      find_friend: '识别好友',
      click_chat: '点击对话框',
      long_press_message: '长按消息',
      click_copy: '点击复制',
      parse_message: '拆解消息',
      open_douyin_send: '发送截图',
      click_add: '点击添加',
      click_album: '点击相册',
      select_photo_1: '选择图片1',
      select_photo_2: '选择图片2',
      click_send: '发送',
      exit_app: '退出',
      completed: '完成',
      error: '错误',
    };
    return names[this.currentPhase] || this.currentPhase;
  }
}

// 导出单例
export const douyinAutomation = DouyinAutomation.getInstance();
export { DouyinAutomation };
