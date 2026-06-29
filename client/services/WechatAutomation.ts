/**
 * 企业微信自动化流程
 * 版本: v3.0
 * 
 * 流程说明 (v3.0):
 * - 使用企业微信代替微信
 * - 企业微信节点树可见原生控件，可直接定位元素
 * - 小程序名称改为"新新绿城云"
 */

import { automationEngine, CustomerInfo } from './AutomationEngine';
import { screenshotService } from './ScreenshotService';
import ZBBAutomation from '@/native/ZBBAutomation';
// v3 全项目坐标规范化（按机型分支）
import { getTapCoord, getSwipeCoord } from '@/utils/deviceModel';

export type WechatPhase = 
  | 'init'
  | 'open_wechat'
  | 'pull_down'
  | 'screenshot_ocr'
  | 'click_xiaochengxu'
  | 'click_search'
  | 'input_xiaochengxu'
  | 'click_result'
  | 'click_tuijian'
  | 'input_name'
  | 'input_phone'
  | 'select_project'
  | 'confirm_project'
  | 'click_notice'
  | 'wait_notice'
  | 'click_understand'
  | 'return_form'
  | 'click_tuijian_btn'
  | 'capture_screenshot'
  | 'close_popup'
  | 'return_home'
  | 'completed'
  | 'error';

// 微信流程类
class WechatAutomation {
  private static instance: WechatAutomation;
  
  private currentPhase: WechatPhase = 'init';
  private customerInfo: CustomerInfo | null = null;
  private isRunning: boolean = false;
  
  // 项目配置
  private projects = {
    first: '郑州春月锦庐',
    second: '郑州湖畔雲庐',
  };
  
  /* eslint-disable @typescript-eslint/no-empty-function */
  private constructor() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  
  // 获取单例
  static getInstance(): WechatAutomation {
    if (!WechatAutomation.instance) {
      WechatAutomation.instance = new WechatAutomation();
    }
    return WechatAutomation.instance;
  }
  
  // 设置客户信息
  setCustomerInfo(info: CustomerInfo) {
    this.customerInfo = info;
    automationEngine.log('info', `[微信] 已设置客户信息: ${info.name} - ${info.phone}`);
  }
  
