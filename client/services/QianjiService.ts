/**
 * 千机端自动化服务
 * 用途：从千机获取客户信息 → 云和家经纪云小程序报备 → 返回千机上传截图
 */

import { Alert } from 'react-native';
import { zbbAutomation } from '@/native';
import { logToBoth } from './AutomationLogger';
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
    phoneLast4: string;  // 电话末4位
    agent: string;
    reportTime: string;
    expectedVisitTime: string;
    city: string;        // 城市
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

      // ========== 预检查待报备数量（最多 3 次：初始 + 2 次下拉后） ==========
      let pendingCount = '0';
      for (let attempt = 1; attempt <= 3; attempt++) {
        // 第 1 次用初始抓的节点；第 2/3 次需要下拉刷新
        if (attempt > 1) {
          // 下拉刷新：坐标 (540,400)→(540,1500)，300-500ms 随机
          const swipeDuration = 300 + Math.floor(Math.random() * 200);
          logToBoth('info', `[千机：步骤2] 第 ${attempt} 次下拉刷新 (duration=${swipeDuration}ms)...`);
          await zbbAutomation.swipe(540, 400, 540, 1500, swipeDuration);
          // 下拉后等 1000-2000ms 随机
          const interval = 1000 + Math.floor(Math.random() * 1000);
          await zbbAutomation.delay(interval);

          // 重新抓节点（覆盖 this.lastTextNodes）
          this.lastTextNodes = (await zbbAutomation.getAllTextNodes()).filter(node =>
            node.text && node.text.trim().length > 0 && node.centerX > 0 && node.centerY > 0
          );
          logToBoth('info', `[千机：步骤2] 第 ${attempt} 次刷新后节点 (共 ${this.lastTextNodes.length} 个)`);
        }

        // 找 (107, 680) 数字：主匹配 ±5px；fallback 找"报备待审核"(183,575)和"今日报备量"(168,769)之间的纯数字节点
        const pendingNode = this.lastTextNodes.find(n =>
          (Math.abs(n.centerX - 107) < 5 && Math.abs(n.centerY - 680) < 5) ||
          (n.centerY > 575 && n.centerY < 769 && /^\d+$/.test(n.text))
        );
        pendingCount = pendingNode?.text || '0';
        logToBoth('info', `[千机：步骤2] 第 ${attempt} 次检查 待报备数量 = ${pendingCount}`);

        if (pendingCount !== '0') {
          logToBoth('success', `[千机：步骤2] 有待报备客户 (${pendingCount})，继续执行后续步骤`);
          break;
        }
      }

      // 3 次都 0 → Toast 提示 + 按 Home 返回桌面
      if (pendingCount === '0') {
        logToBoth('warn', '[千机：步骤2] 连续 3 次检查待报备数量为 0');
        zbbAutomation.showToast('当前无报备');
        await zbbAutomation.pressHome();
        return;
      }

      // 注：千机端不通过原生树读取客户信息，统一从转发剪贴板获取（步骤3-4）
      
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

      // 客户信息统一由步骤3-4 剪贴板解析后填充到 this.customerInfo
      // 不在此处创建临时变量

      // 5. 判断是否为保利界面
      const isBaoli = textNodes.some(n => n.text && n.text.includes('保利'));
      if (!isBaoli) {
        logToBoth('warn', '[千机：步骤3] 界面无"保利"，超出能力范围，提示用户');
        Alert.alert(
          '提示',
          '小主，这个客户超出了我的能力范围，需要你亲自搞定了！'
        );
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

      // 步骤3-4：读取剪贴板解析全部客户信息（千机端唯一信息来源）
      try {
        const clipboardText = await zbbAutomation.getClipboardText();
        if (clipboardText && clipboardText.trim().length > 0) {
          logToBoth('info', `[千机：步骤3-4] 剪贴板内容: ${clipboardText.substring(0, 100)}...`);
          const parsed = this.parseClipboardText(clipboardText);
          if (parsed) {
            // 用剪贴板解析结果填充 this.customerInfo（千机端唯一信息来源）
            this.customerInfo = { ...this.customerInfo!, ...parsed } as typeof this.customerInfo;
            // 计算 phoneLast4 供后续步骤用
            if (this.customerInfo!.phone) {
              const phoneLast4 = this.customerInfo!.phone.replace(/\*/g, '').slice(-4);
              this.customerInfo = { ...this.customerInfo!, phoneLast4 };
            }
            logToBoth('info', `[千机：步骤3-4] 解析结果: ${this.customerInfo!.customerName} ${this.customerInfo!.phone} ${this.customerInfo!.agent}`);
          }
        } else {
          logToBoth('warn', '[千机：步骤3-4] 剪贴板为空，未获取到客户信息');
        }
      } catch (e: any) {
        logToBoth('error', `[千机：步骤3-4] 读剪贴板失败: ${e?.message || e}`);
      }

      // 步骤3-5：按 Home 键返回桌面
      await zbbAutomation.pressHome();
      await zbbAutomation.delay(1500);

      // 客户信息已由步骤3-4 剪贴板解析填充，无需再合并
      // 注：千机端不写数据库，customerInfo 仅作内存中转给 baoli.executeWithData()

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
    city: string;
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
        city: '',
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
        logToBoth('warn', '[千机：步骤3-4] 剪贴板解析结果不完整，原始内容: ' + text);
        return null;
      }

      return result;
    } catch (error) {
      logToBoth('error', `[千机：步骤3-4] 解析剪贴板失败: ${error}`);
      return null;
    }
  }

  /**
   * ========== 步骤 4：直接调用报备端填表 ==========
   */
  public async stepJumpToReportApp(): Promise<void> {
    if (!this.customerInfo) {
      logToBoth('warn', '[千机：步骤4] 无客户信息，跳过');
      return;
    }

    const projectType = this.customerInfo.projectType;
    if (projectType === 'baoli') {
      await zbbAutomation.delay(500);
      const baoli = BaoliService.getInstance();
      await baoli.executeWithData(this.customerInfo);
    } else if (projectType === 'yuexiu') {
      logToBoth('info', '[千机：步骤4] 检测到越秀端，暂未实现，请先处理保利端');
    } else {
      logToBoth('warn', '[千机：步骤4] 未识别项目类型，跳过');
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
}

export const qianjiService = QianjiService.getInstance();
