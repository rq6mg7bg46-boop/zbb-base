/**
 * 千机端自动化服务
 * 用途：从千机获取客户信息 → 云和家经纪云小程序报备 → 返回千机上传截图
 */

import { Alert, EmitterSubscription } from 'react-native';
import { zbbAutomation, addQianjiMessageListener, removeQianjiMessageListener, QianjiMessagePayload } from '@/native';
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
  openApp: { min: 3000, max: 50000 },  // 开APP3-5 秒
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

// ========== 通知监听配置（双保险：方案 1 NotificationListenerService + 方案 2 Accessibility） ==========

/** 防抖时间：5 分钟内不重复触发千机端流程 */
const QIANJI_TRIGGER_DEBOUNCE_MS = 5 * 60 * 1000;

/** 千机端流程是否启用（默认启用，由用户从 home 页面控制） */
let qianjiAutoTriggerEnabled = true;

/** 触发关键词过滤（任一命中即触发） */
const TRIGGER_KEYWORDS = ['报备', '审核', '待审核', '新增', '客户'];

export class QianjiService {
  private static instance: QianjiService;

  private constructor() {}

  public static getInstance(): QianjiService {
    if (!QianjiService.instance) {
      QianjiService.instance = new QianjiService();
      // 首次创建时自动启动通知监听
      QianjiService.instance.startMonitoring();
    }
    return QianjiService.instance;
  }

  // ========== 通知监听字段 ==========

  /** 监听器订阅句柄 */
  private qianjiMessageSubscription: EmitterSubscription | null = null;

  /** 是否正在监听 */
  private isMonitoring: boolean = false;

  /** 上次触发时间（用于防抖） */
  private lastTriggerTime: number = 0;

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

  // 接龙循环退出原因（testOnlyQianjiFlow 用）：null=继续 / 'no_pending'=无待报备 / 'no_baoli'=非保利
  private lastExitReason: 'no_pending' | 'no_baoli' | null = null;

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
        // 接龙循环退出标志：testOnlyQianjiFlow 读到会返回 'no_pending'
        this.lastExitReason = 'no_pending';
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
        // 用 Toast 而非 Alert：步骤3 时千机已覆盖前台，ZBB 在后台，
        // Alert.alert 依赖调用方 Activity 在前台才渲染，会被千机盖住 → 弹不出
        // Toast 是系统级浮层，前后台都能显示
        zbbAutomation.showToast('⚠️ 小主，这个客户超出了我的能力范围，需要你亲自搞定！');
        // 脉冲震动 500ms：项目无 vibrate(duration) 短震 API，
        // 只有 startPulseVibration(脉冲循环) + stopVibration，
        // start 后 500ms stop = 嗡一下（第一个 300ms 震完 + 200ms 停顿）
        // AutomationModule.kt:1413 直接 vibrate(pattern,0) 替换模式，安全重入
        try {
          await zbbAutomation.startPulseVibration();
          await zbbAutomation.delay(500);
          await zbbAutomation.stopVibration();
        } catch {
          // 震动失败不影响主流程
        }
        // 接龙循环退出标志：testOnlyQianjiFlow 读到会返回 'no_baoli'
        // 老板要求：不要回桌面（让用户手动处理其他项目客户），所以这里不调 pressHome
        this.lastExitReason = 'no_baoli';
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

