/**
 * 保利端自动化服务
 * 版本: v1.1
 *
 * 2026-06-25 瘦身：原"独立于 NativeAutomationService"（老 v2.5 链路）已删除，
 *                BaoliService 是当前活跃的保利点位服务（v1.7.0+ 千机→保利 新链路）。
 *                仍使用预置测试数据（execute() 无参数），千机通过系统弹窗跳转传数据。
 * 流程：打开企业微信 → 点击工作台 → 进入云和家经纪云 → 填写报备表单
 */

import { DeviceEventEmitter } from 'react-native';
import { zbbAutomation, addScreenshotConfirmedListener, removeStopListener } from '../native';
import { QianjiService } from './QianjiService';

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

  static getInstance(): BaoliService {
    if (!BaoliService.instance) {
      BaoliService.instance = new BaoliService();
    }
    return BaoliService.instance;
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

  /**
   * 执行保利端完整流程
   */
  async execute(): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }

    this.isRunning = true;

    try {
      // ========== 步骤1：按 Home 退出到桌面 ==========
      logToBoth('info', '[步骤1] 按 Home 键退出到桌面...');
      await zbbAutomation.pressHomeKey();
      // 等待2-3秒随机时间确保桌面完全加载
      await zbbAutomation.delay(2000 + Math.floor(Math.random() * 1000));

      // ========== 步骤2：识别桌面企业微信图标 ==========
      logToBoth('info', '[步骤2] 识别桌面企业微信图标...');
      const wechatNode = await zbbAutomation.findNodeCenterByText('企业微信');
      if (wechatNode) {
        logToBoth('success', '[步骤2] 找到\"企业微信\" @ (' + wechatNode.centerX + ', ' + wechatNode.centerY + ')');
        await humanTap(wechatNode.centerX, wechatNode.centerY);
      } else {
        logToBoth('error', '[步骤2] 未在桌面找到\"企业微信\"图标，尝试直接启动');
        await zbbAutomation.launchAppWithMonkey(
          APP_PACKAGES.WECHAT,
          APP_PACKAGES.WECHAT_MAIN_ACTIVITY
        );
      }
      await zbbAutomation.delay(getDelay('openApp'));

      // ========== 步骤3：点击"工作台" ==========
      logToBoth('info', '[步骤2] 点击"工作台"...');
      await zbbAutomation.delay(1000);  // 额外等待确保界面稳定
      let workbenchNode = await this.findNodeByText('工作台');
      if (workbenchNode) {
        logToBoth('success', '[步骤2] 找到"工作台" @ (' + workbenchNode.centerX + ', ' + workbenchNode.centerY + ')');
        await humanTap(workbenchNode.centerX, workbenchNode.centerY);
      } else {
        logToBoth('warn', '[步骤2] 未找到"工作台"，使用备用坐标 (540, 199)');
        await humanTap(540, 199);
      }

      await zbbAutomation.delay(pGammaDelay(2000, 3000));

      // ========== 步骤3（业务流步骤4）：上滑15次 → 查找"云和家经纪云" ==========
      // 06-23 老板指令"步骤4上滑15步"：代码循环已 i<15（15 次），注释/架构文档同步
      // 流程：先 find 1 次（retries=1），找不到则上滑循环 15 次（humanSwipeWithBounce + 1.5s 间隔）
      logToBoth('info', '[步骤3] 上滑查找"云和家经纪云"...');
      let found = false;
      let cloudNode = await this.findNodeByText('云和家经纪云', 1);
      if (cloudNode) {
        logToBoth('success', '[步骤3] 找到"云和家经纪云" @ (' + cloudNode.centerX + ', ' + cloudNode.centerY + ')');
        await humanTap(cloudNode.centerX, cloudNode.centerY);
        found = true;
      } else {
        for (let i = 0; i < 15; i++) {
          // P+ 拟人化滚动：手指惯性 overshoot + 回弹
          await humanSwipeWithBounce(540, 1300, 540, 300,800);
          await zbbAutomation.delay(1500);
          cloudNode = await this.findNodeByText('云和家经纪云', 1);
          if (cloudNode) {
            logToBoth('success', '[步骤3] 上滑 ' + (i + 1) + ' 次后找到 @ (' + cloudNode.centerX + ', ' + cloudNode.centerY + ')');
            await humanTap(cloudNode.centerX, cloudNode.centerY);
            found = true;
            break;
          }
        }
      }

      if (!found) {
        logToBoth('warn', '[步骤3] 未找到"云和家经纪云"，使用备用坐标 (668, 1502)');
        await humanTap(668, 1502);
      }

      // 第一批优化 A：等云和家小程序加载（9s → 3s）
      await zbbAutomation.delay(3000);

      // P+ 随机停顿（云和家加载等待期）
      await maybePause();

      // ========== 步骤X+：找"郑州保利山水和颂" + tap（云和家小程序加载后第一屏）==========
      logToBoth('info', '[步骤X+] 找"郑州保利山水和颂"...');
      let projectEntry = null;
      for (let i = 0; i < 3; i++) {
        projectEntry = await this.findNodeByText('郑州保利山水和颂', 1);
        if (projectEntry) {
          logToBoth('success', '[步骤X+] 第 ' + (i + 1) + ' 次找到"郑州保利山水和颂" @ (' + projectEntry.centerX + ', ' + projectEntry.centerY + ')');
          break;
        }
        logToBoth('warn', '[步骤X+] 第 ' + (i + 1) + ' 次未找到"郑州保利山水和颂"');
        await zbbAutomation.delay(1000);
      }
      if (projectEntry) {
        await humanTap(projectEntry.centerX, projectEntry.centerY);
      } else {
        logToBoth('warn', '[步骤X+] 3 次未找到，使用兜底坐标 (810, 1440)');
        await humanTap(810, 1440);
      }
      await zbbAutomation.delay(pGammaDelay(2000, 3000));
      await maybePause();

      // ========== 直接进入 fillForm（剪贴板由千机端写入，保利端只管粘贴）==========
      logToBoth('info', '[步骤X] 直接进入填表流程...');
      await this.printScreenText();

      // ========== 步骤5：点击"报备" ==========
      logToBoth('info', '[步骤5] 点击"报备"...');
      const baobeiNode = await this.findExactNode('报备');
      if (baobeiNode) {
        logToBoth('success', '[步骤5] 找到"报备" @ (' + baobeiNode.centerX + ', ' + baobeiNode.centerY + ')');
        await humanTap(baobeiNode.centerX, baobeiNode.centerY);
      } else {
        logToBoth('warn', '[步骤5] 未找到"报备"，使用备用坐标 (700, 2200)');
        await humanTap(700, 2200);
        // ===== 调试：等待后打印界面所有节点 =====
        await zbbAutomation.delay(4000);
        await this.printScreenText();
      }

      await zbbAutomation.delay(pGammaDelay(3000, 4000));

      // P+ 随机停顿（进入表单前的迟疑）
      await maybePause();

      // ========== 步骤6-22：填写表单 ==========
      await this.fillForm();

      // ========== 步骤25：检测结果分支 ==========
      await this.detectResult();

      logToBoth('success', '========================================');
      logToBoth('success', '       保利端流程全部完成！');
      logToBoth('success', '========================================');

      return { success: true };

    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', '       保利端流程失败: ' + error);
      logToBoth('error', '========================================');
      return { success: false, error: String(error) };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 填写报备表单（由千机端写入剪贴板，保利端直接粘贴）
   * 千机端不再写数据库，由这里读取表单内容后写入
   */
  private async fillForm(
    projectName: string = '郑州市三村杓袁7号地项目-保利缦城和颂[郑州保利和颂]'
  ): Promise<void> {
    // ========== 步骤7-8.4：粘贴 + 表单识别（2026-06-14 老板新方案）==========
    // 修复前：3 路径兜底粘贴 + 失败仅日志 + 无 retry
    // 修复后：3 动作触发弹窗 + 表单识别 retry 2 次 + 任何兜底不 return
    // 2026-06-14 老板修复：findNodeByText/findExactNode 内部 retry 3 次
    // 任一兜底触发都不 return；pasteNode=null 时跳过步骤 7 三动作 + 步骤 8.4 retry 块

    let formNodes: any[] = [];

    // 步骤 7：3 动作触发 EMUI 粘贴弹窗
    logToBoth('info', '[步骤7] 找"粘贴完整客户信息..."节点');
    await zbbAutomation.delay(1000);
    let pasteNode = await this.findNodeByText('粘贴完整客户信息');
    if (!pasteNode) {
      // 兜底：另一个常见文案
      pasteNode = await this.findNodeByText('点击智能识别，都可快速填充');
    }

    if (!pasteNode) {
      // 步骤 7 失败兜底（findNodeByText 内部已 retry 3 次）
      logToBoth('error', '[步骤7] 重试 3 次仍未找到输入框节点');
      // 兜底坐标 (450, 800)：盲点长按触发 EMUI 粘贴弹窗（老板 2026-06-21 加）
      logToBoth('warn', '[步骤7] 兜底坐标长按 @ (450, 800)');
      await maybePause();                                       // 拟人：长按前思考
      await zbbAutomation.longPress(450, 800, 2000);            // longPress 无 human 版本
      await zbbAutomation.delay(pGammaDelay(800, 1500));        // 拟人：Gamma 延迟
      await humanTap(140, 720);                                  // 拟人：±5px 偏移点击
      await maybePause();                                       // 拟人：tap 后停顿
      await this.handlePasteFailure('[步骤7] 重试 3 次仍未找到输入框节点');
      formNodes = (await zbbAutomation.getAllTextNodes()) || [];
      logToBoth('info', `[步骤8.4] 兜底后重新识别: 节点数: ${formNodes.length}`);
      // 不 return；pasteNode=null，下方步骤 7 三动作 + 步骤 8.4 retry 块被 if 保护跳过
    } else {
      logToBoth('success', '[步骤7] 找到输入框 @ (' + pasteNode.centerX + ', ' + pasteNode.centerY + ')');

      // 动作 2：长按 2000ms 触发 EMUI 弹菜单（统一到第二轮）
      logToBoth('info', '[步骤7] 长按输入框 2000ms 触发 EMUI 弹菜单');
      await zbbAutomation.longPress(pasteNode.centerX, pasteNode.centerY, 2000);

      // 动作 3：tap(140, 720) 弹窗"粘贴"按钮（P+ 保留：弹窗按钮固定不能偏移）
      logToBoth('info', '[步骤7] tap 弹窗"粘贴"按钮 @ (140, 720)');
      await zbbAutomation.delay(1000); // 等弹窗动画（统一到第二轮的 1000ms）
      await zbbAutomation.tap(140, 720);
      // 删 800ms delay：步骤 8.4 内置 retry delay 2000ms 已覆盖等待粘贴完成

      // P+ 随机停顿（粘贴完成后的反应时间）
      await maybePause();

      // ========== 步骤8.4：等渲染 + 抓 formNodes（不检测、不兜底）==========
      // 2026-06-21 老板：步骤7 已完成粘贴；isFormFilled 检测非必须，结果不影响流程
      // 删除原 while retry + handlePasteFailure 兜底；步骤9 入口处加一次静默检测
      await zbbAutomation.delay(2000);  // 等粘贴内容渲染（保留原 retry 首次 delay 2000ms）
      formNodes = (await zbbAutomation.getAllTextNodes()) || [];
      logToBoth('info', `[步骤8.4] 界面节点数: ${formNodes.length}`);
      // 不检测、不调 handlePasteFailure，直接让 fillForm 继续（步骤9 会再检测）
    }

    let companyName = '';
    let customerName = '';
    let customerGender = '';
    let customerPhone = '';
    let reportProject = '';
    let propertyType = '';
    let reportTime = '';
    let expectedVisitTime = '';
    let agentName = '';

    formNodes?.forEach((node: any) => {
      const text = node.text || '';
      if (!text || text.trim().length === 0) return;
      logToBoth('info', `[步骤8.4] 节点: "${text}" @ (${Math.round(node.centerX)}, ${Math.round(node.centerY)})`);

      // 拆行处理（剪贴板预览是大块 text 包含 \n，单行匹配更稳）
      const lines = text.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);

      for (const line of lines) {
        // 公司名称
        if (!companyName) {
          const m = line.match(/^公司名称[：:](.+)$/);
          if (m) companyName = m[1].trim();
        }
        // 客户姓名
        if (!customerName) {
          const m = line.match(/^客户姓名[：:](.+)$/);
          if (m) customerName = m[1].trim();
        }
        // 客户联系方式（兼容"客户联系方式"和"联系方式"）
        if (!customerPhone) {
          const m = line.match(/^(?:客户)?联系方式[：:](.+)$/);
          if (m) customerPhone = m[1].trim();
        }
        // 性别（直接匹配"性别"标签，优先于姓名推断）
        if (!customerGender) {
          const m = line.match(/^性别[：:](.+)$/);
          if (m) {
            const g = m[1].trim();
            if (g === '男' || g === '女') customerGender = g;
          }
        }
        // 报备项目
        if (!reportProject) {
          const m = line.match(/^报备项目[：:](.+)$/);
          if (m) reportProject = m[1].trim();
        }
        // 物业类型
        if (!propertyType) {
          const m = line.match(/^物业类型[：:](.+)$/);
          if (m) propertyType = m[1].trim();
        }
        // 报备提交时间（兼容"报备提交时间"和"报备提交"）
        if (!reportTime) {
          const m = line.match(/^报备提交(?:时间)?[：:](.+)$/);
          if (m) reportTime = m[1].trim();
        }
        // 预计到访时间
        if (!expectedVisitTime) {
          const m = line.match(/^预计到访时间[：:](.+)$/);
          if (m) expectedVisitTime = m[1].trim();
        }
        // 经纪人姓名（兼容"经纪人姓名"和"经纪人"）
        if (!agentName) {
          const m = line.match(/^经纪人(?:姓名)?[：:](.+)$/);
          if (m) agentName = m[1].trim();
        }
      }

      // 兜底：如果 reportProject 仍空，第一行可能是项目名（无 "XX:" 格式）
      if (!reportProject && lines.length > 0) {
        const firstLine = lines[0];
        if (!firstLine.includes(':') && !firstLine.includes('：')) {
          reportProject = firstLine;
        }
      }
    });

    // 判断性别（兜底：仅在"性别"标签未匹配时，从姓名末尾推断）
    if (!customerGender && customerName) {
      if (/[女士|小姐|太太]$/.test(customerName)) customerGender = '女';
      else if (/先生$/.test(customerName)) customerGender = '男';
    }

    logToBoth('info', `[步骤8.4] 解析结果: 公司=${companyName} 客户=${customerName} 性别=${customerGender} 电话=${customerPhone} 项目=${reportProject} 物业=${propertyType} 报备时间=${reportTime} 到访时间=${expectedVisitTime} 经纪人=${agentName}`);

    // 步骤9 入口检测：isFormFilled（静默版，仅 1 行汇总日志，避免节点刷屏）
    // 2026-06-21 老板：检测非必须，结果不影响流程，仅 warn 日志
    const formFilledCheck = this.isFormFilledSilent(formNodes);
    logToBoth(formFilledCheck ? 'success' : 'warn', `[步骤9 入口检测] 表单${formFilledCheck ? '已填充 ✅' : '未填充 ⚠️'} 节点数: ${formNodes.length}`);

    // ========== 步骤9：点击"请选择分期" ==========
    logToBoth('info', '[步骤9] 点击"请选择分期"...');
    await this.printScreenText();
    const fenqiNode = await this.findNodeByText('请选择分期');
    if (fenqiNode) {
      logToBoth('success', '[步骤9] 找到"请选择分期" @ (' + fenqiNode.centerX + ', ' + fenqiNode.centerY + ')');
      await humanTap(fenqiNode.centerX, fenqiNode.centerY);
    } else {
      logToBoth('warn', '[步骤9] 未找到"请选择分期"，使用备用坐标 (580, 640)');
      await maybePause();       // 拟人：思考
      await humanTap(580, 640);  // 已是 humanTap，保留
      await maybePause();       // 拟人：tap 后停顿
    }

    // ========== 步骤：等待2-3秒 ==========
    await zbbAutomation.delay(pGammaDelay(2000, 3000));

    // P+ 随机停顿（分期选择后）
    await maybePause();

    // 第一批优化 I：删除重复的 printScreenText（步骤 10 中会再次调用，节点未变）
    // ========== 步骤10：点击"郑州市三村杓袁7号地项目-保利缦城和颂【郑州保利和颂】" ==========
    // 统一到第二轮：选项目前不再 delay（步骤 9 后的 pGammaDelay(2000,3000) 已足够等分期列表加载）
    logToBoth('info', '[步骤10] 选择报备项目...');
    const projectNodes = await this.printScreenText();
    const targetProject = projectNodes?.find((n: any) => n.text && n.text.includes(projectName));
    if (targetProject) {
      logToBoth('success', '[步骤10] 找到"' + targetProject.text + '" @ (' + targetProject.centerX + ', ' + targetProject.centerY + ')');
      await humanTap(targetProject.centerX, targetProject.centerY);
    } else {
      logToBoth('warn', '[步骤10] 未找到目标项目，使用备用坐标 (540, 2000)');
      await humanTap(540, 2000);
    }

    // ========== 步骤11：点击"确认" ==========
    logToBoth('info', '[步骤11] 点击"确认"...');
    await zbbAutomation.delay(1000);
    const confirmNode = await this.findExactNode('确认');
    if (confirmNode) {
      logToBoth('success', '[步骤11] 找到"确认" @ (' + confirmNode.centerX + ', ' + confirmNode.centerY + ')');
      await humanTap(confirmNode.centerX, confirmNode.centerY);
    } else {
      logToBoth('warn', '[步骤11] 未找到"确认"，使用备用坐标 (950, 1500)');
      await humanTap(950, 1500);
    }

    // ========== 步骤12：智能识别 ==========
    // 老板反馈步骤 11 → 12 间隔太短（之前统一到 delay(1000)，智能识别按钮还没加载就找）
    // 加长到 pGammaDelay(2000, 3000) ≈ 2.5s
    logToBoth('info', '[步骤12] 点击"智能识别"...');
    await zbbAutomation.delay(pGammaDelay(2000, 3000));
    const zhinengNode = await this.findNodeByText('智能识别');
    if (zhinengNode) {
      logToBoth('success', '[步骤12] 找到"智能识别" @ (' + zhinengNode.centerX + ', ' + zhinengNode.centerY + ')');
      await humanTap(zhinengNode.centerX, zhinengNode.centerY);
    } else {
      logToBoth('warn', '[步骤12] 未找到"智能识别"，使用备用坐标 (910, 1100)');
      await humanTap(910, 1100);
    }

    // ========== 步骤13：点击"报备" ==========
    // 老板反馈：步骤 12 → 13 之间太短（之前统一删除 3.5s delay 后只剩 printScreenText 0.3s）
    // 加长到 pGammaDelay(2000, 3000) ≈ 2.5s，等智能识别完成 + 报备按钮加载
    logToBoth('info', '[步骤13] 点击"报备"...');
    await zbbAutomation.delay(pGammaDelay(2000, 3000));
    await this.printScreenText();
    const finalBaobeiNode = await this.findExactNode('报备');
    if (finalBaobeiNode) {
      logToBoth('success', '[步骤13] 找到"报备" @ (' + finalBaobeiNode.centerX + ', ' + finalBaobeiNode.centerY + ')');
      await humanTap(finalBaobeiNode.centerX, finalBaobeiNode.centerY);
    } else {
      logToBoth('warn', '[步骤13] 未找到"报备"，使用备用坐标 (540, 2200)');
      await humanTap(540, 2200);
    }

    // ========== 步骤14：等待报备结果 ==========
    logToBoth('info', '[步骤14] 等待报备结果...');
    await zbbAutomation.delay(pGammaDelay(3000, 6000));
    // P+ 随机停顿（报备结果查看）
    await maybePause();


  }

  /**
   * 步骤15：检测报备结果分支
   * @param round 第几轮报备（1=缦城和颂，2=山水和颂）
   */
  private async detectResult(round: number = 1): Promise<void> {
    logToBoth('info', '[步骤15] 检测报备结果（第' + round + '轮）...');
    const step15Nodes = await this.printScreenText();

    // 检测是否出现疑似重号
    const repeatNode = step15Nodes?.find((n) =>
      n.text.includes('疑似重号') || n.text.includes('重复')
    );

    // 检测是否报备成功（出现防截客中）
    const successNode = step15Nodes?.find((n) =>
      n.text.includes('防截客中') || n.text.includes('已报备')
    );

    if (repeatNode) {
      // ========== 情况1：疑似重号 ==========
      logToBoth('warn', '[步骤15-情况1] 检测到疑似重号');
      await this.handleRepeatCase();
    } else if (successNode) {
      // ========== 情况2：报备成功 ==========
      logToBoth('success', '[步骤15-情况2] 检测到报备成功');
      await this.handleSuccessCase(round);
    } else {
      // ========== 超时：提示用户手动确认，最长等待30秒，最多重试6次（每次5秒）==========
      logToBoth('warn', '[步骤15-超时] 未检测到预期结果，提示用户手动确认...');
      await zbbAutomation.showToast('未检测到结果，请手动确认！');
      const startTime = Date.now();
      for (let i = 0; i < 6; i++) {
        await zbbAutomation.delay(5000);
        if (Date.now() - startTime >= 30000) break;
        const nodes = await this.printScreenText();
        const repeat = nodes?.find((n) => n.text.includes('疑似重号') || n.text.includes('重复'));
        const success = nodes?.find((n) => n.text.includes('防截客中') || n.text.includes('已报备'));
        if (repeat) {
          logToBoth('success', '[步骤15-超时-重试] 用户操作后检测到疑似重号');
          await this.handleRepeatCase();
          return;
        }
        if (success) {
          logToBoth('success', '[步骤15-超时-重试] 用户操作后检测到报备成功');
          await this.handleSuccessCase(round);
          return;
        }
        logToBoth('warn', '[步骤15-超时-重试] 第' + (i + 1) + '次重试，未检测到结果...');
      }
      logToBoth('warn', '[步骤15-超时] 30秒内未检测到结果，流程结束，保持当前界面');
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
    logToBoth('info', '[步骤15-情况1] 疑似重号处理');

    // 第1步：启动震动+弹窗提示
    logToBoth('info', '[步骤15-情况1-1] 启动震动+弹窗提示');
    await zbbAutomation.startPulseVibration();
    await zbbAutomation.showToast('检测到疑似重号，请点击"取消"按钮');

    // 第2步：等待用户点击"取消"按钮（最多30秒）
    logToBoth('info', '[步骤15-情况1-2] 等待用户点击"取消"...');
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
        logToBoth('success', '[步骤15-情况1-3] 用户已点击"取消"');
        break;
      }

      await zbbAutomation.delay(1000);
    }

    // 第3步：停止震动（如果用户点了取消）
    if (cancelClicked) {
      logToBoth('info', '[步骤15-情况1-3] 用户已取消，停止震动');
      await zbbAutomation.stopVibration();
    } else {
      logToBoth('warn', '[步骤15-情况1-3] 用户未操作，30秒到时，持续震动杀死ZBB');
    }

    // 第4步：通知首页累计数 +1（重号 = 尝试报备 1 次）
    // 2026-06-21 方案B：内存计数（避免 DB NPE），payload 带 count 同步过去
    this.todayBaoliCount++;
    logToBoth('info', `[步骤15-情况1-4] 通知首页累计数 +1, 当前=${this.todayBaoliCount}`);
    DeviceEventEmitter.emit('zbbReportCompleted', { count: this.todayBaoliCount });

    // 第5步：后台杀掉ZBB进程
    logToBoth('info', '[步骤15-情况1-5] 后台杀掉ZBB进程，流程结束');
    await zbbAutomation.killZbbProcess();
  }

  /**
   * 情况2：报备成功处理
   */
  private async handleSuccessCase(round: number = 1): Promise<void> {
    logToBoth('info', '[步骤15-情况2] 报备成功处理（第' + round + '轮）');

    // 直接上滑屏幕（不写库）
    logToBoth('info', '[步骤15-情况2-1] 上滑屏幕...');
    await zbbAutomation.swipe(540, 1200, 540, 800);

    // 识别"上传附件"坐标，点击(x+500, y)
    logToBoth('info', '[步骤15-情况2-2] 识别"上传附件"坐标，点击(x+500, y)...');
    const uploadNodes = await this.printScreenText();
    const uploadNode = uploadNodes?.find((n) => n.text.includes('上传附件'));
    if (uploadNode) {
      logToBoth('success', '[步骤15-情况2-1] 找到"上传附件" @ (' + uploadNode.centerX + ', ' + uploadNode.centerY + ')，点击偏移位置');
      await humanTap(uploadNode.centerX + 500, uploadNode.centerY);
    } else {
      logToBoth('warn', '[步骤15-情况2-1] 未找到"上传附件"，跳过');
    }

    // 等待用户手动截图（第一轮/第二轮区分）
    logToBoth('info', '[步骤15-情况2-3] 等待用户截图...');
    await this.waitForUserScreenshot(round);

    // 2. 按返回键回到报备界面
    await zbbAutomation.pressBack();
    await zbbAutomation.delay(1000);

    // 5. 第一轮报备成功后，执行第二轮报备（同一客户，第二项目：保利山水和颂）
    if (round === 1) {
      // 2026-06-21 方案B：第一轮成功 +1（任何 attempt 都计入累计），payload 带 count
      this.todayBaoliCount++;
      logToBoth('info', `[步骤15-情况2] 第一轮报备成功，通知首页累计数 +1, 当前=${this.todayBaoliCount}`);
      DeviceEventEmitter.emit('zbbReportCompleted', { count: this.todayBaoliCount });
      logToBoth('info', '[步骤15-情况2] 第一轮报备完成，开始第二轮...');
      await this.handleSecondRound();
    } else {
      // ========== 步骤8：返回→Home→开千机→识别→点"报备有效"→Toast 提示 ==========
      logToBoth('info', '[步骤15-情况2-步骤8] 返回报备界面...');
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(1000);

      logToBoth('info', '[步骤15-情况2-步骤8] 按Home键返回桌面...');
      await zbbAutomation.pressHomeKey();
      await zbbAutomation.delay(1500);

      logToBoth('info', '[步骤15-情况2-步骤8] 打开千机...');
      await zbbAutomation.launchAppWithAmStart(
        'com.lianjia.anchang',
        'com.lianjia.link.platform.main.MainActivity'
      );
      await zbbAutomation.delay(5000);

      logToBoth('info', '[步骤15-情况2-步骤8] 识别当前界面...');
      const nodesAfterOpen = await zbbAutomation.getAllTextNodes();
      const baobeiYouxiaoNode = nodesAfterOpen?.find((n: any) => n.text?.includes('报备有效'));
      if (baobeiYouxiaoNode) {
        logToBoth('success', '[步骤15-情况2-步骤8] 找到"报备有效" @ (' + baobeiYouxiaoNode.centerX + ', ' + baobeiYouxiaoNode.centerY + ')，点击...');
        await humanTap(baobeiYouxiaoNode.centerX, baobeiYouxiaoNode.centerY);
      } else {
        logToBoth('warn', '[步骤15-情况2-步骤8] 未找到"报备有效"，跳过');
      }

      logToBoth('info', '[步骤15-情况2-步骤8] 系统Alert弹窗（震动+Toast）...');
      await zbbAutomation.startPulseVibration();
      // 用 Toast 而非 Alert：此时千机/小程序在前台，ZBB 在后台，
      // Alert.alert 依赖调用方 Activity 在前台才渲染 → 弹不出
      // Toast 是系统级浮层，前后台都能显示
      // 2026-06-21 老板拍板：移除 Alert 块（Toast 已发，Alert 弹不出 → 纯死代码）
      await zbbAutomation.showToast('✅ 已完成报备，请选择正确二维码截图。记得核对姓名及电话！');

      // ========== 步骤9：用户点"确定"后，显示GO按钮→等待点击→exitMiniProgram×2 ==========
      logToBoth('info', '[步骤15-情况2-步骤9] 显示GO按钮，等待用户点击...');
      await zbbAutomation.showScreenshotButton();

      // 等待用户点击GO按钮（触发onScreenshotConfirmed）
      await new Promise<void>((resolve) => {
        const subscription = addScreenshotConfirmedListener(() => {
          logToBoth('success', '[步骤15-情况2-步骤9] 用户已点击GO按钮');
          removeStopListener(subscription);
          resolve();
        });
      });

      // 停止震动
      await zbbAutomation.stopVibration();

      // 2026-06-21 方案B：第二轮 GO 后 +1（接龙完成 = 完整一组客户），payload 带 count
      this.todayBaoliCount++;
      logToBoth('info', `[步骤15-情况2] 第二轮 GO 后，通知首页累计数 +1, 当前=${this.todayBaoliCount}`);
      DeviceEventEmitter.emit('zbbReportCompleted', { count: this.todayBaoliCount });

      logToBoth('success', '[步骤15-情况2] 第二轮报备成功，退出小程序...');
      await this.exitMiniProgram();
      await zbbAutomation.delay(1000);
      await this.exitMiniProgram();

      // ========== 循环接龙：自动检测下一组客户 ==========
      // 老板方案：每报备完一组（第一项目+第二项目）后，
      // 自动调千机 step1+2+3 检测下一组保利客户，有则继续报备，无则结束
      logToBoth('info', '[接龙] 第二轮报备完成，启动下一组客户检测...');
      try {
        const relayResult = await QianjiService.getInstance().testOnlyQianjiFlow();
        if (relayResult === 'no_pending') {
          logToBoth('success', '[接龙] 没有更多待报备客户，循环结束');
          zbbAutomation.showToast('✅ 没有更多待报备客户，接龙结束');
          return;
        }
        if (relayResult === 'no_baoli') {
          logToBoth('success', '[接龙] 当前没有保利客户，循环结束');
          zbbAutomation.showToast('✅ 当前没有保利客户，循环结束');
          return;
        }
        // 有保利客户 → 递归调 execute() 跑下一组
        // ★ 关键修复：递归前手动释放锁 ★
        // handleSuccessCase(2) 还在外层 execute() 的 try 块内，
        // finally 没跑，this.isRunning 还是 true → 新 execute() 入口会抛 "流程已在运行中"
        // 手动设 false 让新 execute() 通过锁检查；新 execute() 跑完 finally 会再设回 false
        logToBoth('info', '[接龙] 检测到新保利客户，释放锁后启动下一轮...');
        this.isRunning = false;
        logToBoth('info', '[接龙] 启动下一轮报备...');
        await this.execute();
      } catch (e) {
        // catch + warn（老板要求）：单组异常时只 warn，不继续接龙
        logToBoth('warn', `[接龙] 异常停止，循环结束: ${e}`);
        zbbAutomation.showToast(`⚠️ 接龙异常停止: ${e}`);
      }
    }
  }

