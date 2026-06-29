/**
 * 保利端自动化服务
 * 版本: v1.1
 * 
 * 独立于 NativeAutomationService，使用预置测试数据
 * 流程：打开企业微信 → 点击工作台 → 进入云和家经纪云 → 填写报备表单
 */

import { DeviceEventEmitter } from 'react-native';
import { zbbAutomation, addScreenshotConfirmedListener, removeStopListener } from '../native';
import { QianjiService } from './QianjiService';
import { runWorkflow, waitForUserGo } from '@/engine';
import { baoliLaunchWorkflow, baoliFillFormWorkflow, baoliDetectResultWorkflow, type BaoliContext } from '@/workflows/baoli';
// W6 异步派发（event bus 订阅）
import { onEvent, QIANJI_EVENTS, BAOLI_EVENTS, emitEvent, type ZbbEventSubscription } from '@/events';
// v3 全项目坐标规范化（按机型分支）
import { getTapCoord, getSwipeCoord } from '@/utils/deviceModel';
// 注：logToBoth 在本文件 L131 内部定义（W4 阶段保留老设计，不引用外部 AutomationLogger）

const APP_PACKAGES = {
  WECHAT: 'com.tencent.wework',  // 企业微信
  WECHAT_MAIN_ACTIVITY: 'com.tencent.wework.ui.index.WwMainActivity',  // 企业微信主界面（完整路径）
};

// 预设测试数据（execute() 测试用，不读数据库）
const PRESET_CLIPBOARD = `公司名称：贝壳
客户姓名：谢女士
客户性别：女
客户联系方式：178****9737
报备项目：保利缦城和颂
物业类型：住宅
报备提交时间：2026-06-06 20:56:09
预计到访时间：2026-06-07 20:56:09
经纪人姓名：加盟·曹嘉鑫 15037100857
经纪人备注：`;

// 延迟配置
const DELAY_CONFIG = {
  openApp: { min: 5000, max: 10000 },
  other: { min: 1000, max: 2000 },
  notice: { min: 3000, max: 4000 },
};

// 获取随机延迟时间
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

// 预置测试客户数据（注释保留，后续调试用）
// const PRESET_BAOLI_CUSTOMER = {
//   customerName: '刘女士',
//   customerGender: '女',
//   customerPhone: '15300241770',
//   reportProject: '郑州市三村杓袁7号地项目-保利山水和颂',
//   propertyType: '住宅',
//   reportSubmitTime: new Date().toLocaleString('zh-CN'),
//   expectedVisitTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('zh-CN'),
//   agentName: '张杰',
//   agentRemark: '',
// };

// ========== P+ 拟人化工具函数（2026-06-15 老板方案 P3：偏移±5px / 概率15%）==========

// 1. 不规则点击坐标（均匀分布 ±5px）
async function humanTap(x: number, y: number): Promise<void> {
  // P3: 均匀分布 [-5, +5]，比原 Gaussian ±15px 收窄 3 倍
  const dx = Math.round(Math.random() * 10 - 5);
  const dy = Math.round(Math.random() * 10 - 5);
  logToBoth('info', `[P+ humanTap] (${x},${y}) + (${dx},${dy})`);
  void zbbAutomation.tap(x + dx, y + dy);  // 工具函数内部用 void 避开 replace_all
}

// 2. 滑动速度曲线（ease-in-out 10 段）
async function humanSwipe(x1: number, y1: number, x2: number, y2: number, duration: number): Promise<void> {
  const steps = 10;
  const stepDelay = Math.max(20, Math.floor(duration / steps));
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    // ease-in-out cubic
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    const x = Math.round(x1 + (x2 - x1) * eased);
    const y = Math.round(y1 + (y2 - y1) * eased);
    void zbbAutomation.tap(x, y);  // 工具函数内部用 void 避开 replace_all
    if (i < steps) await zbbAutomation.delay(stepDelay);
  }
}

