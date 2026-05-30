/* eslint-disable forbidEmoji/no-emoji */
/**
 * ZBB 自动化流程引擎
 * 版本: v2.5
 * 核心模块 - 管理自动化流程的执行、日志记录、状态追踪
 * 
 * 流程说明 (v2.5):
 * - 须知界面不再截图，只截图报备成功界面
 * - 点击"我已了解"后系统自动勾选协议
 */

// 流程阶段定义
export type FlowPhase = 
  | 'idle'                    // 空闲状态
  | 'open_douyin'             // 阶段一：打开抖音
  | 'find_message'            // 阶段二：找到并复制客户信息
  | 'open_wechat'             // 阶段三：打开微信
  | 'search_xiaochengxu'      // 阶段四：搜索并进入绿城云小程序
  | 'enter_project'           // 阶段五：进入项目详情
  | 'input_customer_1'        // 阶段六：输入第一条客户信息
  | 'select_project_1'        // 阶段七：选择第一个项目并提交
  | 'read_notice_1'          // 阶段七-附：阅读须知流程1
  | 'input_customer_2'        // 阶段八：输入第二条客户信息
  | 'select_project_2'        // 阶段九：选择第二个项目并提交
  | 'read_notice_2'          // 阶段九-附：阅读须知流程2
  | 'return_wechat'           // 阶段十：返回微信首页
  | 'open_douyin_send'       // 阶段十一：发送截图到抖音
  | 'exit_douyin'             // 阶段十二：退出抖音
  | 'completed'               // 完成
  | 'error'                   // 错误
  | 'paused'                  // 暂停
  | 'stopped';                // 停止

// 步骤信息
export interface StepInfo {
  step: number;                // 步骤编号 (1-44)
  name: string;                // 步骤名称
  phase: FlowPhase;            // 所属阶段
  delayType: 'open' | 'normal' | 'notice' | 'none';  // 延时类型
  description: string;         // 描述
  completed: boolean;          // 是否完成
  isScreenshot?: boolean;      // 是否为截图步骤
  error?: string;              // 错误信息
}

// 日志条目
export interface LogEntry {
  timestamp: number;           // 时间戳
  level: 'info' | 'warn' | 'error' | 'success';  // 日志级别
  message: string;             // 日志消息
  phase?: FlowPhase;           // 当前阶段
  step?: number;               // 当前步骤
  data?: any;                  // 附加数据
}

// 客户信息
export interface CustomerInfo {
  name: string;                // 客户姓名
  phone: string;               // 客户电话
  rawMessage: string;          // 原始消息
}

// 截图信息
export interface ScreenshotInfo {
  id: string;                  // 唯一ID
  path: string;                // 路径
  timestamp: number;           // 时间戳
  type: 'success';            // 类型：只有报备成功截图
  sent: boolean;               // 是否已发送
  projectIndex: number;        // 项目索引（1或2）
}

// 流程配置
export interface FlowConfig {
  delays: {
    openApp: { min: number; max: number };      // 打开APP延时
    other: { min: number; max: number };        // 其他操作延时
    notice: { min: number; max: number };       // 阅读须知延时
  };
  retries: {
    maxAttempts: number;       // 最大重试次数
    interval: number;           // 重试间隔
    timeout: number;           // 单步超时时间
  };
  projects: {
    first: string;              // 第一个项目
    second: string;            // 第二个项目
  };
  source: {
    app: string;               // 来源APP
    friend: string;            // 好友名称
  };
  targetApp: string;           // 目标小程序名称
}

// 默认配置
const DEFAULT_CONFIG: FlowConfig = {
  delays: {
    openApp: { min: 10000, max: 15000 },    // 10-15秒
    other: { min: 5000, max: 8000 },        // 5-8秒
    notice: { min: 8000, max: 8000 },       // 8秒（固定等待）
  },
  retries: {
    maxAttempts: 3,
    interval: 5000,
    timeout: 30000,
  },
  projects: {
    first: '郑州春月锦庐',
    second: '郑州湖畔雲庐',
  },
  source: {
    app: '抖音',
    friend: '栀子树下',
  },
  targetApp: '绿城云',
};

