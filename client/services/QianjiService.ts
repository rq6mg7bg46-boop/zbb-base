/**
 * 千机端自动化服务
 * 用途：从千机获取客户信息 → 云和家经纪云小程序报备 → 返回千机上传截图
 */

import { zbbAutomation } from '@/native';
import { logToBoth } from './AutomationLogger';
import { insertReport } from './DatabaseService';
import { BaoliService } from './BaoliService';

// 千机包名
const APP_PACKAGES = {
  QIANJI: 'com.lianjia.anchang',  // 千机/链家安家
  WECHAT: 'com.tencent.wework',   // 企业微信
};

// 千机主 Activity
const QIANJI_MAIN_ACTIVITY = 'com.lianjia.link.platform.main.MainActivity';

// 企业微信主 Activity
const WECHAT_MAIN_ACTIVITY = 'com.tencent.wework/.ui.index.WwMainActivity';

// 延时配置
const DELAY_CONFIG = {
  openApp: { min: 5000, max: 10000 },  // 开APP 5-10 秒
  other: { min: 2000, max: 3000 },      // 其他操作 2-3 秒
};

function getDelay(type: 'openApp' | 'other'): number {
  switch (type) {
    case 'openApp':
      return Math.floor(Math.random() * (DELAY_CONFIG.openApp.max - DELAY_CONFIG.openApp.min + 1)) + DELAY_CONFIG.openApp.min;
    default:
      return Math.floor(Math.random() * (DELAY_CONFIG.other.max - DELAY_CONFIG.other.min + 1)) + DELAY_CONFIG.other.min;
  }
}

export class QianjiService {
  private static instance: QianjiService;
  
  private constructor() {}
  
  public static getInstance(): QianjiService {
    if (!QianjiService.instance) {
      QianjiService.instance = new QianjiService();
    }
    return QianjiService.instance;
  }

  // 客户信息存储
  private customerInfo: {
    projectType: string;
    customerName: string;
    phone: string;
    agent: string;
    reportTime: string;
    expectedVisitTime: string;
  } | null = null;

  // 获取客户信息
  public getCustomerInfo(): typeof this.customerInfo {
    return this.customerInfo;
  }

  // 步骤2保存的界面节点数据
  private lastTextNodes: any[] = [];

  /**
   * ========== 步骤 1：打开千机 ==========
   */
  public async stepOpenQianji(): Promise<void> {
    logToBoth('info', '[千机：步骤1] 正在打开千机...');
    
    try {
      // 使用 AccessibilityService 权限启动千机
      const launched = await zbbAutomation.launchAppWithAmStart(
        APP_PACKAGES.QIANJI,
        QIANJI_MAIN_ACTIVITY
      );
      
      if (launched) {
        logToBoth('info', '[千机：步骤1] 千机已启动，等待界面加载...');
        await zbbAutomation.delay(getDelay('openApp'));
      } else {
        logToBoth('error', '[千机：步骤1] ✗ 千机启动失败');
        throw new Error('千机启动失败');
      }
      
      logToBoth('success', '[千机：步骤1] ✓ 千机已打开');
      
    } catch (error) {
      logToBoth('error', `[千机：步骤1] ✗ 打开千机失败: ${error}`);
      throw error;
    }
  }

  /**
   * ========== 步骤 2：识别当前界面内容 ==========
   */
  public async stepRecognizeInterface(): Promise<void> {
    logToBoth('info', '[千机：步骤2] 正在识别当前界面...');
    
    try {
      // 等待界面加载
      await zbbAutomation.delay(2000);
      
      // 获取所有文本节点
      const textNodes = await zbbAutomation.getAllTextNodes();
      
      logToBoth('info', `[千机：步骤2] === 界面文本节点 (共 ${textNodes.length} 个) ===`);
      
      // 过滤并输出有效节点
      const validNodes = textNodes.filter(node => 
        node.text && node.text.trim().length > 0 && node.centerX > 0 && node.centerY > 0
      );
      
      validNodes.forEach((node, index) => {
        logToBoth('info', `[千机：步骤2] ${index + 1}. "${node.text}" at (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`);
      });
      
      if (validNodes.length === 0) {
        logToBoth('warn', '[千机：步骤2] 未识别到任何文本节点');
      }
      
      logToBoth('success', `[千机：步骤2] ✓ 界面识别完成`);
      
      // 保存界面节点数据，供后续步骤使用
      this.lastTextNodes = validNodes;
      
    } catch (error) {
      logToBoth('error', `[千机：步骤2] ✗ 识别界面失败: ${error}`);
      throw error;
    }
  }

