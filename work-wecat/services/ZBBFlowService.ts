/**
 * 完整自动化流程服务
 * 版本: v2.5
 * 
 * 流程: 抖音获取信息 -> 微信报备项目1 -> 微信报备项目2 -> 抖音发送截图
 * 
 * 须知流程说明 (v2.5):
 * - 须知界面不再截图
 * - 点击"我已了解"后系统自动勾选协议
 */

import { automationEngine, CustomerInfo, FlowPhase } from './AutomationEngine';
import { wechatAutomation } from './WechatAutomation';
import { douyinAutomation } from './DouyinAutomation';
import { screenshotService } from './ScreenshotService';

// 流程状态
export type ZBBStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'stopped';

// 流程阶段
export type ZBBPhase = 
  | 'idle'
  | 'douyin_get_info'      // 抖音获取客户信息
  | 'wechat_enter'         // 微信进入小程序
  | 'wechat_project_1'     // 微信报备项目1
  | 'wechat_project_2'     // 微信报备项目2
  | 'wechat_return'        // 微信返回首页
  | 'douyin_send'          // 抖音发送截图
  | 'completed'
  | 'error';

// 完整流程结果
export interface FlowResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  screenshots?: string[];
  error?: string;
  duration?: number;
}

// 事件类型
type FlowEventType = 
  | 'started'
  | 'phase_changed'
  | 'step_completed'
  | 'screenshot_taken'
  | 'notice_waiting'
  | 'notice_completed'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'completed'
  | 'error';

// 事件监听器
type FlowEventListener = (event: { type: FlowEventType; data?: any }) => void;

// ZBB完整流程类
class ZBBFlowService {
  private static instance: ZBBFlowService;
  
  private status: ZBBStatus = 'idle';
  private currentPhase: ZBBPhase = 'idle';
  private listeners: FlowEventListener[] = [];
  
  private config = {
    project1: '郑州春月锦庐',
    project2: '郑州湖畔雲庐',
    friendName: '栀子树下',
    sourceApp: '抖音',
    targetApp: '绿城云',
  };
  
  private startTime: number = 0;
  private customerInfo: CustomerInfo | null = null;
  
  /* eslint-disable @typescript-eslint/no-empty-function */
  private constructor() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  
  // 获取单例
  static getInstance(): ZBBFlowService {
    if (!ZBBFlowService.instance) {
      ZBBFlowService.instance = new ZBBFlowService();
    }
    return ZBBFlowService.instance;
  }
  