// 完整流程步骤定义（44步 v2.5）
const FLOW_STEPS: StepInfo[] = [
  // 【阶段一】打开抖音
  { step: 1, name: '打开抖音APP', phase: 'open_douyin', delayType: 'open', description: '启动抖音应用', completed: false },
  
  // 【阶段二】找到并复制客户信息
  { step: 2, name: '点击"消息"按钮', phase: 'find_message', delayType: 'normal', description: '点击右下角"消息"按钮', completed: false },
  { step: 3, name: 'OCR识别好友', phase: 'find_message', delayType: 'normal', description: 'OCR自动识别好友"栀子树下"', completed: false },
  { step: 4, name: '点击好友对话框', phase: 'find_message', delayType: 'normal', description: '点击"栀子树下"对话框', completed: false },
  { step: 5, name: '长按最新消息', phase: 'find_message', delayType: 'normal', description: '长按最新消息', completed: false },
  { step: 6, name: '点击"复制"按钮', phase: 'find_message', delayType: 'normal', description: '点击"复制"按钮', completed: false },
  { step: 7, name: '消息拆解', phase: 'find_message', delayType: 'normal', description: '消息拆解：汉字+11位数字', completed: false },
  
  // 【阶段三】打开微信
  { step: 8, name: '打开微信APP', phase: 'open_wechat', delayType: 'open', description: '启动微信应用（抖音保持在对话框界面）', completed: false },
  
  // 【阶段四】搜索并进入绿城云小程序
  { step: 9, name: '下拉微信首页', phase: 'search_xiaochengxu', delayType: 'normal', description: '下拉微信首页', completed: false },
  { step: 10, name: '点击搜索图标', phase: 'search_xiaochengxu', delayType: 'normal', description: '点击右上角搜索图标', completed: false },
  { step: 11, name: '输入"绿城云"', phase: 'search_xiaochengxu', delayType: 'normal', description: '在搜索框输入"绿城云"', completed: false },
  { step: 12, name: '点击搜索结果', phase: 'search_xiaochengxu', delayType: 'normal', description: '点击搜索结果第一个', completed: false },
  
  // 【阶段五】进入项目详情
  { step: 13, name: '点击"我要推荐"', phase: 'enter_project', delayType: 'normal', description: '点击底部"我要推荐"按钮', completed: false },
  
  // 【阶段六】输入第一条客户信息
  { step: 14, name: '输入客户姓名', phase: 'input_customer_1', delayType: 'normal', description: '输入客户姓名（汉字）', completed: false },
  { step: 15, name: '输入客户电话', phase: 'input_customer_1', delayType: 'normal', description: '输入客户电话（11位数字）', completed: false },
  
  // 【阶段七】选择第一个项目并提交（第1个截图）
  { step: 16, name: '点击"报备项目"下拉', phase: 'select_project_1', delayType: 'normal', description: '点击"报备项目"下拉', completed: false },
  { step: 17, name: '选择第一个项目', phase: 'select_project_1', delayType: 'normal', description: '选择第一个项目（郑州春月锦庐）', completed: false },
  { step: 18, name: '点击"确认"', phase: 'select_project_1', delayType: 'normal', description: '点击"确认"', completed: false },
  
  // 【阶段七-附】阅读须知流程1（须知不截图）
  { step: 19, name: '点击"全民经纪人推荐购房须知"', phase: 'read_notice_1', delayType: 'normal', description: '点击须知链接', completed: false },
  { step: 20, name: '等待8秒后点击"我已了解"', phase: 'read_notice_1', delayType: 'notice', description: '等待8秒后，点击"我已了解"（系统自动勾选协议）', completed: false },
  { step: 21, name: '返回报备界面', phase: 'read_notice_1', delayType: 'normal', description: '返回报备界面', completed: false },
  
  // 继续阶段七
  { step: 22, name: '点击"立即推荐"', phase: 'select_project_1', delayType: 'normal', description: '点击"立即推荐"', completed: false },
  { step: 23, name: '截图保存报备成功界面', phase: 'select_project_1', delayType: 'normal', description: 'ZBB自动截图保存报备成功界面', completed: false, isScreenshot: true },
  { step: 24, name: '点击"确定"关闭弹窗', phase: 'select_project_1', delayType: 'normal', description: '点击"确定"关闭弹窗', completed: false },
  
  // 【阶段八】输入第二条客户信息（同一组数据）
  { step: 25, name: '输入相同的客户姓名', phase: 'input_customer_2', delayType: 'normal', description: '输入相同的客户姓名', completed: false },
  { step: 26, name: '输入相同的客户电话', phase: 'input_customer_2', delayType: 'normal', description: '输入相同的客户电话', completed: false },
  
  // 【阶段九】选择第二个项目并提交（第2个截图）
  { step: 27, name: '点击"报备项目"下拉', phase: 'select_project_2', delayType: 'normal', description: '点击"报备项目"下拉', completed: false },
  { step: 28, name: '选择第二个项目', phase: 'select_project_2', delayType: 'normal', description: '选择第二个项目（郑州湖畔雲庐）', completed: false },
  { step: 29, name: '点击"确认"', phase: 'select_project_2', delayType: 'normal', description: '点击"确认"', completed: false },
  
  // 【阶段九-附】阅读须知流程2（须知不截图）
  { step: 30, name: '点击"全民经纪人推荐购房须知"', phase: 'read_notice_2', delayType: 'normal', description: '点击须知链接', completed: false },
  { step: 31, name: '等待8秒后点击"我已了解"', phase: 'read_notice_2', delayType: 'notice', description: '等待8秒后，点击"我已了解"（系统自动勾选协议）', completed: false },
  { step: 32, name: '返回报备界面', phase: 'read_notice_2', delayType: 'normal', description: '返回报备界面', completed: false },
  
  // 继续阶段九
  { step: 33, name: '点击"立即推荐"', phase: 'select_project_2', delayType: 'normal', description: '点击"立即推荐"', completed: false },
  { step: 34, name: '截图保存报备成功界面', phase: 'select_project_2', delayType: 'normal', description: 'ZBB自动截图保存报备成功界面', completed: false, isScreenshot: true },
  { step: 35, name: '点击"确定"关闭弹窗', phase: 'select_project_2', delayType: 'normal', description: '点击"确定"关闭弹窗', completed: false },
  
  // 【阶段十】返回微信首页
  { step: 36, name: '返回微信首页', phase: 'return_wechat', delayType: 'normal', description: '返回微信首页（确保下次打开在首页）', completed: false },
  
  // 【阶段十一】发送截图到抖音
  { step: 37, name: '打开抖音APP', phase: 'open_douyin_send', delayType: 'open', description: '直接回到"栀子树下"对话框界面', completed: false },
  { step: 38, name: '点击"+"图标', phase: 'open_douyin_send', delayType: 'normal', description: '点击"+"图标', completed: false },
  { step: 39, name: '点击"相册"选项', phase: 'open_douyin_send', delayType: 'normal', description: '点击"相册"选项', completed: false },
  { step: 40, name: '选择第一张截图', phase: 'open_douyin_send', delayType: 'normal', description: '选择左上第一行第一个（最新截图）', completed: false },
  { step: 41, name: '选择第二张截图', phase: 'open_douyin_send', delayType: 'normal', description: '选择左上第一行第二个（次新截图）', completed: false },
  { step: 42, name: '点击"发送"按钮', phase: 'open_douyin_send', delayType: 'normal', description: '点击右下角"发送"按钮', completed: false },
  
  // 【阶段十二】退出抖音
  { step: 43, name: '完全退出抖音APP', phase: 'exit_douyin', delayType: 'normal', description: '完全退出抖音APP（确保再次进入是首页）', completed: false },
];