  /**
   * ========== 步骤 3：查找"报备审核"并收集客户信息（转发流程） ==========
   */
  public async stepFindAndCollectCustomer(): Promise<void> {
    try {
      logToBoth('info', '[千机：步骤3] 查找"报备审核"...');

      const textNodes = this.lastTextNodes;
      if (!textNodes || textNodes.length === 0) {
        logToBoth('warn', '[千机：步骤3] 无界面节点数据，请先执行步骤2');
        return;
      }

      // 1. 首次查找包含"报备审核"的节点
      let baobeiNode = textNodes.find(n => n.text && n.text.includes('报备审核'));

      // 2. 未找到则滑动屏幕（最多3次）
      let slideCount = 0;
      while (!baobeiNode && slideCount < 3) {
        slideCount++;
        logToBoth('info', `[千机：步骤3] 未找到，滑动屏幕 (${slideCount}/3)...`);
        await zbbAutomation.swipe(540, 1200, 540, 1000);
        await zbbAutomation.delay(1500);
        this.lastTextNodes = await zbbAutomation.getAllTextNodes();
        baobeiNode = this.lastTextNodes.find(n => n.text && n.text.includes('报备审核'));
      }

      if (!baobeiNode) {
        logToBoth('warn', '[千机：步骤3] ✗ 未找到"报备审核"，结束步骤');
        return;
      }

      logToBoth('info', `[千机：步骤3] 找到"报备审核" @ (${baobeiNode.centerX}, ${baobeiNode.centerY})`);

      // 3. 打印界面节点
      logToBoth('info', `[千机：步骤3] ====== 界面节点 (共${textNodes.length}个) ======`);
      textNodes.forEach((node: any, index: number) => {
        if (node.text && node.text.trim().length > 0) {
          logToBoth('info', `[千机：步骤3] 节点${index}: "${node.text}" @ (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`);
        }
      });
      logToBoth('info', `[千机：步骤3] ==============================`);

      // 4. 初始化客户信息结构
      const customerInfo: any = {
        projectType: 'baoli',
        customerName: '',
        phone: '',
        agent: '',
        reportTime: '',
        expectedVisitTime: '',
        city: '',
      };

      // 5. 判断是否为保利界面
      const isBaoli = textNodes.some(n => n.text && n.text.includes('保利'));
      if (!isBaoli) {
        logToBoth('warn', '[千机：步骤3] 界面无"保利"，跳过');
        return;
      }

      logToBoth('info', '[千机：步骤3] 检测到"保利"，启动转发流程...');

      // ========== 转发流程获取脱敏号码 ==========
      // 步骤3-1：找列表里的"转发"按钮，点击（格式：转发(2)）
      const forwardBtns = textNodes.filter(n => n.text && n.text.startsWith('转发'));
      if (forwardBtns.length === 0) {
        logToBoth('warn', '[千机：步骤3-1] 未找到"转发"按钮');
        return;
      }
      const firstForward = forwardBtns[0];
      logToBoth('info', `[千机：步骤3-1] 点击第1个"转发" @ (${firstForward.centerX}, ${firstForward.centerY})`);
      await zbbAutomation.tap(firstForward.centerX, firstForward.centerY);
      await zbbAutomation.delay(2000);

      // 步骤3-2：识别联系人列表页，找"转发"按钮，点击（选Y值最大的）
      const nodes2 = await zbbAutomation.getAllTextNodes();
      logToBoth('info', `[千机：步骤3-2] 联系人列表页 (${nodes2.length}个节点)`);
      nodes2.forEach((node: any, index: number) => {
        if (node.text && node.text.trim().length > 0) {
          logToBoth('info', `[千机：步骤3-2] 节点${index}: "${node.text}" @ (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`);
        }
      });
      const forwardList = nodes2.filter(n => n.text && n.text.startsWith('转发'));
      if (forwardList.length === 0) {
        logToBoth('warn', '[千机：步骤3-2] 未找到联系人列表中的"转发"');
        return;
      }
      // 取Y值最大的（屏幕下方）
      forwardList.sort((a, b) => b.centerY - a.centerY);
      const forwardInList = forwardList[0];
      logToBoth('info', `[千机：步骤3-2] 点击Y值最大的"转发" @ (${forwardInList.centerX}, ${forwardInList.centerY})`);
      await zbbAutomation.tap(forwardInList.centerX, forwardInList.centerY);
      await zbbAutomation.delay(2000);

      // 步骤3-3：识别分享页，找"复制"按钮，点击
      const nodes3 = await zbbAutomation.getAllTextNodes();
      logToBoth('info', `[千机：步骤3-3] 分享页 (${nodes3.length}个节点)`);
      const copyBtn = nodes3.find(n => n.text === '复制');
      if (!copyBtn) {
        logToBoth('warn', '[千机：步骤3-3] 未找到"复制"按钮');
        return;
      }
      logToBoth('info', `[千机：步骤3-3] 点击"复制" @ (${copyBtn.centerX}, ${copyBtn.centerY})`);
      await zbbAutomation.tap(copyBtn.centerX, copyBtn.centerY);
      await zbbAutomation.delay(1000);

      // 步骤3-4：读取剪贴板获取脱敏号码
      try {
        const clipboardText = await zbbAutomation.getClipboardText();
        // 脱敏号格式：177****1214 或 1**********
        const maskedPhoneRegex = /1[3-9]\d{2}\*{4}\d{4}/;
        if (clipboardText && maskedPhoneRegex.test(clipboardText)) {
          customerInfo.phone = clipboardText;
          logToBoth('info', `[千机：步骤3-4] 剪贴板获取脱敏号: ${customerInfo.phone}`);
        } else {
          // 脱敏号格式不匹配，静默跳过
        }
      } catch (e: any) {
        // 读剪贴板失败，静默
      }

      // 步骤3-4：读取剪贴板获取完整客户数据（姓名+电话+经纪人+报备时间等）
      try {
        const clipboardText = await zbbAutomation.getClipboardText();
        if (clipboardText && clipboardText.trim().length > 0) {
          logToBoth('info', `[千机：步骤3-4] 剪贴板内容: ${clipboardText.substring(0, 100)}...`);
          // 解析剪贴板
          const lines = clipboardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          lines.forEach((line: string) => {
            if (line.includes('客户姓名') || line.includes('客户姓名:')) {
              const parts = line.split(/[：:]/);
              if (parts[1]) customerInfo.customerName = parts[1].trim();
            } else if (line.includes('客户联系方式') || line.includes('客户联系方式:')) {
              const parts = line.split(/[：:]/);
              if (parts[1]) customerInfo.phone = parts[1].trim();
            } else if (line.includes('经纪人') && !line.includes('备注')) {
              const parts = line.split(/[：:]/);
              if (parts[1]) customerInfo.agent = parts[1].trim();
            } else if (line.includes('报备提交') || line.includes('报备提交:')) {
              const parts = line.split(/[：:]/);
              if (parts[1]) customerInfo.reportTime = parts[1].trim();
            } else if (line.includes('售卖城市') || line.includes('城市')) {
              const parts = line.split(/[：:]/);
              if (parts[1]) customerInfo.city = parts[1].trim();
            }
          });
          logToBoth('info', `[千机：步骤3-4] 解析结果: ${customerInfo.customerName} ${customerInfo.phone} ${customerInfo.agent}`);
        }
      } catch (e: any) {
        // 读剪贴板失败，静默
      }

      // 步骤3-5：按 Home 键返回桌面
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(500);
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(500);
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(1500);

      // 保存
      this.customerInfo = customerInfo;

    } catch (error) {
      logToBoth('error', `[千机：步骤3] ✗ 收集客户信息失败: ${error}`);
      throw error;
    }
  }