// 3. 随机停顿（Poisson 分布，P3 概率 15% → 8% 加速）
async function maybePause(probability: number = 0.08): Promise<void> {
  if (Math.random() < probability) {
    // Poisson 分布近似：-ln(1-u) * mean
    const mean = 2.0;
    const u = Math.random();
    const pause = Math.round(-Math.log(1 - u) * mean * 1000);
    const clampedPause = Math.max(500, Math.min(3000, pause));
    logToBoth('info', `[P+ 随机停顿] ${clampedPause}ms`);
    await zbbAutomation.delay(clampedPause);
  }
}

// 4. 页面停留时长（Gamma 分布替代均匀分布）
function pGammaDelay(min: number, max: number): number {
  // 简化 Gamma（α=2, β=1）：均值为 min+max/2，方差较小让中间值更集中
  const mean = (min + max) / 2;
  const variance = (max - min) / 4;
  const u1 = Math.max(0.0001, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const gamma = Math.round(mean + z * variance);
  return Math.max(min, Math.min(max, gamma));
}

// 5. 滚动 bounce（overshoot + 回弹，模拟手指惯性）
async function humanSwipeWithBounce(x1: number, y1: number, x2: number, y2: number, duration: number): Promise<void> {
  // 多滑 20px, 30px（手指惯性 overshoot）
  await zbbAutomation.swipe(x1, y1, x2 + 20, y2 - 30, duration);
  await zbbAutomation.delay(200);
  // 回弹 20px, 30px
  await zbbAutomation.swipe(x2 + 20, y2 - 30, x2, y2, 300);
}

// ========== P+ 工具函数结束 ==========

// 辅助函数：输出到 Metro Console
function logToBoth(level: 'info' | 'success' | 'warn' | 'error', message: string) {
  console.log('[' + level.toUpperCase() + '] ' + message);
}

// 辅助函数：根据姓名判断性别
function getGenderByName(name: string): string {
  if (!name) return '';
  if (/[女士|小姐|太太|女士]$/.test(name)) return '女';
  if (/先生$/.test(name)) return '男';
  return '';
}

// 辅助函数：生成完整客户信息记录
function generateFullRecord(c: {
  company: string;
  name: string;
  phone: string;
  project: string;
  agent?: string;
  reportTime?: string;
  expectedVisitTime?: string;
}): string {
  const gender = getGenderByName(c.name);
  return '公司名称：' + c.company + '\n客户姓名：' + c.name + '\n客户性别：' + gender + '\n客户联系方式：' + c.phone + '\n报备项目：' + c.project + '\n物业类型：住宅\n报备提交时间：' + (c.reportTime || '') + '\n预计到访时间：' + (c.expectedVisitTime || '') + '\n经纪人姓名：' + (c.agent || '') + '\n经纪人备注：\u2019';
}

/**
 * 保利端自动化服务类
 */
class BaoliService {
  private static instance: BaoliService;
  private isRunning: boolean = false;
  // 2026-06-21 方案B：内存累计数（替代 DB 查询，避免 NPE；后期上方案C 替换为 DB）
  // 限制：app 重启清零（老板接受——每日零点是自然重置点）
  private todayBaoliCount: number = 0;
  // W6 异步派发：event 订阅句柄
  private qianjiDataReadySub: ZbbEventSubscription | null = null;
  private qianjiHasCustomerSub: ZbbEventSubscription | null = null;  // W8

  static getInstance(): BaoliService {
    if (!BaoliService.instance) {
      BaoliService.instance = new BaoliService();
      BaoliService.instance.initEventSubscriptions();
    }
    return BaoliService.instance;
  }

  /**
   * W6 异步派发：订阅 ON_QIANJI_DATA_READY 事件
   * 千机 Q5 dispatch 触发后，自动调 startBaoliLaunchV2
   * 老同步 path（QianjiService.startQianjiFlow 直接调 baoliService.execute()）保留 1 周对比
   */
  private initEventSubscriptions(): void {
    this.qianjiDataReadySub = onEvent(QIANJI_EVENTS.DATA_READY, (payload) => {
      logToBoth('info', '[V2 Event] 收到 ON_QIANJI_DATA_READY');
      this.startBaoliLaunchV2().catch((err) => {
        logToBoth('error', '[V2 Event] startBaoliLaunchV2 failed: ' + err);
      });
    });

    // W8 老板拍板 2026-06-28：千机 Q7 完成后接龙检测到下一个客户 → 保利端启动下一轮
    this.qianjiHasCustomerSub = onEvent(QIANJI_EVENTS.HAS_CUSTOMER, (payload) => {
      logToBoth('info', '[V2 Event] W8：收到 ON_QIANJI_HAS_CUSTOMER（来源: ' + (payload?.source ?? 'unknown') + '），启动下一轮报备...');
      this.startBaoliLaunchV2().catch((err) => {
        logToBoth('error', '[V2 Event] W8：startBaoliLaunchV2 failed: ' + err);
      });
    });
  }

  /**
   * 2026-06-21 方案B：暴露内存累计数给首页 mount 时同步读初值
   */
  public getTodayBaoliCount(): number {
    return this.todayBaoliCount;
  }

  /**
   * 查找界面文字节点
   */
  private async findNodeByText(text: string, retries: number = 3): Promise<any | null> {
    for (let i = 0; i < retries; i++) {
      const nodes = await zbbAutomation.getAllTextNodes();
      const found = nodes?.find((n: any) => n.text && n.text.includes(text));
      if (found) return found;
      if (i < retries - 1) {
        const wait = pGammaDelay(800, 1500);
        logToBoth('warn', `[findNodeByText] "${text}" 未找到，重试 (${i + 1}/${retries - 1})，等 ${wait}ms`);
        await zbbAutomation.delay(wait);
      }
    }
    logToBoth('error', `[findNodeByText] "${text}" 重试 ${retries} 次后仍未找到`);
    return null;
  }

  /**
   * 查找精确匹配的文字节点
   */
  private async findExactNode(text: string, retries: number = 3): Promise<any | null> {
    for (let i = 0; i < retries; i++) {
      const nodes = await zbbAutomation.getAllTextNodes();
      const found = nodes?.find((n: any) => n.text === text);
      if (found) return found;
      if (i < retries - 1) {
        const wait = pGammaDelay(800, 1500);
        logToBoth('warn', `[findExactNode] "${text}" 未找到，重试 (${i + 1}/${retries - 1})，等 ${wait}ms`);
        await zbbAutomation.delay(wait);
      }
    }
    logToBoth('error', `[findExactNode] "${text}" 重试 ${retries} 次后仍未找到`);
    return null;
  }

  /**
   * 打印当前界面所有文字节点
   */
  private async printScreenText(): Promise<any[]> {
    const nodes = await zbbAutomation.getAllTextNodes();
    if (nodes && nodes.length > 0) {
      logToBoth('info', '[保利端] 界面共 ' + nodes.length + ' 个文字节点:');
      nodes.forEach((node: any, index: number) => {
        if (index < 30) {
          logToBoth('info', '  ' + (index + 1) + '. "' + node.text + '" @ (' + node.centerX + ', ' + node.centerY + ')');
        }
      });
      if (nodes.length > 30) {
        logToBoth('info', '  ... 还有 ' + (nodes.length - 30) + ' 个节点');
      }
    }
    return nodes || [];
  }

  // ============================================================
  // V2 接入（v2 设计文档 §5.5 + W4 老板拍板）
  // 老 execute() 已删（W8 C2）
  // 新方法用 runWorkflow 跑 P1-P7 启动段

  /**
   * buildBaoliContext() - 构造 BaoliContext 给 runWorkflow 用
   * 关键：ctx.baoliService = this（step 调 this.findNodeByText 等）
   * W6 类型收紧：this 改为 BaoliService（现在 this 类型推断为单例）
   */
  private buildBaoliContext(
    round: number = 1,
    projectName: string = '郑州市三村杓袁7号地项目-保利缦城和颂[郑州保利和颂]'
  ): BaoliContext {
    return {
      data: { workflowName: 'baoli' },
      stepIndex: 0,
      state: 'idle',
      lastExitReason: null,
      round,
      projectName,
      pasteNode: null,
      formNodes: [],
      companyName: '',
      customerName: '',
      customerGender: '',
      customerPhone: '',
      reportProject: '',
      propertyType: '',
      reportTime: '',
      expectedVisitTime: '',
      agentName: '',
      formFilled: false,
      // W9 detectResult V2 化：P16 检测初始状态
      detectState: 'pending',
      detectRetryCount: 0,
      detectStartTime: 0,
      detectRound: (round as 1 | 2),
      baoliService: this,
      log: (level, msg) => logToBoth(level, msg),
      waitForGo: (reason, hint) => waitForUserGo(reason, hint),
    };
  }

  /**
   * startBaoliLaunchV2() - V2 版本，跑 baoliLaunchWorkflow（P1-P7 启动段）
   * 老 execute() 保留为 fallback（v1.6.4 并行 1 周对比）
   * V2 启动段成功后走 V2 填表（baoliFillFormWorkflow）+ 老 detectResult
   */
  async startBaoliLaunchV2(): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }

    this.isRunning = true;

    try {
      // V2 启动段：P1-P7 走 baoliLaunchWorkflow
      const ctx = this.buildBaoliContext();
      const launchResult = await runWorkflow(baoliLaunchWorkflow, ctx);

      if (!launchResult.ok) {
        logToBoth('warn', '[V2] 启动段未跑完，skip fillForm + detectResult');
        return { success: false, error: 'v2 启动段失败' };
      }

      // V2 启动段成功后，V2 填表 P8-P15（1 轮）
      const fillResult = await this.startBaoliFillFormV2(1);
      if (!fillResult.success) {
        return { success: false, error: 'v2 填表失败' };
      }

      // V2 填表后走 baoliDetectResultWorkflow + dispatch（V9 V2 化）
      await this.detectResultV2();

      logToBoth('success', '========================================');
      logToBoth('success', '       保利端流程全部完成！');
      logToBoth('success', '========================================');
      return { success: true };
    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', '       保利端 V2 流程失败: ' + error);
      logToBoth('error', '========================================');
      return { success: false, error: String(error) };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * startBaoliFillFormV2() - V2 版本，跑 baoliFillFormWorkflow（1 轮 P8-P15）
   * 老 fillForm() 保留为 fallback
   * 跑完一轮：BaoliService 决定是否跑第 2 轮（老 handleSecondRound）
   */
  async startBaoliFillFormV2(
    round: number = 1,
    projectName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const ctx = this.buildBaoliContext(round, projectName);
    const result = await runWorkflow(baoliFillFormWorkflow, ctx);

    if (!result.ok) {
      logToBoth('warn', `[V2] 第 ${round} 轮填表未跑完，skip`);
      return { success: false, error: `v2 填表第 ${round} 轮失败` };
    }
    return { success: true };
  }

  /**
   * V2 detectResult（W9 V2 化）：跑 baoliDetectResultWorkflow + dispatch
   * - 'repeat' → handleRepeatCase()
   * - 'success' → handleSuccessCase(round)
   * - 'timeout' → 仅 log（流程结束）
   * 替代：老 this.detectResult(round)（W9 阶段删除）
   */
  private async detectResultV2(round: number = 1): Promise<void> {
    logToBoth('info', `[P16 V2] 检测报备结果（第${round}轮）...`);
    const ctx = this.buildBaoliContext(round);
    ctx.detectState = 'pending';
    ctx.detectRetryCount = 0;
    ctx.detectStartTime = Date.now();
    ctx.detectRound = (round === 2 ? 2 : 1) as 1 | 2;
    const result = await runWorkflow(baoliDetectResultWorkflow, ctx);
    if (!result.ok) {
      logToBoth('warn', '[P16 V2] workflow 未跑完');
      return;
    }
    switch (ctx.detectState as string) {
      case 'repeat':
        logToBoth('warn', '[P16 V2] 情况1：疑似重号 → handleRepeatCase()');
        await this.handleRepeatCase();
        break;
      case 'success':
        logToBoth('success', `[P16 V2] 情况2：报备成功 → handleSuccessCase(${round})`);
        await this.handleSuccessCase(round);
        break;
      case 'timeout':
        logToBoth('warn', '[P16 V2] 超时：30s 内未检测到结果，流程结束');
        break;
      default:
        logToBoth('warn', `[P16 V2] 未知状态: ${ctx.detectState}`);
    }
  }

  /**
   * 等待用户手动截图（通过悬浮窗截图确认按钮）
   * @param round 第几轮报备（1=缦城和颂，2=山水和颂）
   */
  private async waitForUserScreenshot(round: number = 1): Promise<void> {
    logToBoth('info', '[截图确认] 等待用户截图（第' + round + '轮）...');

    // 提示用户截图并点击确认按钮
    await zbbAutomation.showToast('第' + round + '轮报备成功，请截图后点击按钮确认');

    // 显示悬浮窗截图确认按钮
    await zbbAutomation.showScreenshotButton();

    // 等待用户点击确认按钮
    return new Promise((resolve) => {
      const subscription = addScreenshotConfirmedListener(() => {
        logToBoth('success', '[截图确认] 用户已点击确认按钮');
        removeStopListener(subscription);
        resolve();
      });
    });
  }

  /**
   * 获取截图文件列表（通过 adb shell ls）
   */
  private async getScreenshotFiles(dir: string): Promise<string[]> {
    try {
      // 使用 execShell 获取目录文件列表
      const result = await zbbAutomation.execShell('ls -lt "' + dir + '" 2>/dev/null');
      if (!result) {
        return [];
      }

      // 解析文件列表，取文件名（最后一列）
      // Android ls -lt 格式: -rw-rw- root root 12345 2026-06-02 17:10 filename.jpg
      // 共 8 列，文件名在最后一列
      const lines = result.split('\n');
      const files: string[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const filename = parts[parts.length - 1];
          if (filename && (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg'))) {
            files.push(filename);
          }
        }
      }
      return files;
    } catch (e) {
      return [];
    }
  }

  /**
   * 情况1：疑似重号处理
   */
  private async handleRepeatCase(): Promise<void> {
    logToBoth('info', '[P16-情况1] 疑似重号处理');

    // 第1步：启动震动+弹窗提示
    logToBoth('info', '[P16-情况1-1] 启动震动+弹窗提示');
    await zbbAutomation.startPulseVibration();
    await zbbAutomation.showToast('检测到疑似重号，请点击"取消"按钮');

    // 第2步：等待用户点击"取消"按钮（最多30秒）
    logToBoth('info', '[P16-情况1-2] 等待用户点击"取消"...');
    let cancelClicked = false;
    const maxWaitTime = 30000;
    const startTime = Date.now();

    while (!cancelClicked && (Date.now() - startTime < maxWaitTime)) {
      const currentNodes = await this.printScreenText();
      const stillHasRepeat = currentNodes?.some((n) =>
        n.text.includes('疑似重号') || n.text.includes('重复')
      );

      if (!stillHasRepeat) {
        cancelClicked = true;
        logToBoth('success', '[P16-情况1-3] 用户已点击"取消"');
        break;
      }

      await zbbAutomation.delay(1000);
    }

    // 第3步：停止震动（如果用户点了取消）
    if (cancelClicked) {
      logToBoth('info', '[P16-情况1-3] 用户已取消，停止震动');
      await zbbAutomation.stopVibration();
    } else {
      logToBoth('warn', '[P16-情况1-3] 用户未操作，30秒到时，持续震动杀死ZBB');
    }

    // 第4步：通知首页累计数 +1（重号 = 尝试报备 1 次）
    // 2026-06-21 方案B：内存计数（避免 DB NPE），payload 带 count 同步过去
    this.todayBaoliCount++;
    logToBoth('info', `[P16-情况1-4] 通知首页累计数 +1, 当前=${this.todayBaoliCount}`);
    DeviceEventEmitter.emit('zbbReportCompleted', { count: this.todayBaoliCount });

    // 第5步：后台杀掉ZBB进程
    logToBoth('info', '[P16-情况1-5] 后台杀掉ZBB进程，流程结束');
    await zbbAutomation.killZbbProcess();
  }

  /**
   * 情况2：报备成功处理
   */
  private async handleSuccessCase(round: number = 1): Promise<void> {
    logToBoth('info', '[P16-情况2] 报备成功处理（第' + round + '轮）');

    // 直接上滑屏幕（不写库）
    logToBoth('info', '[P16-情况2-1] 上滑屏幕...');
    const swipeCoord = await getSwipeCoord('baoli_swipe_to_cloudhome');
    await zbbAutomation.swipe(swipeCoord.startX, swipeCoord.startY, swipeCoord.endX, swipeCoord.endY);

    // 识别"上传附件"坐标，点击(x+500, y)
    logToBoth('info', '[P16-情况2-2] 识别"上传附件"坐标，点击(x+500, y)...');
    const uploadNodes = await this.printScreenText();
    const uploadNode = uploadNodes?.find((n) => n.text.includes('上传附件'));
    if (uploadNode) {
      logToBoth('success', '[P16-情况2-2] 找到"上传附件" @ (' + uploadNode.centerX + ', ' + uploadNode.centerY + ')，点击偏移位置');
      await humanTap(uploadNode.centerX + 500, uploadNode.centerY);
    } else {
      logToBoth('warn', '[P16-情况2-2] 未找到"上传附件"，跳过');
    }

    // 等待用户手动截图（第一轮/第二轮区分）
    logToBoth('info', '[P16-情况2-3] 等待用户截图...');
    await this.waitForUserScreenshot(round);

    // 2. 按返回键回到报备界面
    await zbbAutomation.pressBack();
    await zbbAutomation.delay(1000);

    // 5. 第一轮报备成功后，执行第二轮报备（同一客户，第二项目：保利山水和颂）
    if (round === 1) {
      // 2026-06-21 方案B：第一轮成功 +1（任何 attempt 都计入累计），payload 带 count
      this.todayBaoliCount++;
      logToBoth('info', `[P16-情况2] 第一轮报备成功，通知首页累计数 +1, 当前=${this.todayBaoliCount}`);
      DeviceEventEmitter.emit('zbbReportCompleted', { count: this.todayBaoliCount });
      logToBoth('info', '[P16-情况2] 第一轮报备完成，开始第二轮...');
      await this.handleSecondRound();
    } else {
      // ========== W7 抽回千机：handleSuccessCase 删 Q6/Q7 内部代码 ==========
      // 旧设计：handleSuccessCase 内含 Q6/Q7 完整逻辑（returnToQianji + showGoAndWait）
      // W7 老板拍板：Q6/Q7 是千机端步骤，V2 阶段抽到千机 workflows/qianji/qianjiReturnWorkflow
      // 改写：仅完成 P16 业务（+1 累计数 + emit 事件），Q6/Q7 由千机 step 异步触发
      // 老 v1.6.4 execute() 路径：仍调 handleSuccessCase，但内部 Q6/Q7 逻辑移到千机 step
      // W7 阶段 V2 + 老同步链路并存 1 周，对比异步 vs 同步行为差异
      this.todayBaoliCount++;
      logToBoth('info', '[P16-情况2] 第二轮报备成功, 当前=' + this.todayBaoliCount);
      emitEvent(BAOLI_EVENTS.LAUNCH_DONE, {
        round: 2,
        targetApp: 'baoli',
        baoliCount: this.todayBaoliCount,
        timestamp: Date.now(),
      });
      logToBoth('success', '[P16-情况2] 第二轮报备完成，emit ON_BAOLI_LAUNCH_DONE，等待千机 Q6/Q7 异步处理...');
      return;
  }
}

  /**
   * 第二轮报备：复用 fillForm 主体（项目名=保利山水和颂）
   * 跟第一轮一致：粘贴 + 解析 + 选分期 + 选项目 + 智能识别 + 报备 + 等
   * 2026-06-16 重构：fillForm 加 projectName 参数，handleSecondRound 从 144 行简化到 29 行
   *
   * W5 阶段保留老设计（W5 阶段不接入 V2）：L1030 调老 this.fillForm('山水和颂')
   * W7 阶段接入 V2：L1030 调 startBaoliFillFormV2(2, '山水和颂') + 老 detectResult(2)
   * 1 周并行对比 V2 vs 老 fillForm 行为差异（W7 阶段逐步切换）
   */
  async handleSecondRound(): Promise<void> {
    logToBoth('info', '[第二轮] 开始第二轮报备...');
    await zbbAutomation.delay(pGammaDelay(2000, 3000));
    // P+ 随机停顿（第二轮开始准备）
    await maybePause();

    // 步骤 1：点击首页"报备"按钮（已在项目卡片页，不重新选外层项目）
    logToBoth('info', '[第二轮-步骤1] 点击"报备"...');
    const formNodes2 = await this.printScreenText();
    const baobeiNode2 = formNodes2?.find((n) => n.text === '报备');
    if (baobeiNode2) {
      logToBoth('success', '[第二轮-步骤1] 找到"报备" @ (' + baobeiNode2.centerX + ', ' + baobeiNode2.centerY + ')');
      await humanTap(baobeiNode2.centerX, baobeiNode2.centerY);
    } else {
      const fallback = await getTapCoord('baoli_humanTap_baobeiBtn');
      logToBoth('warn', '[第二轮-步骤1] 未找到"报备"，使用备用坐标 (' + fallback.x + ', ' + fallback.y + ') px (按机型)');
      await humanTap(fallback.x, fallback.y);
    }

    await zbbAutomation.delay(pGammaDelay(3000, 4000));
    // P+ 随机停顿（第二轮报备后）
    await maybePause();

    // 步骤 2-14：V2 接入 W7 - 调 baoliFillFormWorkflow（与第 1 轮同 workflow，projectName='山水和颂'）
    // 粘贴 + 解析 + 选分期 + 选项目 + 智能识别 + 报备 + 等 都跟第一轮一致
    await this.startBaoliFillFormV2(2, '郑州市三村杓袁7号地项目-保利山水和颂');

    // V2 化：handleSecondRound 末尾走 baoliDetectResultWorkflow + dispatch
    await this.detectResultV2(2);
  }

  /**
   * 退出小程序
   */
  async exitMiniProgram(): Promise<void> {
    const multiTaskPx = await getTapCoord('baoli_multiTask_key');
    await zbbAutomation.tap(multiTaskPx.x, multiTaskPx.y); // 多任务键（按机型，P+ 保留：系统键不能偏移）
    await zbbAutomation.delay(1000);
    const trashPx = await getTapCoord('baoli_trash_key');
    await zbbAutomation.tap(trashPx.x, trashPx.y); // 垃圾箱（按机型，P+ 保留：系统键不能偏移）
    await zbbAutomation.delay(1000);
    // 删 Home 键（避免 APK 不在首屏导致后续流程失败）—— 滑掉小程序后已回到桌面
  }

  /**
   * 判断表单是否已填充（步骤 8.4 辅助）
   * 最小判断 3 字段：客户姓名 2-4 中文字 / 客户电话符合 1XX****XXXX / 公司名称含"公司"
   * 2026-06-14 老板方案 C（3 字段最小判断，不重构原解析代码 L466-518）
   */
  private isFormFilled(nodes: any[]): boolean {
    if (!nodes || nodes.length === 0) return false;
    let hasName = false;
    let hasPhone = false;
    let hasCompany = false;
    // ★ 2026-06-20 修：放宽分隔符容忍（保利 UI 可能用空格/圆点/全角字符格式化电话）
    //   例：182****6888 / 182 **** 6888 / 182••••6888 / 182-****-6888 都能命中
    const phoneRegex = /1\d{2}[\s*•＊·.\-_]*\d{4}/;
    const nameRegex = /^[\u4e00-\u9fa5]{2,4}$/;    // 2-4 字中文姓名
    for (const n of nodes) {
      const text = (n?.text || '').trim();
      if (!text) continue;
      const isNameMatch = nameRegex.test(text);
      const isPhoneMatch = phoneRegex.test(text);
      const isCompanyMatch = text.includes('公司');
      if (isNameMatch) hasName = true;
      if (isPhoneMatch) hasPhone = true;
      if (isCompanyMatch) hasCompany = true;
      // ★ 2026-06-20 加 debug log：每个被检测节点都打印 + 命中情况（拿到 v2 regex 真不命中的节点 text）
      logToBoth('info', `[isFormFilled] 节点: "${text.substring(0, 60)}" | 姓名=${isNameMatch} 电话=${isPhoneMatch} 公司=${isCompanyMatch}`);
    }
    logToBoth('info', `[isFormFilled] 姓名=${hasName} 电话=${hasPhone} 公司=${hasCompany}`);
    return hasName && hasPhone && hasCompany;
  }

  /**
   * 静默版表单检测：复用 isFormFilled 判定逻辑，仅打 1 行汇总日志（不逐节点刷屏）
   * 用于步骤9 入口检测，检测结果不影响流程继续往后运行
   * 2026-06-21 老板
   */
  private isFormFilledSilent(nodes: any[]): boolean {
    if (!nodes || nodes.length === 0) return false;
    let hasName = false;
    let hasPhone = false;
    let hasCompany = false;
    const phoneRegex = /1\d{2}[\s*•＊·.\-_]*\d{4}/;
    const nameRegex = /^[\u4e00-\u9fa5]{2,4}$/;
    for (const n of nodes) {
      const text = (n?.text || '').trim();
      if (!text) continue;
      if (nameRegex.test(text)) hasName = true;
      if (phoneRegex.test(text)) hasPhone = true;
      if (text.includes('公司')) hasCompany = true;
    }
    return hasName && hasPhone && hasCompany;
  }

  /**
   * 粘贴失败兜底：30S 循环震动 + Toast + 弹窗 + GO 按钮（参考重号模式 L802-822）
   * 同步阻塞等用户点 GO 按钮后返回
   * 2026-06-14 老板新方案
   */
  private async handlePasteFailure(reason: string): Promise<void> {
    logToBoth('warn', `[粘贴失败兜底] ${reason}`);

    // 1. Toast 提示（2026-06-21 老板拍板：所有 Alert 换 Toast）
    // 历史：2026-06-16 改 Alert 是因"Toast 一闪就过"，但后续 7 处 Toast 实战验证 OK
    //      且本场景 30S 震动 + GO 按钮已接管用户交互，Alert 不阻塞流程（即使弹得出）
    // 多行文本可能截断（Android System Toast 长度有限），但用户关键操作在 GO 按钮，不依赖 Alert
    zbbAutomation.showToast(`⚠️ 粘贴失败：${reason}\n已启动 30S 循环震动 + 浮窗 GO 按钮`);

    // 2. 30S 循环震动
    try {
      await zbbAutomation.startPulseVibration();
      logToBoth('warn', '[粘贴失败兜底] 已启动 30S 循环震动');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logToBoth('warn', `[粘贴失败兜底] startPulseVibration 失败: ${msg}`);
    }

    // 3. 显示 GO 按钮
    try {
      await zbbAutomation.showScreenshotButton();
      logToBoth('warn', '[粘贴失败兜底] 浮窗 GO 按钮已显示');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logToBoth('warn', `[粘贴失败兜底] showScreenshotButton 失败: ${msg}`);
    }

    // 4. 同步阻塞等用户点 GO
    await new Promise<void>((resolve) => {
      const subscription = addScreenshotConfirmedListener(() => {
        logToBoth('success', '[粘贴失败兜底] 用户已点击 GO 按钮');
        removeStopListener(subscription);
        resolve();
      });
    });

    // 5. 停止震动
    try {
      await zbbAutomation.stopVibration();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logToBoth('warn', `[粘贴失败兜底] stopVibration 失败: ${msg}`);
    }

    logToBoth('info', '[粘贴失败兜底] 兜底流程结束，继续后续步骤');
  }
}

export const baoliService = BaoliService.getInstance();
export { BaoliService };
