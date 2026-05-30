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
   * ========== 步骤 3：查找"报备审核"并收集客户信息 ==========
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

      // 3. 仍未找到，退出
      if (!baobeiNode) {
        logToBoth('warn', '[千机：步骤3] ✗ 未找到"报备审核"，结束步骤');
        return;
      }

      logToBoth('info', `[千机：步骤3] 找到"报备审核" @ (${baobeiNode.centerX}, ${baobeiNode.centerY})`);

      // 4. 打印所有节点看看格式
      logToBoth('info', `[千机：步骤3] ====== 步骤2界面节点 (共${textNodes.length}个) ======`);
      textNodes.forEach((node: any, index: number) => {
        if (node.text && node.text.trim().length > 0) {
          logToBoth('info', `[千机：步骤3] 节点${index}: "${node.text}" @ (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`);
        }
      });
      logToBoth('info', `[千机：步骤3] ==============================`);

      // 5. 坐标偏移法抓取同行数据（如果界面出现"保利"）
      // 初始化客户信息结构
      const customerInfo: any = {
        projectType: 'baoli',
        customerName: '',
        phone: '',
        agent: '',
        reportTime: '',
        expectedVisitTime: '',
        city: '',
      };
      // 判断是否为保利界面
      const isBaoli = textNodes.some(n => n.text && n.text.includes('保利'));
      if (isBaoli) {
        logToBoth('info', '[千机：步骤3] 检测到"保利"，使用坐标偏移法抓取同行数据');

        // 同行数据抓取：通过标签坐标 + 偏移量获取同行数据
        // 偏移量：客户姓名+180，经纪人+370，售卖城市+160，报备提交+322
        const findValueByOffset = (labelText: string, offsetX: number): string => {
          const labelNode = textNodes.find(n => n.text === labelText);
          if (!labelNode) return '';
          const targetX = labelNode.centerX + offsetX;
          const targetY = labelNode.centerY;
          // 找同行(y接近)且x>=目标x的节点，取最靠近的一个
          const candidates = textNodes.filter(n =>
            n.text &&
            Math.abs(n.centerY - targetY) < 50 &&  // 同行（y误差<50）
            n.centerX >= targetX - 50               // 在目标x附近
          );
          if (candidates.length === 0) return '';
          // 取x最小的（即最靠近标签的）
          candidates.sort((a, b) => a.centerX - b.centerX);
          return candidates[0].text;
        };

        customerInfo.customerName = findValueByOffset('客户姓名:', 180);
        customerInfo.agent = findValueByOffset('经纪人:', 370);
        customerInfo.reportTime = findValueByOffset('报备提交:', 322);

        // 售卖城市单独处理：标签文字是"售卖城市:"但数据是"郑州"
        const cityLabelNode = textNodes.find(n => n.text === '售卖城市:');
        if (cityLabelNode) {
          const cityTargetX = cityLabelNode.centerX + 160;
          const cityTargetY = cityLabelNode.centerY;
          const cityCandidates = textNodes.filter(n =>
            n.text && n.text !== '售卖城市:' &&
            Math.abs(n.centerY - cityTargetY) < 50 &&
            n.centerX >= cityTargetX - 50
          );
          if (cityCandidates.length > 0) {
            cityCandidates.sort((a, b) => a.centerX - b.centerX);
            customerInfo.city = cityCandidates[0].text;
          }
        }

        // 报备时间用于判断项目类型（已经从上面获取了）
        customerInfo.projectType = 'baoli';

        logToBoth('info', `[千机：步骤3] 坐标抓取结果: 客户=${customerInfo.customerName} 经纪人=${customerInfo.agent} 城市=${customerInfo.city || '(未取到)'} 报备时间=${customerInfo.reportTime}`);
      } else {
        logToBoth('warn', '[千机：步骤3] 界面无"保利"，跳过坐标抓取');
      }