// 事件类型
type FlowEventType = 
  | 'started'
  | 'step_changed'
  | 'step_completed'
  | 'phase_changed'
  | 'screenshot_taken'
  | 'notice_waiting'
  | 'notice_completed'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'completed'
  | 'error'
  | 'log';

// 事件监听器
type FlowEventListener = (event: FlowEvent) => void;

// 流程事件
interface FlowEvent {
  type: FlowEventType;
  data?: any;
  timestamp: number;
}

// 流程引擎类
class AutomationEngine {
  private static instance: AutomationEngine;
  
  private config: FlowConfig;
  private steps: StepInfo[];
  private logs: LogEntry[] = [];
  private listeners: FlowEventListener[] = [];
  
  private currentStepIndex: number = -1;
  private currentPhase: FlowPhase = 'idle';
  private status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'error' = 'idle';
  private currentApp: string = '';  // 当前APP名称
  private currentStep: string = ''; // 当前操作步骤
  
  private customerInfo: CustomerInfo | null = null;
  private screenshots: ScreenshotInfo[] = [];
  
  private executionTimer: ReturnType<typeof setTimeout> | null = null;
  private isAborted: boolean = false;
  
  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.steps = JSON.parse(JSON.stringify(FLOW_STEPS));
  }
  
  // 获取单例
  static getInstance(): AutomationEngine {
    if (!AutomationEngine.instance) {
      AutomationEngine.instance = new AutomationEngine();
    }
    return AutomationEngine.instance;
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
    const event: FlowEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.listeners.forEach(listener => listener(event));
  }
  
  // 添加日志
  log(level: LogEntry['level'], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      phase: this.currentPhase,
      step: this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex].step : undefined,
      data,
    };
    this.logs.push(entry);
    this.emit('log', entry);
  }
  
  // 更新当前APP
  updateCurrentApp(appName: string) {
    this.currentApp = appName;
    this.emit('appChanged', appName);
  }
  
  // 更新当前步骤
  updateCurrentStep(step: string) {
    this.currentStep = step;
    this.emit('stepChanged', step);
  }
  
  // 获取当前APP
  getCurrentApp(): string {
    return this.currentApp;
  }
  
  // 获取当前步骤
  getCurrentStep(): string {
    return this.currentStep;
  }
  
  // 获取随机延时
  private getDelay(type: 'openApp' | 'other' | 'notice'): number {
    const cfg = this.config.delays;
    switch (type) {
      case 'openApp':
        return Math.floor(Math.random() * (cfg.openApp.max - cfg.openApp.min + 1)) + cfg.openApp.min;
      case 'notice':
        return cfg.notice.min; // 8秒固定
      default:
        return Math.floor(Math.random() * (cfg.other.max - cfg.other.min + 1)) + cfg.other.min;
    }
  }
  
  // 开始流程
  async start(customerInfo?: CustomerInfo): Promise<void> {
    if (this.status === 'running') {
      throw new Error('流程已在运行中');
    }
    
    // 重置状态
    this.reset();
    this.status = 'running';
    this.isAborted = false;
    
    if (customerInfo) {
      this.customerInfo = customerInfo;
    }
    
    this.log('info', '🚀 ZBB自动化流程开始 (v2.5)');
    this.log('info', `客户信息: ${this.customerInfo?.name || '待识别'} - ${this.customerInfo?.phone || '待识别'}`);
    this.log('info', `第一个项目: ${this.config.projects.first}`);
    this.log('info', `第二个项目: ${this.config.projects.second}`);
    
    this.emit('started', { customerInfo: this.customerInfo });
    
    await this.executeFlow();
  }
  
  // 暂停流程
  pause(): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.log('warn', '⏸ 流程已暂停');
    this.emit('paused');
  }
  
  // 恢复流程
  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.log('info', '▶ 流程已恢复');
    this.emit('resumed');
    await this.executeFlow();
  }
  
  // 停止流程
  stop(): void {
    this.isAborted = true;
    this.status = 'stopped';
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }
    this.log('warn', '⏹ 流程已停止');
    this.emit('stopped');
  }
  
  // 重置流程
  reset(): void {
    this.stop();
    this.steps = JSON.parse(JSON.stringify(FLOW_STEPS));
    this.currentStepIndex = -1;
    this.currentPhase = 'idle';
    this.screenshots = [];
    this.status = 'idle';
    this.logs = [];
    this.log('info', '🔄 流程已重置');
  }
  
  // 执行流程
  private async executeFlow(): Promise<void> {
    for (let i = 0; i < this.steps.length; i++) {
      if (this.isAborted) {
        this.status = 'stopped';
        return;
      }
      
      while (this.status === 'paused') {
        await this.delay(1000);
        if (this.isAborted) return;
      }
      
      this.currentStepIndex = i;
      const step = this.steps[i];
      const newPhase = step.phase;
      
      if (newPhase !== this.currentPhase) {
        this.log('info', `📍 进入阶段: ${this.getPhaseName(newPhase)}`);
        this.currentPhase = newPhase;
        this.emit('phase_changed', { phase: newPhase });
      }
      
      this.emit('step_changed', { step: step, index: i });
      this.log('info', `▶ 步骤${step.step}: ${step.name}`, { description: step.description });
      
      // 计算延时
      let delay: number;
      switch (step.delayType) {
        case 'open':
          delay = this.getDelay('openApp');
          break;
        case 'notice':
          delay = this.getDelay('notice');
          this.log('info', '⏳ 正在等待须知阅读倒计时 (8秒)...');
          this.emit('notice_waiting', { step: step, waitTime: delay });
          break;
        default:
          delay = this.getDelay('other');
      }
      
      // 执行步骤
      await this.executeStep(step);
      
      // 标记步骤完成
      step.completed = true;
      this.emit('step_completed', { step: step, index: i });
      this.log('success', `✓ 步骤${step.step}完成`);
      
      // 须知完成
      if (step.phase === 'read_notice_1' || step.phase === 'read_notice_2') {
        this.emit('notice_completed', { step: step });
      }
      
      // 延时
      if (i < this.steps.length - 1) {
        if (step.delayType !== 'notice') {
          this.log('info', `⏳ 等待 ${delay / 1000} 秒...`);
        }
        await this.delay(delay);
      }
    }
    
    this.status = 'completed';
    this.currentPhase = 'completed';
    this.log('success', '🎉 ZBB自动化流程完成！');
    this.emit('completed');
  }
  
  // 执行单个步骤
  private async executeStep(step: StepInfo): Promise<void> {
    const execTime = 1000 + Math.random() * 1000;
    await this.delay(execTime);
    
    if (step.isScreenshot) {
      await this.takeScreenshot(step);
    }
  }
  
  // 截图（只截报备成功界面）
  private async takeScreenshot(step: StepInfo): Promise<void> {
    const projectIndex = step.phase === 'select_project_1' ? 1 : 2;
    
    const screenshot: ScreenshotInfo = {
      id: `screenshot_${Date.now()}`,
      path: `/tmp/ZBB_${Date.now()}_success_${projectIndex}.png`,
      timestamp: Date.now(),
      type: 'success',
      sent: false,
      projectIndex,
    };
    this.screenshots.push(screenshot);
    this.log('success', `📸 截图已保存: ${screenshot.path} (项目${projectIndex}报备成功)`);
    this.emit('screenshot_taken', screenshot);
  }
  
  // 延时
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.executionTimer = setTimeout(resolve, ms);
    });
  }
  
  // 获取阶段名称
  private getPhaseName(phase: FlowPhase): string {
    const names: Record<FlowPhase, string> = {
      idle: '空闲',
      open_douyin: '打开抖音',
      find_message: '找到并复制客户信息',
      open_wechat: '打开微信',
      search_xiaochengxu: '搜索小程序',
      enter_project: '进入项目详情',
      input_customer_1: '输入第一条客户信息',
      select_project_1: '选择第一个项目',
      read_notice_1: '阅读须知流程1',
      input_customer_2: '输入第二条客户信息',
      select_project_2: '选择第二个项目',
      read_notice_2: '阅读须知流程2',
      return_wechat: '返回微信首页',
      open_douyin_send: '发送截图到抖音',
      exit_douyin: '退出抖音',
      completed: '完成',
      error: '错误',
      paused: '暂停',
      stopped: '停止',
    };
    return names[phase] || phase;
  }
  
  // 获取器
  getStatus() { return this.status; }
  getCurrentPhase() { return this.currentPhase; }
  getCurrentStepIndex() { return this.currentStepIndex; }
  getCurrentStepName() { return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null; }
  getSteps() { return this.steps; }
  getLogs() { return this.logs; }
  getScreenshots() { return this.screenshots; }
  getCustomerInfo() { return this.customerInfo; }
  getConfig() { return this.config; }
  
  // 设置客户信息
  setCustomerInfo(info: CustomerInfo) {
    this.customerInfo = info;
    this.log('info', `已设置客户信息: ${info.name} - ${info.phone}`);
  }
}

// 导出单例
export const automationEngine = AutomationEngine.getInstance();
export { AutomationEngine };