      // 步骤3-4：从原生树节点解析客户信息
      // 注：因 ZBB 读不到千机的剪贴板（系统权限隔离），
      // 改用 this.lastTextNodes（步骤2 抓的"报备审核"页节点），
      // 先调 assembleKeyValueLines() 把"key:" + "value" 拼成 "key:value" 单行，
      // 再调 parseClipboardText() 解析
      const nodeText = this.assembleKeyValueLines(this.lastTextNodes);
      logToBoth('info', `[千机：步骤3-4] 节点拼装后(${this.lastTextNodes.length}个原始节点):\n${nodeText.substring(0, 800)}`);
      if (nodeText.trim()) {
        const parsed = this.parseClipboardText(nodeText);
        if (parsed) {
          this.customerInfo = { ...this.customerInfo, ...parsed } as typeof this.customerInfo;
          if (this.customerInfo!.phone) {
            const phoneLast4 = this.customerInfo!.phone.replace(/\*/g, '').slice(-4);
            this.customerInfo = { ...this.customerInfo!, phoneLast4 };
          }
          logToBoth('info', `[千机：步骤3-4] 解析结果: 客户=${this.customerInfo!.customerName || '(空)'} 电话=${this.customerInfo!.phone || '(空)'} 经纪人=${this.customerInfo!.agent || '(空)'} 城市=${this.customerInfo!.city || '(空)'} 报备时间=${this.customerInfo!.reportTime || '(空)'}`);
        } else {
          logToBoth('warn', '[千机：步骤3-4] 节点解析无结果（格式不匹配）');
        }
      } else {
        logToBoth('warn', '[千机：步骤3-4] 节点为空，无法解析');
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
        // 兼容两套 key：旧（客户联系方式/经纪人姓名/报备提交时间）+ 新（联系方式/经纪人/报备提交/售卖城市）
        if (line.includes('客户姓名：') || line.includes('客户姓名:')) {
          result.customerName = line.split(/[：:]/)[1]?.trim() || '';
        } else if (line.includes('客户联系方式：') || line.includes('客户联系方式:')) {
          result.phone = line.split(/[：:]/)[1]?.trim().replace(/\*/g, '') || '';
        } else if (!line.includes('客户姓名') && (line.includes('联系方式：') || line.includes('联系方式:'))) {
          // 2026-06-20 千机"报备审核"页节点格式：key 名为"联系方式"（旧叫"客户联系方式"）
          result.phone = line.split(/[：:]/)[1]?.trim().replace(/\*/g, '') || '';
        } else if (line.includes('报备项目：') || line.includes('报备项目:')) {
          const project = line.split(/[：:]/)[1]?.trim() || '';
          result.projectType = project.includes('越秀') ? 'yuexiu' : 'baoli';
        } else if (line.includes('经纪人姓名：') || line.includes('经纪人姓名:')) {
          result.agent = line.split(/[：:]/)[1]?.trim() || '';
        } else if (!line.includes('经纪人姓名') && (line.includes('经纪人：') || line.includes('经纪人:'))) {
          // 2026-06-20 千机"报备审核"页节点格式：key 名为"经纪人"（旧叫"经纪人姓名"）
          // 注意：value 可能含"加盟·李宁苹 16603992551"（姓名+电话拼一起），整体作为 agent
          result.agent = line.split(/[：:]/)[1]?.trim() || '';
        } else if (line.includes('报备提交时间：') || line.includes('报备提交时间:')) {
          result.reportTime = line.split(/[：:]/)[1]?.trim() || '';
        } else if (!line.includes('报备提交时间') && (line.includes('报备提交：') || line.includes('报备提交:'))) {
          // 2026-06-20 千机"报备审核"页节点格式：key 名为"报备提交"（旧叫"报备提交时间"）
          result.reportTime = line.split(/[：:]/)[1]?.trim() || '';
        } else if (line.includes('预计到访时间：') || line.includes('预计到访时间:')) {
          result.expectedVisitTime = line.split(/[：:]/)[1]?.trim() || '';
        } else if (line.includes('售卖城市：') || line.includes('售卖城市:')) {
          // 2026-06-20 千机"报备审核"页节点格式：新加"售卖城市" key
          result.city = line.split(/[：:]/)[1]?.trim() || '';
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
        logToBoth('warn', '[千机：步骤3-4] 解析结果不完整，原始内容: ' + text);
        return null;
      }

      return result;
    } catch (error) {
      logToBoth('error', `[千机：步骤3-4] 解析剪贴板失败: ${error}`);
      return null;
    }
  }

  /**
   * 2026-06-20 老板拍板：千机"报备审核"页节点格式是
   *   "key:" 换行 "value"（两个独立节点），
   * 不是剪贴板的 "key：value" 单行格式。
   * 把"key:" 后面紧跟的 value 节点拼成 "key:value" 单行，
   * 复用 parseClipboardText() 的解析规则。
   *
   * 例：
   *   输入: ['客户姓名:', '代先生', '联系方式:', '*******1805', ...]
   *   输出: ['客户姓名:代先生', '联系方式:*******1805', ...]
   */
  private assembleKeyValueLines(nodes: { text: string }[]): string {
    const lines: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const text = (nodes[i].text || '').trim();
      if (!text) continue;
      // 这一行以 : 或 ： 结尾，且下一行是 value（不是 key，也不是空，不是标点）
      if (/[：:]\s*$/.test(text) && i + 1 < nodes.length) {
        const nextText = (nodes[i + 1].text || '').trim();
        if (nextText && !/^[：:]\s*$/.test(nextText)) {
          lines.push(`${text}${nextText}`);
          i++;  // 跳过下一行
          continue;
        }
      }
      lines.push(text);
    }
    return lines.join('\n');
  }

  /**
   * ========== 步骤 4：直接调用报备端填表 ==========
   * 2026-06-20 老板拍板：不再以 !this.customerInfo 作为跳过依据，
   * 只要识别到"保利"并复制成功就直接调保利（保利端会自行处理空字段）
   */
  public async stepJumpToReportApp(): Promise<void> {
    logToBoth('info', '[千机：步骤4] 复制成功，启动保利端...');
    logToBoth('info', `[千机：步骤4] customerInfo: ${this.customerInfo ? JSON.stringify(this.customerInfo).substring(0, 200) : '(null)'}`);

    await zbbAutomation.delay(500);
    const baoli = BaoliService.getInstance();
    // 即使 customerInfo 解析失败/为空也传过去，保利端内部用 || '' 兜底
    await baoli.executeWithData(this.customerInfo);
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
   * ========== 接龙专用：跑千机步骤 1+2+3，不触发保利 ==========
   *
   * 用于保利第二轮成功后自动接龙下一组客户：
   * - handleSuccessCase(2) 末尾调本方法
   * - 返回 'no_pending' 或 'no_baoli' 时循环结束
   * - 返回 'has_customer' 时外层调 baoliService.execute() 跑下一组
   *
   * 内部用 this.lastExitReason 标志区分退出原因：
   * - step2 待报备=0 → lastExitReason='no_pending'（已 Toast + pressHome）
   * - step3 没保利 → lastExitReason='no_baoli'（已 Toast + 震动 + 不回桌面）
   *
   * 注意：不调 stepJumpToReportApp()，否则会无限循环
   */
  public async testOnlyQianjiFlow(): Promise<'has_customer' | 'no_pending' | 'no_baoli'> {
    this.lastExitReason = null;
    logToBoth('info', '[千机：接龙] 启动千机检测（不触发保利）...');
    try {
      await this.stepOpenQianji();
      await this.stepRecognizeInterface();
      // step2 内部若发现待报备=0，会设 lastExitReason='no_pending' 并 return
      if (this.lastExitReason === 'no_pending') {
        logToBoth('success', '[千机：接龙] 无待报备客户，循环结束');
        return 'no_pending';
      }

      await this.stepFindAndCollectCustomer();
      // step3 内部若发现非保利，会设 lastExitReason='no_baoli' 并 return
      if (this.lastExitReason === 'no_baoli') {
        logToBoth('success', '[千机：接龙] 无保利客户，循环结束');
        return 'no_baoli';
      }

      logToBoth('success', '[千机：接龙] ✓ 找到保利客户，可触发保利');
      return 'has_customer';
    } catch (error) {
      logToBoth('error', `[千机：接龙] 失败: ${error}`);
      throw error;
    }
  }

  // ========== 通知监听方法（双保险） ==========

  /**
   * 启动千机消息监听
   * 监听 QianjiMessageReceived 事件（来自方案 1 NotificationListenerService 或 方案 2 AccessibilityService）
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      logToBoth('info', '[千机监听] 已在运行，跳过启动');
      return;
    }

    this.qianjiMessageSubscription = addQianjiMessageListener((payload) => {
      this.handleQianjiMessage(payload);
    });

    if (this.qianjiMessageSubscription) {
      this.isMonitoring = true;
      logToBoth('success', '[千机监听] ✓ 已启动监听千机消息（方案 1+2 双保险）');
    } else {
      logToBoth('error', '[千机监听] ✗ 启动监听失败（RN 模块未初始化）');
    }
  }

  /**
   * 停止千机消息监听
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) return;
    removeQianjiMessageListener(this.qianjiMessageSubscription);
    this.qianjiMessageSubscription = null;
    this.isMonitoring = false;
    logToBoth('info', '[千机监听] 已停止监听');
  }

  /**
   * 设置是否自动触发千机端流程（由用户在 home 页面控制）
   */
  public setAutoTrigger(enabled: boolean): void {
    qianjiAutoTriggerEnabled = enabled;
    logToBoth('info', `[千机监听] 自动触发已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 处理千机消息（双保险入口）
   * 防抖：5 分钟内不重复触发
   * 关键词过滤：标题/正文/子标题包含"报备"/"客户"/"咨询"等关键词
   */
  private async handleQianjiMessage(payload: QianjiMessagePayload): Promise<void> {
    // 0. 校验：必须来自千机
    if (payload.package !== APP_PACKAGES.QIANJI) {
      return;
    }

    // 1. 用户开关
    if (!qianjiAutoTriggerEnabled) {
      logToBoth('info', `[千机监听] 自动触发已禁用，跳过 (来源: ${payload.source})`);
      return;
    }

    // 2. 关键词过滤
    const text = `${payload.title} ${payload.text} ${payload.subText} ${payload.bigText}`.toLowerCase();
    const hitKeyword = TRIGGER_KEYWORDS.find((kw) => text.includes(kw.toLowerCase()));
    if (!hitKeyword) {
      logToBoth('info', `[千机监听] 未命中关键词，跳过 (来源: ${payload.source})`);
      return;
    }

    // 3. 防抖：5 分钟内不重复触发
    const now = Date.now();
    if (now - this.lastTriggerTime < QIANJI_TRIGGER_DEBOUNCE_MS) {
      const remaining = Math.round((QIANJI_TRIGGER_DEBOUNCE_MS - (now - this.lastTriggerTime)) / 1000);
      logToBoth('info', `[千机监听] 防抖中，${remaining}s 后可再次触发 (来源: ${payload.source})`);
      return;
    }

    this.lastTriggerTime = now;

    logToBoth('success', `[千机监听] 🔔 千机收到消息（来源: ${payload.source}, 关键词: ${hitKeyword}）`);
    logToBoth('info', `[千机监听] title: ${payload.title}`);
    logToBoth('info', `[千机监听] text: ${payload.text}`);
    logToBoth('info', `[千机监听] 5 秒后自动启动千机端流程...`);

    // 4. Toast 提示用户
    try {
      Alert.alert(
        '🔔 千机收到消息',
        `来源: ${payload.source === 'notification' ? '通知监听' : '无障碍'}\n关键词: ${hitKeyword}\n\n5 秒后自动启动千机端流程...`,
        [{ text: '知道了' }]
      );
    } catch (e) {
      // Alert 在某些 RN 版本上不可用，忽略
    }

    // 5. 5 秒倒计时后启动千机端流程
    await zbbAutomation.delay(5000);
    try {
      await this.startQianjiFlow();
    } catch (error) {
      logToBoth('error', `[千机监听] 自动启动千机端失败: ${error}`);
    }
  }
}

export const qianjiService = QianjiService.getInstance();