  /**
   * 解析剪贴板文本提取客户信息
   */
  private parseClipboardText(text: string): {
    projectType: string;
    customerName: string;
    phone: string;
    agent: string;
    reportTime: string;
    expectedVisitTime: string;
  } | null {
    try {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const result: any = {
        projectType: 'baoli',
        customerName: '',
        phone: '',
        agent: '',
        reportTime: '',
        expectedVisitTime: '',
      };

      for (const line of lines) {
        // 键值对格式：关键词：值
        if (line.includes('客户姓名：') || line.includes('客户姓名:')) {
          result.customerName = line.split(/[：:]/)[1]?.trim() || '';
        } else if (line.includes('客户联系方式：') || line.includes('客户联系方式:')) {
          result.phone = line.split(/[：:]/)[1]?.trim().replace(/\*/g, '') || '';
        } else if (line.includes('报备项目：') || line.includes('报备项目:')) {
          const project = line.split(/[：:]/)[1]?.trim() || '';
          result.projectType = project.includes('越秀') ? 'yuexiu' : 'baoli';
        } else if (line.includes('经纪人姓名：') || line.includes('经纪人姓名:')) {
          result.agent = line.split(/[：:]/)[1]?.trim() || '';
        } else if (line.includes('报备提交时间：') || line.includes('报备提交时间:')) {
          result.reportTime = line.split(/[：:]/)[1]?.trim() || '';
        } else if (line.includes('预计到访时间：') || line.includes('预计到访时间:')) {
          result.expectedVisitTime = line.split(/[：:]/)[1]?.trim() || '';
        }
        // 回退：行内含关键词
        else if (line.includes('保利')) {
          result.projectType = 'baoli';
        } else if (line.includes('越秀')) {
          result.projectType = 'yuexiu';
        } else if (line.includes('女士') || line.includes('先生') || line.includes('小姐') || line.includes('太太')) {
          result.customerName = line;
        } else if (/^1[3-9]\d{9}$/.test(line.replace(/\s/g, '').replace(/\*/g, ''))) {
          result.phone = line.replace(/\s/g, '').replace(/\*/g, '');
        } else if (line.includes('经纪人') && !line.includes('姓名')) {
          result.agent = line;
        } else if (line.includes('报备') && line.includes('20')) {
          result.reportTime = line;
        }
      }

      if (!result.customerName && !result.phone) {
        logToBoth('warn', '[千机：步骤3] 剪贴板解析结果不完整，原始内容: ' + text);
        return null;
      }

      return result;
    } catch (error) {
      logToBoth('error', `[千机：步骤3] 解析剪贴板失败: ${error}`);
      return null;
    }
  }

