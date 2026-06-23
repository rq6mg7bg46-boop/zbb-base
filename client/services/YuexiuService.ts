/**
 * 越秀端自动化服务
 * 版本: v1.0
 * 创建: 2026-06-23（老板指示"类似保利端"独立抽取）
 *
 * 独立于 NativeAutomationService.ts，参考 BaoliService 模板
 * 原代码位于 NativeAutomationService.ts:
 *   - startYuexiuFlow()            L4149
 *   - openWechat()                 L1593
 *   - searchAndEnterMiniApp()      L1626
 *   - enterProjectDetails()        L1871
 *   - inputCustomerInfoFirst()     L1931
 *   - inputCustomerInfoFromRecord() L1969
 *   - submitFirstProject()         L2028
 *   - captureAndSaveScreenshot()   L2306
 *   - recognizeScreenText()        L1525
 *   - checkScreenText()            L1466
 *   - parseTextNodesFromTree()     L1505
 *
 * 流程（5 步）：
 *   1. 打开企业微信
 *   2. 工作台 → 越秀地产悦秀会小程序
 *   3. 点击"我要推荐"
 *   4. 输入客户姓名 + 电话（从数据库 latestReport 读）
 *   5. 选择项目并提交（自动截图）
 *
 * 数据来源：DatabaseService.getLatestReportByType('yuexiu')
 *
 * ⚠️ 注意：仍依赖 OCR (findTextByMLKit / recognizeScreenText) 和截图 (takeScreenshot)
 *    按老板 06-23 指示："这个处理完以后，再处理截图和 OCR"
 *    v1.1 计划：截图改用户手动（参考保利 waitForUserScreenshot），OCR 改纯节点树
 */

import { DeviceEventEmitter } from 'react-native';
import { zbbAutomation } from '../native';
import { clickAtPosition } from '../native/ZBBAutomation';
import { getLatestReportByType, updateReportStatus } from './DatabaseService';

const APP_PACKAGES = {
  WECHAT: 'com.tencent.wework',  // 企业微信
};

// 延时配置
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
function logToBoth(level: 'info' | 'success' | 'warn' | 'error', message: string): void {
  console.log('[' + level.toUpperCase() + '] ' + message);
}