// 方式B：长按含*节点触发复制菜单，读剪贴板获取脱敏号
      const phoneRegex = /(^1[3-9]\d{2}\*+\d{4}$)|(^\*+\d{4}$)/;
      const phoneNode = textNodes.find(n =>
        n.text && phoneRegex.test(n.text)
      );
      if (phoneNode) {
        logToBoth('info', `[千机：步骤3] 长按脱敏电话节点 @ (${phoneNode.centerX}, ${phoneNode.centerY}): ${phoneNode.text}`);
        await zbbAutomation.longPress(phoneNode.centerX, phoneNode.centerY, 1500);
        await zbbAutomation.delay(1000);

        // 读剪贴板
        try {
          const clipboardText = await zbbAutomation.getClipboardText();
          if (clipboardText && (phoneRegex.test(clipboardText) || /^1[3-9]\d{9}$/.test(clipboardText.replace(/\*/g, '')))) {
            customerInfo.phone = clipboardText;
            logToBoth('info', `[千机：步骤3] 剪贴板获取电话: ${customerInfo.phone}`);
          } else {
            logToBoth('warn', `[千机：步骤3] 剪贴板内容非预期: ${clipboardText}`);
          }
        } catch (e: any) {
          logToBoth('warn', `[千机：步骤3] 读剪贴板失败: ${e.message}`);
        }
      } else {
        logToBoth('warn', `[千机：步骤3] 未找到脱敏电话节点`);
      }

      // 7. 保存到 this.customerInfo
      this.customerInfo = customerInfo;

      if (this.customerInfo) {
        logToBoth('info', `========== 客户信息 ==========`);
        logToBoth('info', `项目类型: ${this.customerInfo.projectType}`);
        logToBoth('info', `客户姓名: ${this.customerInfo.customerName}`);
        logToBoth('info', `电话号码: ${this.customerInfo.phone}`);
        logToBoth('info', `经纪人: ${this.customerInfo.agent}`);
        logToBoth('info', `报备时间: ${this.customerInfo.reportTime}`);
        logToBoth('info', `================================`);
        logToBoth('success', '[千机：步骤3] ✓ 客户信息收集完成');
      } else {
        logToBoth('error', '[千机：步骤3] ✗ 未能收集到客户信息');
      }

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
   * ========== 步骤 4：将客户信息写入剪贴板 ==========
   */
  public async stepWriteClipboard(): Promise<void> {
    logToBoth('info', '[千机：步骤4] 写入客户信息到剪贴板...');

    if (!this.customerInfo) {
      logToBoth('warn', '[千机：步骤4] 无客户信息，跳过');
      return;
    }

    // 构造键值对格式（与 parseClipboardText 解析逻辑匹配）
    const lines = [
      `客户姓名：${this.customerInfo.customerName}`,
      `客户联系方式：${this.customerInfo.phone}`,
      `经纪人：${this.customerInfo.agent}`,
      `报备提交：${this.customerInfo.reportTime}`,
    ];
    const clipboardText = lines.join('\n');

    try {
      await zbbAutomation.setClipboardText(clipboardText);
      logToBoth('success', `[千机：步骤4] ✓ 剪贴板写入成功`);
      logToBoth('info', `[千机：步骤4] 内容:\n${clipboardText}`);
    } catch (error: any) {
      logToBoth('error', `[千机：步骤4] ✗ 剪贴板写入失败: ${error.message}`);
    }
  }

  /**
   * ========== 步骤 5：按 Home 返回 ZBB ==========
   */
  public async stepReturnToZBB(): Promise<void> {
    logToBoth('info', '[千机：步骤5] 按 Home 键返回桌面...');
    await zbbAutomation.pressHomeKey();
    await zbbAutomation.delay(1500);
    logToBoth('success', '[千机：步骤5] ✓ 已返回桌面，请在 ZBB 中粘贴客户信息');
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

      // 步骤3：查找"报备审核"并收集客户信息
      await this.stepFindAndCollectCustomer();

      // 步骤4：写入剪贴板
      await this.stepWriteClipboard();

      // 步骤5：按 Home 返回 ZBB
      await this.stepReturnToZBB();

      logToBoth('success', '[千机端] ✓ 千机端流程完成，请在 ZBB 中粘贴客户信息');

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
        JSON.stringify(this.customerInfo),
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