/**
   * 第二轮报备：复用 fillForm 主体（项目名=保利山水和颂）
   * 跟第一轮一致：粘贴 + 解析 + 选分期 + 选项目 + 智能识别 + 报备 + 等
   * 2026-06-16 重构：fillForm 加 projectName 参数，handleSecondRound 从 144 行简化到 29 行
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
      logToBoth('warn', '[第二轮-步骤1] 未找到"报备"，使用备用坐标 (700, 2200)');
      await humanTap(700, 2200);
    }

    await zbbAutomation.delay(pGammaDelay(3000, 4000));
    // P+ 随机停顿（第二轮报备后）
    await maybePause();

    // 步骤 2-14：复用 fillForm 主体（项目名=保利山水和颂）
    // 粘贴 + 解析 + 选分期 + 选项目 + 智能识别 + 报备 + 等 都跟第一轮一致
    await this.fillForm('郑州市三村杓袁7号地项目-保利山水和颂');

    // 步骤 15：detectResult(2)
    await this.detectResult(2);
  }

  /**
   * 退出小程序
   */
  async exitMiniProgram(): Promise<void> {
    await zbbAutomation.tap(300, 2300); // 多任务键（P+ 保留：系统键不能偏移）
    await zbbAutomation.delay(1000);
    await zbbAutomation.tap(540, 2150); // 垃圾箱（P+ 保留：系统键不能偏移）
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