// 辅助函数：解析节点树文本
function parseTextNodesFromTree(treeString: string): string[] {
  const texts: string[] = [];
  // 匹配 mText="xxx" 或 text="xxx" 格式
  const textRegex = /mText="([^"]*)"|text="([^"]*)"/g;
  let match;
  while ((match = textRegex.exec(treeString)) !== null) {
    const text = match[1] || match[2];
    if (text && text.trim().length > 0) {
      texts.push(text.trim());
    }
  }
  return texts;
}

/**
 * 越秀端自动化服务类
 * 独立于 NativeAutomationService
 */
class YuexiuService {
  private static instance: YuexiuService;
  private isRunning: boolean = false;
  private isAborted: boolean = false;
  private screenshotPaths: string[] = [];

  static getInstance(): YuexiuService {
    if (!YuexiuService.instance) {
      YuexiuService.instance = new YuexiuService();
    }
    return YuexiuService.instance;
  }

  /**
   * 主入口（2026-06-23 类似 baoliService.execute()）
   * 从数据库读取越秀待报备记录，5 步内联
   */
  async execute(): Promise<{ success: boolean; error?: string; reportId?: number }> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }

    this.isRunning = true;
    this.isAborted = false;

    logToBoth('info', '========================================');
    logToBoth('info', '       越秀端报备流程开始');
    logToBoth('info', '========================================');

    try {
      // 从数据库获取最新越秀待报备记录
      const latestReport = await getLatestReportByType('yuexiu');

      if (!latestReport) {
        logToBoth('warn', '[越秀端] 没有找到越秀待报备记录');
        return { success: false, error: '没有找到越秀待报备记录' };
      }

      logToBoth('info', `[越秀端] 获取到待报备记录: ID=${latestReport.id}, 客户=${latestReport.customer_name}, 电话=${latestReport.customer_phone}`);

      // 解析姓名和性别
      const customerName = latestReport.customer_name || '';
      const customerGender = customerName.replace(/[\u4e00-\u9fa5]+/g, '').trim();
      const pureName = customerName.replace(customerGender, '').trim();
      const nameMatch = customerName.match(/[\u4e00-\u9fa5]+/);
      const parsedName = nameMatch ? nameMatch[0] : pureName;

      logToBoth('info', `[越秀端] 姓名=${parsedName}, 性别=${customerGender}, 电话=${latestReport.customer_phone}`);

      // 步骤1：打开企业微信
      logToBoth('info', '[越秀端] 步骤1：打开企业微信...');
      void zbbAutomation.updateFloatingStep('打开企业微信', 0, 5);
      await this.openWechat();
      await this.checkAbort();

      // 步骤2：进入越秀地产悦秀会小程序
      logToBoth('info', '[越秀端] 步骤2：进入越秀地产悦秀会小程序...');
      void zbbAutomation.updateFloatingStep('进入小程序', 1, 5);
      await this.searchAndEnterMiniApp();
      await this.checkAbort();

      // 步骤3：进入项目详情（点击"我要推荐"）
      logToBoth('info', '[越秀端] 步骤3：点击"我要推荐"...');
      void zbbAutomation.updateFloatingStep('点击我要推荐', 2, 5);
      await this.enterProjectDetails();
      await this.checkAbort();

      // 步骤4：输入客户信息
      logToBoth('info', '[越秀端] 步骤4：输入客户信息...');
      void zbbAutomation.updateFloatingStep('输入客户信息', 3, 5);
      await this.inputCustomerInfoFirst(latestReport);
      await this.checkAbort();

      // 步骤5：选择项目并提交
      logToBoth('info', '[越秀端] 步骤5：选择项目并提交...');
      void zbbAutomation.updateFloatingStep('报备提交', 4, 5);
      await this.submitFirstProject();
      await this.checkAbort();

      // 更新数据库状态（修原 bug：updateReportSuccess 不存在，用 updateReportStatus）
      await updateReportStatus(latestReport.id, 'success');

      logToBoth('success', '========================================');
      logToBoth('success', '       越秀端报备流程完成！');
      logToBoth('success', '========================================');

      return { success: true, reportId: latestReport.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logToBoth('error', '========================================');
      logToBoth('error', `       越秀端报备流程失败: ${msg}`);
      logToBoth('error', '========================================');
      return { success: false, error: msg };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 检查是否被停止
   */
  private async checkAbort(): Promise<void> {
    if (this.isAborted) {
      logToBoth('warn', '[越秀端] 流程已被用户停止');
      this.isRunning = false;
      throw new Error('流程已被用户停止');
    }
  }

  /**
   * 停止流程（由 UI 层调用）
   */
  abort(): void {
    this.isAborted = true;
    this.isRunning = false;
    logToBoth('warn', '[越秀端] 收到停止指令');
  }

  /**
   * 检查是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }

  // ========== 步骤1：打开企业微信 ==========

  private async openWechat(): Promise<void> {
    logToBoth('info', '[企业微信：步骤1] 正在打开企业微信...');

    // 实际启动企业微信APP
    const launched = await zbbAutomation.launchApp(APP_PACKAGES.WECHAT);
    if (launched) {
      logToBoth('info', '[企业微信：步骤1] 企业微信已启动，等待界面加载...');
    } else {
      logToBoth('error', '[企业微信：步骤1] ✗ 企业微信启动失败，请检查企业微信是否已安装');
    }

    // 等待应用加载
    await zbbAutomation.delay(getDelay('openApp'));

    // 检查当前包名
    const packageName = await zbbAutomation.getCurrentPackageName();
    logToBoth('info', `[企业微信] 当前应用: ${packageName}`);

    logToBoth('success', '[企业微信：步骤1] 企业微信已打开');
  }

  // ========== 步骤2：进入越秀地产悦秀会小程序 ==========

  private async searchAndEnterMiniApp(): Promise<void> {
    logToBoth('info', '[流程] 阶段三：搜索并进入小程序');
    logToBoth('info', '[流程] 阶段四：进入越秀地产悦秀会小程序');

    try {
      // ========== 步骤2：切换到企业微信 ==========
      logToBoth('info', '[企业微信] 正在启动应用: com.tencent.wework');
      await zbbAutomation.launchApp(APP_PACKAGES.WECHAT);
      await zbbAutomation.delay(1500);  // 等待企业微信启动
      await this.checkAbort();

      // ========== 步骤3：使用原生节点查找并点击"工作台" ==========
      logToBoth('info', '[企业微信] 正在查找"工作台"...');

      let workbenchResult = null;
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          logToBoth('info', `[企业微信] 第 ${retry + 1} 次重试查找"工作台"...`);
          await zbbAutomation.delay(1000);
        }
        workbenchResult = await zbbAutomation.findElementByText('工作台');
        if (workbenchResult?.found && workbenchResult.boundsCenterX! > 0 && workbenchResult.boundsCenterY! > 0) {
          break;
        }
      }

      if (workbenchResult?.found && workbenchResult.boundsCenterX! > 0 && workbenchResult.boundsCenterY! > 0) {
        logToBoth('success', `[企业微信] ⑨: 找到"工作台" @ (${workbenchResult.boundsCenterX}, ${workbenchResult.boundsCenterY})`);
        await zbbAutomation.delay(300);
        await zbbAutomation.click(workbenchResult.boundsCenterX!, workbenchResult.boundsCenterY!);
        logToBoth('success', '[企业微信] ⑨: 点击"工作台"');
      } else {
        logToBoth('error', `[企业微信] ⑨: 未找到"工作台"，请检查屏幕`);
        throw new Error('未找到"工作台"，请检查屏幕');
      }

      await zbbAutomation.delay(1500);  // 等待工作台页面加载
      await this.checkAbort();

      // ========== 步骤4：使用原生节点查找并点击"越秀地产悦秀会" ==========
      logToBoth('info', '[企业微信] 正在查找"越秀地产悦秀会"...');

      let yuexiuResult = null;
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) {
          logToBoth('info', `[企业微信] 第 ${retry + 1} 次重试查找...`);
          await zbbAutomation.delay(1000);
        }
        yuexiuResult = await zbbAutomation.findElementByText('越秀地产悦秀会');
        if (yuexiuResult?.found && yuexiuResult.boundsCenterX! > 0 && yuexiuResult.boundsCenterY! > 0) {
          break;
        }
      }

      if (yuexiuResult?.found && yuexiuResult.boundsCenterX! > 0 && yuexiuResult.boundsCenterY! > 0) {
        logToBoth('success', `[企业微信] ⑩: 找到"越秀地产悦秀会" @ (${yuexiuResult.boundsCenterX}, ${yuexiuResult.boundsCenterY})`);
        await zbbAutomation.delay(300);
        await zbbAutomation.click(yuexiuResult.boundsCenterX!, yuexiuResult.boundsCenterY!);
        logToBoth('success', '[企业微信] ⑩: 点击"越秀地产悦秀会"进入小程序');
      } else {
        logToBoth('error', `[企业微信] ⑩: 未找到"越秀地产悦秀会"，请检查屏幕`);
        throw new Error('未找到"越秀地产悦秀会"小程序，请检查屏幕');
      }

      // 等待小程序加载
      logToBoth('info', '[企业微信] 等待小程序加载...');
      await zbbAutomation.delay(3000);
      await this.checkAbort();

      // ========== 步骤4：点击"我要推荐" ==========
      logToBoth('info', '[小程序] ⑫: 点击"我要推荐"...');

      // 先用 OCR 查找"我要推荐"
      const tuijianResult = await zbbAutomation.findTextByMLKit('我要推荐');

      if (tuijianResult?.found && tuijianResult.centerX && tuijianResult.centerY) {
        await zbbAutomation.click(tuijianResult.centerX, tuijianResult.centerY);
        logToBoth('success', '[小程序] ⑫: 点击"我要推荐"成功');
      } else {
        // 尝试原生节点查找
        const recommendElement = await zbbAutomation.findElementByText('我要推荐');
        if (recommendElement?.found && recommendElement.boundsCenterX && recommendElement.boundsCenterY) {
          await zbbAutomation.click(recommendElement.boundsCenterX, recommendElement.boundsCenterY);
          logToBoth('success', '[小程序] ⑫: 点击"我要推荐"(原生节点)');
        } else {
          // 备用坐标：屏幕中心偏下
          const screenSize = await zbbAutomation.getScreenSize();
          const backupX = screenSize?.width ? screenSize.width * 0.5 : 180;
          const backupY = screenSize?.height ? screenSize.height * 0.65 : 506;
          await zbbAutomation.click(backupX, backupY);
          logToBoth('warn', `[小程序] ⑫: 点击"我要推荐"(备用坐标: ${backupX}, ${backupY})`);
        }
      }

      // 等待页面加载
      logToBoth('info', '[小程序] 等待页面加载...');
      await zbbAutomation.delay(5000);
      await this.checkAbort();

      // 检查是否进入报备页面
      logToBoth('info', '[小程序] 检查是否进入报备页面...');
      const inReportPage = await this.checkScreenText('姓名', 3, '[越秀端]') ||
                          await this.checkScreenText('客户', 3, '[越秀端]') ||
                          await this.checkScreenText('报备', 3, '[越秀端]');

      if (inReportPage) {
        logToBoth('success', '[小程序] 已进入报备页面');
        return;
      }

      logToBoth('warn', '[小程序] 未检测到报备页面特征，继续执行...');
      return;
    } catch (error) {
      logToBoth('error', '[企业微信] X 进入越秀地产悦秀会小程序失败: ' + error);
      throw error;
    }
  }

  // ========== 步骤3：进入项目详情（点击"我要推荐"） ==========

  private async enterProjectDetails(): Promise<void> {
    logToBoth('info', '[流程] 阶段五：进入项目详情');
    await zbbAutomation.delay(getDelay('other'));
    await this.checkAbort();

    try {
      // 获取屏幕尺寸
      const screenSize = await zbbAutomation.getScreenSize();

      // 先尝试文字匹配
      logToBoth('info', '[报备] 尝试点击"我要推荐"...');
      let clicked = await zbbAutomation.clickByText('我要推荐', false);

      // 如果文字匹配失败，使用坐标点击底部导航栏
      if (!clicked && screenSize && screenSize.width && screenSize.height) {
        logToBoth('warn', '[报备] 文字匹配失败，使用坐标点击"我要推荐"');
        // 底部导航栏"我要推荐"是第三个按钮
        const buttonX = screenSize.width * 0.50;
        const buttonY = screenSize.height * 0.92;
        clicked = await clickAtPosition(buttonX, buttonY);
        logToBoth('info', '[报备] 坐标点击: (' + buttonX.toFixed(0) + ', ' + buttonY.toFixed(0) + ')');
      }

      if (!clicked) {
        throw new Error('点击"我要推荐"按钮失败');
      }

      await zbbAutomation.delay(getDelay('other'));

      // 确认是否进入报备页面（节点树，非 OCR）
      logToBoth('info', '[报备] 检查是否进入报备页面...');
      const hasCustomerNameField = await this.checkScreenText('客户姓名', 3, '[报备]') ||
                                     await this.checkScreenText('姓名', 3, '[报备]');
      const hasPhoneField = await this.checkScreenText('客户电话', 3, '[报备]') ||
                            await this.checkScreenText('手机号', 3, '[报备]');

      if (hasCustomerNameField || hasPhoneField) {
        logToBoth('success', '[报备] 已进入报备页面');
      } else {
        logToBoth('warn', '[报备] 警告：可能未进入报备页面');
      }
    } catch (error) {
      logToBoth('error', '[报备] X 点击"我要推荐"失败: ' + error);
      throw error;
    }
  }

  // ========== 步骤4：输入第一条客户信息 ==========

  private async inputCustomerInfoFirst(record: { customer_name?: string; customer_phone?: string }): Promise<void> {
    logToBoth('info', '[流程] 阶段六：输入第一条客户信息');
    await this.checkAbort();

    try {
      const customerName = record.customer_name || '';
      const customerPhone = record.customer_phone || '';

      if (!customerName || !customerPhone) {
        throw new Error('客户信息不完整：姓名/电话为空');
      }

      await this.inputCustomerInfoFromRecord({ customerName, phone: customerPhone });
    } catch (error) {
      logToBoth('error', '[报备] X 输入客户信息失败: ' + error);
      throw error;
    }
  }

  /**
   * 从记录中输入客户信息（姓名 + 电话）
   */
  private async inputCustomerInfoFromRecord(record: { customerName: string; phone: string }): Promise<void> {
    const screenSize = await zbbAutomation.getScreenSize();

    // 步骤1: 输入客户姓名
    logToBoth('info', '[报备] 步骤1：输入客户姓名: ' + record.customerName);

    // 点击客户姓名输入框
    let clicked = await zbbAutomation.clickByText('客户姓名', false) ||
                  await zbbAutomation.clickByText('姓名', false);

    if (!clicked && screenSize) {
      // 坐标点击姓名输入框（约屏幕中间偏上位置）
      const nameInputX = screenSize.width * 0.5;
      const nameInputY = screenSize.height * 0.25;
      await clickAtPosition(nameInputX, nameInputY);
      clicked = true;
    }

    if (clicked) {
      await zbbAutomation.delay(500);
      await zbbAutomation.clearInput();
      await zbbAutomation.delay(200);
      await (zbbAutomation as any).inputText(record.customerName);
      await zbbAutomation.delay(getDelay('other'));
      logToBoth('success', '[报备] 姓名已输入');
    }

    // 步骤2: 输入客户电话
    logToBoth('info', '[报备] 步骤2：输入客户电话: ' + record.phone);

    // 点击客户电话输入框
    clicked = await zbbAutomation.clickByText('客户电话', false) ||
              await zbbAutomation.clickByText('手机号', false) ||
              await zbbAutomation.clickByText('电话', false);

    if (!clicked && screenSize) {
      // 坐标点击电话输入框（姓名输入框下方）
      const phoneInputX = screenSize.width * 0.5;
      const phoneInputY = screenSize.height * 0.35;
      await clickAtPosition(phoneInputX, phoneInputY);
      clicked = true;
    }

    if (clicked) {
      await zbbAutomation.delay(500);
      await zbbAutomation.clearInput();
      await zbbAutomation.delay(200);
      await (zbbAutomation as any).inputText(record.phone);
      await zbbAutomation.delay(getDelay('other'));
      logToBoth('success', '[报备] 电话已输入');
    }
  }

  // ========== 步骤5：选择第一个项目并提交 ==========

  private async submitFirstProject(): Promise<void> {
    logToBoth('info', '[流程] 阶段七：选择第一个项目并提交（第1个截图）');

    try {
      const screenSize = await zbbAutomation.getScreenSize();

      // 步骤1: 点击"报备项目"下拉
      logToBoth('info', '[报备1] 步骤1：点击"报备项目"下拉...');

      let clicked = await zbbAutomation.clickByText('报备项目', false) ||
                    await zbbAutomation.clickByText('报备项目：', false) ||
                    await zbbAutomation.clickByText('选择项目', false);

      if (!clicked && screenSize) {
        // 坐标点击项目下拉框
        const projectDropX = screenSize.width * 0.5;
        const projectDropY = screenSize.height * 0.45;
        await clickAtPosition(projectDropX, projectDropY);
        clicked = true;
      }

      await zbbAutomation.delay(getDelay('other'));

      // 步骤2: 选择第一个项目（郑州春月锦庐）
      logToBoth('info', '[报备1] 步骤2：选择第一个项目（郑州春月锦庐）...');

      clicked = await zbbAutomation.clickByText('郑州春月锦庐', false) ||
                await zbbAutomation.clickByText('春月锦庐', false) ||
                await zbbAutomation.clickByText('春月', false);

      if (!clicked) {
        // 如果下拉列表没有直接显示，先确认
        await zbbAutomation.clickByText('确定', false);
        await zbbAutomation.clickByText('确认', false);
        logToBoth('warn', '[报备1] 警告：项目选择可能需要手动确认');
      } else {
        logToBoth('success', '[报备1] 项目已选择');
      }

      await zbbAutomation.delay(getDelay('other'));

      // 步骤3: 点击"确认"
      logToBoth('info', '[报备1] 步骤3：点击"确认"...');
      await zbbAutomation.clickByText('确认', false);
      await zbbAutomation.delay(getDelay('other'));

      // 步骤4: 点击"全民经纪人推荐购房须知"
      logToBoth('info', '[报备1] 步骤4：点击"全民经纪人推荐购房须知"...');
      await zbbAutomation.clickByText('全民经纪人推荐购房须知', false);
      await zbbAutomation.delay(getDelay('other'));

      // 步骤5: 等待8秒后，点击"我已了解"
      logToBoth('info', '[报备1] 步骤5：等待8秒后，点击"我已了解"...');
      await zbbAutomation.delay(8000);
      await zbbAutomation.clickByText('我已了解', false);
      await zbbAutomation.delay(getDelay('other'));

      // 步骤6: 点击"立即推荐"
      logToBoth('info', '[报备1] 步骤6：点击"立即推荐"...');
      await zbbAutomation.clickByText('立即推荐', false);
      await zbbAutomation.delay(getDelay('other'));

      // 步骤7: 自动截图保存报备成功界面
      logToBoth('info', '[报备1] 步骤7：自动截图保存报备成功界面...');
      await this.captureAndSaveScreenshot('first_project');

      // 步骤8: 点击"确定"关闭弹窗
      logToBoth('info', '[报备1] 步骤8：点击"确定"关闭弹窗...');
      await zbbAutomation.clickByText('确定', false);
      await zbbAutomation.clickByText('确认', false);
      await zbbAutomation.delay(getDelay('other'));

      logToBoth('success', '[报备1] 第一项目报备完成');
    } catch (error) {
      logToBoth('error', '[报备1] X 报备失败: ' + error);
      throw error;
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 自动截图并保存（保留原 OCR/截图 调用，老板 06-23 指示后续处理）
   */
  private async captureAndSaveScreenshot(type: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').substring(0, 15);
      const filename = `${timestamp}_${type}.png`;

      const screenshot = await zbbAutomation.takeScreenshot();
      if (screenshot) {
        this.screenshotPaths.push(screenshot);
        logToBoth('success', '[截图] 已保存: ' + filename);
        await zbbAutomation.showToast('截图已保存: ' + filename);
      } else {
        logToBoth('warn', '[截图] 截图失败');
      }

      return filename;
    } catch (error) {
      logToBoth('error', '[截图] 截图异常: ' + error);
      return '';
    }
  }

  /**
   * 检查屏幕上是否包含指定文字（节点树，非 OCR）
   * @param targetText 目标文字
   * @param maxRetries 最大重试次数
   * @param stepPrefix 日志前缀
   */
  private async checkScreenText(targetText: string, maxRetries: number = 2, stepPrefix?: string): Promise<boolean> {
    const logPrefix = stepPrefix || '[节点树]';

    for (let i = 0; i < maxRetries; i++) {
      try {
        const startTime = Date.now();
        const treeString = await zbbAutomation.dumpWindowTreeString();
        const nodesTime = Date.now() - startTime;

        const allTexts = parseTextNodesFromTree(treeString);

        logToBoth('info', `${logPrefix} 识别到 ${allTexts.length} 个文字，耗时 ${nodesTime}ms`);

        const found = allTexts.includes(targetText) ||
                      allTexts.some(text => text.includes(targetText) || targetText.includes(text));

        if (found) {
          logToBoth('info', `${logPrefix} 找到: ${targetText}`);
          return true;
        }

        logToBoth('warn', `${logPrefix} 未找到"${targetText}"，重试 ${i + 1}/${maxRetries}`);
        await zbbAutomation.delay(500);
      } catch (error) {
        logToBoth('warn', `${logPrefix} 节点树获取失败: ${error}`);
        await zbbAutomation.delay(500);
      }
    }

    logToBoth('warn', `[节点树] ✗ 未能找到: ${targetText}`);
    return false;
  }
}

export const yuexiuService = YuexiuService.getInstance();
export { YuexiuService };