  /**
   * ========== 步骤 4：直接调用报备端填表 ==========
   */
  public async stepJumpToReportApp(): Promise<void> {
    if (!this.customerInfo) {
      logToBoth('warn', '[千机：步骤5] 无客户信息，跳过');
      return;
    }

    const projectType = this.customerInfo.projectType;
    if (projectType === 'baoli') {
      await zbbAutomation.delay(500);
      // 先写数据库（存 phoneLast4 用于后续 OCR 验证）
      await this.stepSaveToDatabase();
      const baoli = BaoliService.getInstance();
      await baoli.execute();
    } else if (projectType === 'yuexiu') {
      logToBoth('info', '[千机：步骤5] 检测到越秀端，暂未实现，请先处理保利端');
    } else {
      logToBoth('warn', '[千机：步骤5] 未识别项目类型，跳过');
    }
  }

  /**
   * ========== 完整流程（千机端 → 复制 → 返回） ==========
   */
  public async startQianjiFlow(): Promise<void> {
    logToBoth('info', '[千机端] 启动千机端自动化流程...');

    try {
      // 步骤1：打开千机
      await this.stepOpenQianji();

      // 步骤2：识别当前界面
      await this.stepRecognizeInterface();

      // 步骤3：查找"报备审核"并收集客户信息（转发流程）
      await this.stepFindAndCollectCustomer();

      // 步骤4：直接调用报备端填表
      await this.stepJumpToReportApp();

      logToBoth('success', '[千机端] ✓ 千机端流程完成');

    } catch (error) {
      logToBoth('error', `[千机端] 流程执行失败: ${error}`);
      throw error;
    }
  }
  /**
   * 步骤4：将客户信息写入数据库
   */
  public async stepSaveToDatabase(): Promise<void> {
    logToBoth('info', '[千机：步骤4] 正在写入数据库...');
    
    try {
      if (!this.customerInfo) {
        logToBoth('warn', '[千机：步骤4] 警告: 没有客户信息可写入');
        return;
      }
      
      // 计算预计到访时间：报备时间 + 24小时
      const reportDate = new Date(this.customerInfo.reportTime);
      reportDate.setHours(reportDate.getHours() + 24);
      const expectedVisitTime = reportDate.toISOString().replace('T', ' ').substring(0, 19);
      
      // 构造数据库记录（字段名需与 insertReport 函数签名匹配：驼峰命名）
      const reportProject = this.customerInfo.projectType === 'yuexiu' ? '越秀' : '保利';
      const copyTime = this.customerInfo.reportTime;
      
      // 从姓名自动判断性别
      const customerName = this.customerInfo.customerName || '';
      let customerGender = '';
      if (customerName.includes('女士') || customerName.includes('小姐') || customerName.includes('太太')) {
        customerGender = '女';
      } else if (customerName.includes('先生')) {
        customerGender = '男';
      }
      
      // 写入数据库（调用 insertReport 的正确签名）
      const reportId = await insertReport(
        {
          customerName: customerName,
          customerGender: customerGender,
          customerPhone: this.customerInfo.phone,
          reportProject: reportProject,
          reportSubmitTime: this.customerInfo.reportTime,
          expectedVisitTime: expectedVisitTime,
          agentName: this.customerInfo.agent,
          agentRemark: '',
        },
        'baoli',  // 千机收集的数据用于保利报备
        JSON.stringify({
          ...this.customerInfo,
          phoneLast4: (this.customerInfo.phone || '').replace(/\*/g, '').slice(-4),
        }),
        copyTime
      );
      
      // 打印写入的数据
      logToBoth('info', `[千机：步骤4] ========== 写入数据库 ==========`);
      logToBoth('info', `[千机：步骤4] 记录ID: ${reportId}`);
      logToBoth('info', `[千机：步骤4] 项目: ${reportProject}`);
      logToBoth('info', `[千机：步骤4] 客户姓名: ${customerName}`);
      logToBoth('info', `[千机：步骤4] 客户性别: ${customerGender || '(未识别)'}`);
      logToBoth('info', `[千机：步骤4] 电话: ${this.customerInfo.phone}`);
      logToBoth('info', `[千机：步骤4] 报备时间: ${this.customerInfo.reportTime}`);
      logToBoth('info', `[千机：步骤4] 预计到访时间: ${expectedVisitTime}`);
      logToBoth('info', `[千机：步骤4] 经纪人: ${this.customerInfo.agent}`);
      logToBoth('info', `[千机：步骤4] 状态: pending`);
      logToBoth('info', `[千机：步骤4] =================================`);
      logToBoth('success', `[千机：步骤4] ✓ 写入数据库成功`);
      
      // 打印流程完成前的状态检查
      logToBoth('info', `[千机端] 检查点1: customerInfo = ${JSON.stringify(this.customerInfo)}`);
      logToBoth('info', `[千机端] 检查点2: projectType = ${this.customerInfo?.projectType}`);
      
    } catch (error) {
      logToBoth('error', `[千机：步骤4] ✗ 写入数据库失败: ${error}`);
      throw error;
    }
  }
  
  /**
   * 启动完整流程（千机端 → 返回 ZBB → 用户粘贴 → 写库 → 自动启动保利端）
   * 注意：此方法已不再调用 stepSaveToDatabase，数据由 home/index.tsx 的 TextInput 检测到粘贴后写入
   */
  public async startFullFlow(): Promise<void> {
    logToBoth('info', '[千机端] ====== 开始完整流程 ======');
    
    try {
      // 步骤1-4：千机端 → 打开 → 识别 → 查找报备审核 → 复制 → 返回
      await this.startQianjiFlow();
      
      logToBoth('info', '[千机端] ====== 请在 ZBB 中粘贴客户信息 ======');
      logToBoth('info', '[千机端] ZBB 将自动解析数据、写入数据库并启动保利端');
      
    } catch (error) {
      logToBoth('error', `[千机端] 完整流程失败: ${error}`);
      throw error;
    }
  }
}

export const qianjiService = QianjiService.getInstance();