  // 执行延时
  private async delay(type: 'open' | 'normal' | 'notice'): Promise<void> {
    let ms: number;
    switch (type) {
      case 'open':
        ms = Math.floor(Math.random() * 5000) + 10000; // 10-15秒
        break;
      case 'notice':
        ms = 8000; // 8秒固定
        automationEngine.log('info', `[微信] 等待须知阅读倒计时 (8秒)...`);
        break;
      default:
        ms = Math.floor(Math.random() * 3000) + 5000; // 5-8秒
    }
    automationEngine.log('info', `[微信] 等待 ${ms / 1000} 秒...`);
    await new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // 模拟点击操作
  private async simulateClick(element: string): Promise<boolean> {
    automationEngine.log('info', `[微信] 点击: ${element}`);
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
    return true;
  }
  
  // 模拟输入操作
  private async simulateInput(field: string, value: string): Promise<boolean> {
    automationEngine.log('info', `[微信] 输入: ${field} = "${value}"`);
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));
    return true;
  }
  
  /**
   * 阶段三+四：打开微信 -> 下拉 -> OCR截图找新绿城云 -> 点击进入
   * 步骤8-12
   */
  async openAndEnter(): Promise<void> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    automationEngine.log('info', '[微信] ========== 打开微信并进入小程序 ==========');
    
    try {
      // 步骤8：打开微信
      await this.delay('open');
      this.currentPhase = 'open_wechat';
      automationEngine.log('success', '[微信] ⑧: 微信已打开');
      
      // 步骤9：下拉微信首页（显示小程序列表）
      await this.delay('normal');
      this.currentPhase = 'pull_down';
      // 步骤9：下拉微信首页（按机型分支）
      const swipePx = await getSwipeCoord('wechat_swipeDownHome_300_200_300_800');
      await ZBBAutomation.swipe(swipePx.startX, swipePx.startY, swipePx.endX, swipePx.endY, swipePx.duration);
      automationEngine.log('success', '[微信] ⑨: 下拉微信首页');
      
      // 等待下拉动画完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 步骤10：截图并使用 OCR 查找"新绿城云"
      this.currentPhase = 'screenshot_ocr';
      automationEngine.log('info', '[微信] ⑩: 截图并使用 OCR 查找"新绿城云"...');
      
      // 使用 findTextByMLKit 方法（AccessibilityServiceImpl 中已实现）
      const findResult = await ZBBAutomation.findTextByMLKit('新绿城云');
      
      if (findResult?.found && findResult.centerX && findResult.centerY) {
        automationEngine.log('success', `[微信] ⑩: OCR 找到"新绿城云" @ (${findResult.centerX}, ${findResult.centerY})`);
        
        // 步骤11：点击"新绿城云"
        await this.delay('normal');
        this.currentPhase = 'click_xiaochengxu';
        await ZBBAutomation.click(findResult.centerX, findResult.centerY);
        automationEngine.log('success', '[微信] ⑪: 点击"新绿城云"进入小程序');
      } else {
        automationEngine.log('error', `[微信] ⑩: 未找到"新绿城云"，请检查屏幕`);
        throw new Error('未找到"新绿城云"小程序，请检查屏幕');
      }
      
      // 等待小程序加载
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 步骤12：点击"我要推荐"
      await this.delay('normal');
      this.currentPhase = 'click_tuijian';
      
      // 先用 OCR 查找"我要推荐"
      const tuijianResult = await ZBBAutomation.findTextByMLKit('我要推荐');
      
      if (tuijianResult?.found && tuijianResult.centerX && tuijianResult.centerY) {
        await ZBBAutomation.click(tuijianResult.centerX, tuijianResult.centerY);
        automationEngine.log('success', '[微信] ⑫: 点击"我要推荐"成功');
      } else {
        // 使用校准坐标（按机型分支）
        automationEngine.log('warn', '[微信] ⑫: OCR 未找到"我要推荐"，使用校准坐标');
        const tuijianPx = await getTapCoord('native_wechat_tuijian_calib');
        await ZBBAutomation.click(tuijianPx.x, tuijianPx.y);
        automationEngine.log('success', '[微信] ⑫: 点击"我要推荐"(校准坐标)');
      }
      
      automationEngine.log('success', '[微信] ========== 已进入新绿城云小程序 ==========');
      
    } catch (error) {
      this.currentPhase = 'error';
      automationEngine.log('error', `[微信] 流程错误: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * 输入客户信息
   * 步骤14-15 或 步骤25-26
   */
  async inputCustomerInfo(isFirstProject: boolean = true): Promise<void> {
    if (!this.customerInfo) {
      throw new Error('客户信息未设置');
    }
    
    const stepPrefix = isFirstProject ? '⑭⑮' : '⑬⑭';
    
    // 输入客户姓名
    await this.delay('normal');
    this.currentPhase = 'input_name';
    await this.simulateInput('姓名输入框', this.customerInfo.name);
    automationEngine.log('success', `[微信] ${stepPrefix[0]}: 输入姓名 "${this.customerInfo.name}"`);
    
    // 输入客户电话
    await this.delay('normal');
    this.currentPhase = 'input_phone';
    await this.simulateInput('电话输入框', this.customerInfo.phone);
    automationEngine.log('success', `[微信] ${stepPrefix[1]}: 输入电话 "${this.customerInfo.phone}"`);
  }
  
  /**
   * 执行须知流程（v2.5: 不截图须知界面）
   * 须知链接 -> 等待8秒 -> 点击"我已了解" -> 返回
   */
  private async executeNoticeFlow(projectIndex: number): Promise<void> {
    const stepClickNotice = projectIndex === 1 ? '⑲' : '㉚';
    const stepWait = projectIndex === 1 ? '⑳' : '㉛';
    const stepReturn = projectIndex === 1 ? '⑳-1' : '㉛-1';
    
    // 步骤19/30：点击"全民经纪人推荐购房须知"
    await this.delay('normal');
    this.currentPhase = 'click_notice';
    await this.simulateClick('"全民经纪人推荐购房须知"');
    automationEngine.log('success', `[微信] ${stepClickNotice}: 点击"全民经纪人推荐购房须知"`);
    
    // 步骤20/31：等待8秒后点击"我已了解"
    await this.delay('notice');
    this.currentPhase = 'click_understand';
    await this.simulateClick('"我已了解"');
    automationEngine.log('success', `[微信] ${stepWait}: 等待8秒后，点击"我已了解"（系统自动勾选协议）`);
    
    // 步骤21/32：返回报备界面
    await this.delay('normal');
    this.currentPhase = 'return_form';
    await this.simulateClick('返回按钮');
    automationEngine.log('success', `[微信] ${stepReturn}: 返回报备界面`);
  }
  
  /**
   * 执行报备流程（含须知流程，v2.5）
   * @param projectIndex 项目索引 (1或2)
   */
  async submitProject(projectIndex: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    const projectName = projectIndex === 1 ? this.projects.first : this.projects.second;
    
    automationEngine.log('info', `[微信] ========== 报备项目${projectIndex}: ${projectName} ==========`);
    
    try {
      // 步骤16/27：点击"报备项目"下拉
      await this.delay('normal');
      this.currentPhase = 'select_project';
      await this.simulateClick('"报备项目"下拉');
      automationEngine.log('success', `[微信] ${projectIndex === 1 ? '⑯' : '㉕'}: 点击"报备项目"下拉`);
      
      // 步骤17/28：选择项目
      await this.delay('normal');
      await this.simulateClick(projectName);
      automationEngine.log('success', `[微信] ${projectIndex === 1 ? '⑰' : '㉖'}: 选择项目 "${projectName}"`);
      
      // 步骤18/29：点击"确认"
      await this.delay('normal');
      this.currentPhase = 'confirm_project';
      await this.simulateClick('"确认"按钮');
      automationEngine.log('success', `[微信] ${projectIndex === 1 ? '⑳' : '㉗'}: 点击"确认"`);
      
      // ===== 须知流程（v2.5: 不截图）=====
      await this.executeNoticeFlow(projectIndex);
      // ===== 须知流程结束 =====
      
      // 步骤22/33：点击"立即推荐"
      await this.delay('normal');
      this.currentPhase = 'click_tuijian_btn';
      await this.simulateClick('"立即推荐"按钮');
      automationEngine.log('success', `[微信] ${projectIndex === 1 ? '⑳-2' : '㉛-2'}: 点击"立即推荐"`);
      
      // 步骤23/34：截图保存报备成功界面（v2.5: 只截这个）
      await this.delay('normal');
      this.currentPhase = 'capture_screenshot';
      const successScreenshot = await screenshotService.captureScreen('success');
      automationEngine.log('success', `[微信] ${projectIndex === 1 ? '⑳-3' : '㉛-3'}: 截图保存报备成功界面 (${successScreenshot.filename})`);
      
      // 步骤24/35：点击"确定"关闭弹窗
      await this.delay('normal');
      this.currentPhase = 'close_popup';
      await this.simulateClick('"确定"按钮');
      automationEngine.log('success', `[微信] ${projectIndex === 1 ? '⑳-4' : '㉛-4'}: 点击"确定"关闭弹窗`);
      
      automationEngine.log('success', `[微信] ========== 项目${projectIndex}报备完成 ==========`);
      
    } catch (error) {
      this.currentPhase = 'error';
      automationEngine.log('error', `[微信] 流程错误: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * 阶段十：返回微信首页
   * 步骤36
   */
  async returnHome(): Promise<void> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    
    this.isRunning = true;
    automationEngine.log('info', '[微信] ========== 返回微信首页 ==========');
    
    try {
      // 步骤36：返回微信首页
      await this.delay('normal');
      this.currentPhase = 'return_home';
      await this.simulateClick('返回按钮');
      automationEngine.log('success', '[微信] ⑳-5: 返回微信首页');
      
      this.currentPhase = 'completed';
      automationEngine.log('success', '[微信] ========== 微信流程完成 ==========');
      
    } catch (error) {
      this.currentPhase = 'error';
      automationEngine.log('error', `[微信] 流程错误: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
  
  // 获取当前阶段
  getCurrentPhase(): WechatPhase {
    return this.currentPhase;
  }
  
  // 是否正在运行
  isInProgress(): boolean {
    return this.isRunning;
  }
  
  // 获取阶段名称
  getPhaseName(): string {
    const names: Record<WechatPhase, string> = {
      init: '初始化',
      open_wechat: '打开微信',
      pull_down: '下拉首页',
      click_search: '点击搜索',
      input_xiaochengxu: '输入小程序',
      click_result: '点击结果',
      click_tuijian: '点击推荐',
      input_name: '输入姓名',
      input_phone: '输入电话',
      select_project: '选择项目',
      confirm_project: '确认项目',
      click_notice: '点击须知',
      wait_notice: '等待须知',
      click_understand: '点击我已了解',
      return_form: '返回表单',
      click_tuijian_btn: '点击推荐按钮',
      capture_screenshot: '截图',
      close_popup: '关闭弹窗',
      return_home: '返回首页',
      completed: '完成',
      error: '错误',
    };
    return names[this.currentPhase] || this.currentPhase;
  }
}

// 导出单例
export const wechatAutomation = WechatAutomation.getInstance();
export { WechatAutomation };