  // 添加事件监听
  addListener(listener: FlowEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  // 触发事件
  private emit(type: FlowEventType, data?: any) {
    this.listeners.forEach(listener => listener({ type, data }));
  }
  
  // 设置配置
  setConfig(config: Partial<typeof this.config>) {
    this.config = { ...this.config, ...config };
    automationEngine.log('info', '[ZBB] 配置已更新');
  }
  
  // 获取配置
  getConfig() {
    return { ...this.config };
  }
  
  /**
   * 执行完整自动化流程 (v2.5)
   * 流程: 抖音获取信息 -> 微信报备项目1 -> 微信报备项目2 -> 微信返回首页 -> 抖音发送截图
   */
  async executeFullFlow(): Promise<FlowResult> {
    if (this.status === 'running') {
      throw new Error('流程已在运行中');
    }
    
    this.status = 'running';
    this.startTime = Date.now();
    this.currentPhase = 'idle';
    
    // 重置引擎
    automationEngine.reset();
    
    automationEngine.log('info', '╔═══════════════════════════════════════════════════════════╗');
    automationEngine.log('info', '║           ZBB 自动化流程开始 (v2.5)                       ║');
    automationEngine.log('info', '║  来源: 抖音 -> 目标: 微信绿城云 -> 反馈: 抖音              ║');
    automationEngine.log('info', '║  须知: 点击"我已了解"后自动勾选协议，不截须知界面          ║');
    automationEngine.log('info', '╚═══════════════════════════════════════════════════════════╝');
    
    this.emit('started');
    
    try {
      // ===== 阶段一+二：抖音获取客户信息 =====
      this.currentPhase = 'douyin_get_info';
      this.emit('phase_changed', { phase: this.currentPhase });
      automationEngine.log('info', '[ZBB] 阶段一+二: 抖音获取客户信息');
      
      douyinAutomation.setFriendName(this.config.friendName);
      const customerInfo = await douyinAutomation.fetchCustomerInfo();
      
      if (!customerInfo) {
        throw new Error('未获取到客户信息');
      }
      
      this.customerInfo = customerInfo;
      automationEngine.log('success', `[ZBB] 客户信息: ${customerInfo.name} - ${customerInfo.phone}`);
      
      // ===== 阶段三+四+五：微信进入小程序 =====
      this.currentPhase = 'wechat_enter';
      this.emit('phase_changed', { phase: this.currentPhase });
      automationEngine.log('info', '[ZBB] 阶段三+四+五: 微信进入绿城云小程序');
      
      await wechatAutomation.openAndEnter();
      
      // ===== 阶段六+七：报备项目1 =====
      this.currentPhase = 'wechat_project_1';
      this.emit('phase_changed', { phase: this.currentPhase });
      automationEngine.log('info', `[ZBB] 阶段六+七: 微信报备项目1 (${this.config.project1})`);
      
      wechatAutomation.setCustomerInfo(customerInfo);
      await wechatAutomation.inputCustomerInfo(true);
      await wechatAutomation.submitProject(1);
      
      // ===== 阶段八+九：报备项目2 =====
      this.currentPhase = 'wechat_project_2';
      this.emit('phase_changed', { phase: this.currentPhase });
      automationEngine.log('info', `[ZBB] 阶段八+九: 微信报备项目2 (${this.config.project2})`);
      
      await wechatAutomation.inputCustomerInfo(false);
      await wechatAutomation.submitProject(2);
      
      // ===== 阶段十：微信返回首页 =====
      this.currentPhase = 'wechat_return';
      this.emit('phase_changed', { phase: this.currentPhase });
      automationEngine.log('info', '[ZBB] 阶段十: 微信返回首页');
      
      await wechatAutomation.returnHome();
      
      // ===== 阶段十一+十二：抖音发送截图 =====
      this.currentPhase = 'douyin_send';
      this.emit('phase_changed', { phase: this.currentPhase });
      automationEngine.log('info', '[ZBB] 阶段十一+十二: 抖音发送截图');
      
      await douyinAutomation.sendScreenshotsAndExit();
      
      // 完成
      this.currentPhase = 'completed';
      this.status = 'completed';
      
      const duration = Date.now() - this.startTime;
      
      automationEngine.log('info', '╔═══════════════════════════════════════════════════════════╗');
      automationEngine.log('success', '║           ZBB 自动化流程完成                             ║');
      automationEngine.log('info', `║  总耗时: ${Math.round(duration / 1000)} 秒                                      ║`);
      automationEngine.log('info', `║  截图数量: ${screenshotService.getAllScreenshots().length} 张                                  ║`);
      automationEngine.log('info', '╚═══════════════════════════════════════════════════════════╝');
      
      this.emit('completed');
      
      return {
        success: true,
        customerInfo: this.customerInfo,
        screenshots: screenshotService.getAllScreenshots().map(s => s.filename),
        duration,
      };
      
    } catch (error) {
      this.currentPhase = 'error';
      this.status = 'error';
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      automationEngine.log('error', `[ZBB] 流程错误: ${errorMsg}`);
      automationEngine.log('error', '╔═══════════════════════════════════════════════════════════╗');
      automationEngine.log('error', '║           ZBB 自动化流程失败                             ║');
      automationEngine.log('error', `║  错误: ${errorMsg}                                      ║`);
      automationEngine.log('error', '╚═══════════════════════════════════════════════════════════╝');
      
      this.emit('error', { error: errorMsg });
      
      return {
        success: false,
        error: errorMsg,
        customerInfo: this.customerInfo || undefined,
      };
    }
  }
  
  // 暂停
  pause(): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    automationEngine.pause();
    this.emit('paused');
  }
  
  // 继续
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    automationEngine.resume();
    this.emit('resumed');
  }
  
  // 停止
  stop(): void {
    this.status = 'stopped';
    automationEngine.stop();
    this.emit('stopped');
  }
  
  // 获取状态
  getStatus(): ZBBStatus {
    return this.status;
  }
  
  // 获取阶段
  getPhase(): ZBBPhase {
    return this.currentPhase;
  }
  
  // 获取客户信息
  getCustomerInfo(): CustomerInfo | null {
    return this.customerInfo;
  }
  
  // 获取阶段名称
  getPhaseName(): string {
    const names: Record<ZBBPhase, string> = {
      idle: '空闲',
      douyin_get_info: '抖音获取信息',
      wechat_enter: '微信进入小程序',
      wechat_project_1: '微信报备项目1',
      wechat_project_2: '微信报备项目2',
      wechat_return: '微信返回首页',
      douyin_send: '抖音发送截图',
      completed: '已完成',
      error: '错误',
    };
    return names[this.currentPhase] || this.currentPhase;
  }
}

// 导出单例
export const zbbFlowService = ZBBFlowService.getInstance();
export { ZBBFlowService };
