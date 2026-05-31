/**
 * 保利端自动化服务
 * 版本: v1.1
 * 
 * 独立于 NativeAutomationService，使用预置测试数据
 * 流程：打开企业微信 → 点击工作台 → 进入云和家经纪云 → 填写报备表单
 */

import { zbbAutomation } from '../native';
import { getAllBaoliReports, initDatabase, insertReport, updateReportStatus } from './DatabaseService';

const APP_PACKAGES = {
  WECHAT: 'com.tencent.wework',  // 企业微信
  WECHAT_MAIN_ACTIVITY: 'com.tencent.wework.ui.index.WwMainActivity',  // 企业微信主界面（完整路径）
};

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

// 辅助函数：生成随机延迟
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
  private currentCustomer: { company: string; name: string; phone: string; project: string; agent?: string; reportTime?: string; expectedVisitTime?: string } | null = null;
  private currentReportId: number | null = null; // 当前报备记录的数据库ID

  static getInstance(): BaoliService {
    if (!BaoliService.instance) {
      BaoliService.instance = new BaoliService();
    }
    return BaoliService.instance;
  }

  /**
   * 查找界面文字节点
   */
  private async findNodeByText(text: string): Promise<any | null> {
    const nodes = await zbbAutomation.getAllTextNodes();
    return nodes?.find((n: any) => n.text && n.text.includes(text));
  }

  /**
   * 查找精确匹配的文字节点
   */
  private async findExactNode(text: string): Promise<any | null> {
    const nodes = await zbbAutomation.getAllTextNodes();
    return nodes?.find((n: any) => n.text === text);
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
        await zbbAutomation.tap(wechatNode.centerX, wechatNode.centerY);
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
        await zbbAutomation.tap(workbenchNode.centerX, workbenchNode.centerY);
      } else {
        logToBoth('warn', '[步骤2] 未找到"工作台"，使用备用坐标 (540, 199)');
        await zbbAutomation.tap(540, 199);
      }

      await zbbAutomation.delay(randomDelay(2000, 3000));

      // ========== 步骤3：上滑4次 → 查找"云和家经纪云" ==========
      logToBoth('info', '[步骤3] 上滑查找"云和家经纪云"...');
      let found = false;
      for (let i = 0; i <5; i++) {
        const node = await this.findNodeByText('云和家经纪云');
        if (node) {
          logToBoth('success', '[步骤3] 找到"云和家经纪云" @ (' + node.centerX + ', ' + node.centerY + ')');
          await zbbAutomation.tap(node.centerX, node.centerY);
          found = true;
          break;
        }
        // 上滑
        await zbbAutomation.swipe(540, 1800, 540, 600, 800);
        await zbbAutomation.delay(1500);
      }

      if (!found) {
        logToBoth('warn', '[步骤3] 未找到"云和家经纪云"，使用备用坐标 (668, 1502)');
        await zbbAutomation.tap(668, 1502);
      }

      await zbbAutomation.delay(randomDelay(8000, 10000));

      // ========== 步骤X：从数据库读取待报备客户数据 ==========
      await initDatabase();
      const pendingReports = await getAllBaoliReports();
      if (pendingReports.length === 0) {
        logToBoth('error', '[步骤X] 数据库中没有待报备记录，请先从抖音端采集客户信息');
        return { success: false, error: '数据库无待报备记录' };
      }
      const record = pendingReports[0];
      logToBoth('info', '[步骤X] 从数据库读取: ' + record.customer_name + ' ' + record.customer_phone);

      // 转换数据库格式以匹配表单
      this.currentCustomer = {
        company: record.company_name || '贝壳',
        name: record.customer_name,
        phone: record.customer_phone,
        project: record.report_project,
        agent: record.agent_name || '',
        reportTime: record.report_submit_time || '',
        expectedVisitTime: record.expected_visit_time || '',
      };

      // ========== 步骤：打印界面 ==========
      await this.printScreenText();

      // ========== 步骤4：点击"郑州保利山水和颂" ==========
      logToBoth('info', '[步骤4] 点击"郑州保利山水和颂"...');
      const projectNode = await this.findExactNode('郑州保利山水和颂');
      if (projectNode) {
        logToBoth('success', '[步骤4] 找到 @ (' + projectNode.centerX + ', ' + projectNode.centerY + ')');
        await zbbAutomation.tap(projectNode.centerX, projectNode.centerY);
      } else {
        logToBoth('warn', '[步骤4] 未找到，使用固定坐标 (723, 1268)');
        await zbbAutomation.tap(723, 1268);
      }

      await zbbAutomation.delay(randomDelay(2000, 3000));

      // ========== 步骤5：点击"报备" ==========
      logToBoth('info', '[步骤5] 点击"报备"...');
      const baobeiNode = await this.findExactNode('报备');
      if (baobeiNode) {
        logToBoth('success', '[步骤5] 找到"报备" @ (' + baobeiNode.centerX + ', ' + baobeiNode.centerY + ')');
        await zbbAutomation.tap(baobeiNode.centerX, baobeiNode.centerY);
      } else {
        logToBoth('warn', '[步骤5] 未找到"报备"，使用备用坐标 (700, 2200)');
        await zbbAutomation.tap(700, 2200);
      }

      await zbbAutomation.delay(randomDelay(3000, 4000));

      // ========== 步骤6-22：填写表单 ==========
      await this.fillForm(this.currentCustomer!);

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
   * ========== 直接填表流程（传入数据，不读数据库）==========
   * 由 QianjiService 步骤5调用，实现千机→保利直传
   */
  async executeWithData(customerInfo: {
    customerName: string;
    phone: string;
    agent: string;
    city: string;
    reportTime: string;
    projectType: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }
    this.isRunning = true;

    try {
      logToBoth('info', '[保利直传] 启动保利端填表流程...');

      // 构造 currentCustomer 格式（与 execute() 从数据库读取的格式一致）
      const customerName = customerInfo.customerName || '';
      let customerGender = '';
      if (/[女士|小姐|太太]$/.test(customerName)) customerGender = '女';
      else if (/先生$/.test(customerName)) customerGender = '男';

      this.currentCustomer = {
        company: '贝壳',
        name: customerName,
        phone: customerInfo.phone,
        project: customerInfo.projectType === 'baoli' ? '保利' : '未知',
        agent: customerInfo.agent,
        reportTime: customerInfo.reportTime,
        expectedVisitTime: '',
      };

      logToBoth('info', '[保利直传] 客户: ' + this.currentCustomer.name + ' ' + this.currentCustomer.phone);
      logToBoth('info', '[保利直传] 经纪人: ' + this.currentCustomer.agent);
      logToBoth('info', '[保利直传] 城市: ' + customerInfo.city);

      // ========== 步骤1：按 Home 退出到桌面 ==========
      logToBoth('info', '[保利直传:步骤1] 按 Home 键退出到桌面...');
      await zbbAutomation.pressHomeKey();
      await zbbAutomation.delay(2000);

      // ========== 步骤2：识别桌面企业微信图标 ==========
      logToBoth('info', '[保利直传:步骤2] 识别桌面企业微信图标...');
      const wechatNode = await zbbAutomation.findNodeCenterByText('企业微信');
      if (wechatNode) {
        logToBoth('success', '[保利直传:步骤2] 找到"企业微信" @ (' + wechatNode.centerX + ', ' + wechatNode.centerY + ')');
        await zbbAutomation.tap(wechatNode.centerX, wechatNode.centerY);
      } else {
        logToBoth('error', '[保利直传:步骤2] 未在桌面找到"企业微信"图标，尝试直接启动');
        await zbbAutomation.launchAppWithMonkey(
          APP_PACKAGES.WECHAT,
          APP_PACKAGES.WECHAT_MAIN_ACTIVITY
        );
      }
      await zbbAutomation.delay(getDelay('openApp'));

      // ========== 步骤3：点击"工作台" ==========
      logToBoth('info', '[保利直传:步骤3] 点击"工作台"...');
      await zbbAutomation.delay(1000);
      const workbenchNode = await this.findNodeByText('工作台');
      if (workbenchNode) {
        await zbbAutomation.tap(workbenchNode.centerX, workbenchNode.centerY);
      } else {
        await zbbAutomation.tap(540, 199);
      }
      await zbbAutomation.delay(randomDelay(2000, 3000));

      // ========== 步骤4：上滑查找"云和家经纪云" ==========
      logToBoth('info', '[保利直传:步骤4] 上滑查找"云和家经纪云"...');
      let found = false;
      for (let i = 0; i < 5; i++) {
        const node = await this.findNodeByText('云和家经纪云');
        if (node) {
          logToBoth('success', '[保利直传:步骤4] 找到"云和家经纪云" @ (' + node.centerX + ', ' + node.centerY + ')');
          await zbbAutomation.tap(node.centerX, node.centerY);
          found = true;
          break;
        }
        await zbbAutomation.swipe(540, 1800, 540, 600, 800);
        await zbbAutomation.delay(1500);
      }
      if (!found) {
        logToBoth('warn', '[保利直传:步骤4] 未找到，使用备用坐标 (668, 1502)');
        await zbbAutomation.tap(668, 1502);
      }
      await zbbAutomation.delay(randomDelay(8000, 10000));

      // ========== 步骤5：打印界面 + 点击"报备" ==========
      await this.printScreenText();
      logToBoth('info', '[保利直传:步骤5] 点击"报备"...');
      const baobeiNode = await this.findExactNode('报备');
      if (baobeiNode) {
        await zbbAutomation.tap(baobeiNode.centerX, baobeiNode.centerY);
      } else {
        logToBoth('warn', '[保利直传:步骤5] 未找到"报备"，使用备用坐标 (700, 2200)');
        await zbbAutomation.tap(700, 2200);
      }
      await zbbAutomation.delay(randomDelay(3000, 4000));

      // ========== 步骤6-22：填写表单 ==========
      await this.fillForm(this.currentCustomer);

      // ========== 步骤25：检测结果分支 ==========
      await this.detectResult();

      logToBoth('success', '========================================');
      logToBoth('success', '       保利直传流程全部完成！');
      logToBoth('success', '========================================');
      return { success: true };

    } catch (error) {
      logToBoth('error', '========================================');
      logToBoth('error', '       保利直传流程失败: ' + error);
      logToBoth('error', '========================================');
      return { success: false, error: String(error) };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 填写报备表单
   */
  private async fillForm(customer: any): Promise<void> {
    // ========== 步骤7：复制客户信息到剪贴板 ==========
    logToBoth('info', '[步骤6] 复制客户信息到剪贴板...');
    const fullRecord = generateFullRecord(customer);
    logToBoth('info', '[步骤6] 客户: ' + customer.name + ', ' + customer.phone);
    await zbbAutomation.setClipboardText(fullRecord);

    // ========== 步骤7：长按"粘贴完整客户信息..." ==========
    logToBoth('info', '[步骤7] 长按"粘贴完整客户信息..."');
    await zbbAutomation.delay(1000);
    const pasteNode = await this.findNodeByText('粘贴完整客户信息');
    if (pasteNode) {
      logToBoth('success', '[步骤7 找到"粘贴完整客户信息" @ (' + pasteNode.centerX + ', ' + pasteNode.centerY + ')');
      logToBoth('info', '[步骤7] 长按2秒...');
      await zbbAutomation.longPress(pasteNode.centerX, pasteNode.centerY, 2000);
      await zbbAutomation.delay(1000);
      logToBoth('info', '[步骤7] 长按完成');
    } else {
      logToBoth('error', '[步骤7] 未找到"粘贴完整客户信息"');
    }

    // ========== 步骤8：点击粘贴 (130, 710) ==========
    logToBoth('info', '[步骤8] 点击粘贴 (130, 710)');
    await zbbAutomation.tap(130, 710);

    // ========== 步骤6.5：粘贴完成后写入数据库（客户基本信息）==========
    try {
      const name = customer.name;
      let gender = '';
      if (/[女士|小姐|太太]$/.test(name)) gender = '女';
      else if (/先生$/.test(name)) gender = '男';

      this.currentReportId = await insertReport(
        {
          customerName: name,
          customerGender: gender,
          customerPhone: customer.phone,
          reportProject: customer.project,
          agentName: customer.agent || '',
          reportSubmitTime: customer.reportTime || '',
          city: '',
        },
        'baoli'
      );
      logToBoth('success', '[步骤6.5] 数据库写入成功，ID=' + this.currentReportId);
    } catch (e: any) {
      logToBoth('error', '[步骤6.5] 数据库写入失败: ' + e);
    }

    // ========== 步骤9：点击"请选择分期" ==========
    logToBoth('info', '[步骤9] 点击"请选择分期"...');
    await this.printScreenText();
    const fenqiNode = await this.findNodeByText('请选择分期');
    if (fenqiNode) {
      logToBoth('success', '[步骤9] 找到"请选择分期" @ (' + fenqiNode.centerX + ', ' + fenqiNode.centerY + ')');
      await zbbAutomation.tap(fenqiNode.centerX, fenqiNode.centerY);
    } else {
      logToBoth('error', '[步骤9] 未找到"请选择分期"');
    }

    // ========== 步骤：等待2-3秒 ==========
    await zbbAutomation.delay(randomDelay(2000, 3000));

    // ========== 步骤：打印当前界面内容 ==========
    logToBoth('info', '打印当前界面内容...');
    await this.printScreenText();

    // ========== 步骤10：点击"郑州市三村杓袁7号地项目-保利缦城和颂【郑州保利和颂】" ==========
    logToBoth('info', '[步骤10] 选择报备项目...');
    await zbbAutomation.delay(randomDelay(2000, 3000));
    const projectNodes = await this.printScreenText();
    const targetProject = projectNodes?.find((n: any) => n.text && n.text.includes('郑州市三村杓袁7号地项目-保利缦城和颂[郑州保利和颂]'));
    if (targetProject) {
      logToBoth('success', '[步骤10] 找到"' + targetProject.text + '" @ (' + targetProject.centerX + ', ' + targetProject.centerY + ')');
      await zbbAutomation.tap(targetProject.centerX, targetProject.centerY);
    } else {
      logToBoth('warn', '[步骤10] 未找到目标项目，使用备用坐标 (540, 2000)');
      await zbbAutomation.tap(540, 2000);
    }

    // ========== 步骤11：点击"确认" ==========
    logToBoth('info', '[步骤11] 点击"确认"...');
    await zbbAutomation.delay(1000);
    const confirmNode = await this.findExactNode('确认');
    if (confirmNode) {
      logToBoth('success', '[步骤11] 找到"确认" @ (' + confirmNode.centerX + ', ' + confirmNode.centerY + ')');
      await zbbAutomation.tap(confirmNode.centerX, confirmNode.centerY);
    } else {
      logToBoth('warn', '[步骤11] 未找到"确认"，使用备用坐标 (950, 1500)');
      await zbbAutomation.tap(950, 1500);
    }

    // ========== 步骤12：智能识别 ==========
    logToBoth('info', '[步骤12] 点击"智能识别"...');
    await zbbAutomation.delay(randomDelay(3000, 4000));
    const zhinengNode = await this.findNodeByText('智能识别');
    if (zhinengNode) {
      logToBoth('success', '[步骤12] 找到"智能识别" @ (' + zhinengNode.centerX + ', ' + zhinengNode.centerY + ')');
      await zbbAutomation.tap(zhinengNode.centerX, zhinengNode.centerY);
    } else {
      logToBoth('warn', '[步骤12] 未找到"智能识别"，使用备用坐标 (910, 1100)');
      await zbbAutomation.tap(910, 1100);
    }

    // ========== 步骤13：点击"报备" ==========
    logToBoth('info', '[步骤13] 点击"报备"...');
    await zbbAutomation.delay(randomDelay(3000, 4000));
    await this.printScreenText();
    const finalBaobeiNode = await this.findExactNode('报备');
    if (finalBaobeiNode) {
      logToBoth('success', '[步骤13] 找到"报备" @ (' + finalBaobeiNode.centerX + ', ' + finalBaobeiNode.centerY + ')');
      await zbbAutomation.tap(finalBaobeiNode.centerX, finalBaobeiNode.centerY);
    } else {
      logToBoth('warn', '[步骤13] 未找到"报备"，使用备用坐标 (540, 2200)');
      await zbbAutomation.tap(540, 2200);
    }

    // ========== 步骤14：等待报备结果 ==========
    logToBoth('info', '[步骤14] 等待报备结果...');
    await zbbAutomation.delay(randomDelay(3000, 6000));

    
  }

  /**
   * 步骤15：检测报备结果分支
   */
  private async detectResult(): Promise<void> {
    logToBoth('info', '[步骤15] 检测报备结果...');
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
      await this.handleSuccessCase();
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
          await this.handleSuccessCase();
          return;
        }
        logToBoth('warn', '[步骤15-超时-重试] 第' + (i + 1) + '次重试，未检测到结果...');
      }
      logToBoth('warn', '[步骤15-超时] 30秒内未检测到结果，流程结束，保持当前界面');
    }
  }

  /**
   * 情况1：疑似重号处理
   */
  private async handleRepeatCase(): Promise<void> {
    logToBoth('info', '[步骤15-情况1] 疑似重号处理');

    // 1. 震动提醒用户
    logToBoth('info', '[步骤15-情况1-1] 震动提醒用户');
    await zbbAutomation.startPulseVibration();

    // 2. 显示提示
    await zbbAutomation.showToast('检测到疑似重号，请点击"取消"按钮');

    // 3. 等待用户点击"取消"按钮（最多30秒）
    logToBoth('info', '[步骤15-情况1-2] 等待用户点击"取消"按钮...');
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

    // 4. 停止震动
    logToBoth('info', '[步骤15-情况1-4] 停止震动');
    await zbbAutomation.stopVibration();

    // 5. 后台杀掉ZBB进程
    logToBoth('info', '[步骤15-情况1-5] 后台杀掉ZBB进程...');
    await zbbAutomation.killZbbProcess();
    await zbbAutomation.delay(2000);

    // 6. 重启企微/小程序，重新填写表单（最多重试2次）
    const maxRetries = 2;
    for (let retry = 1; retry <= maxRetries; retry++) {
      logToBoth('info', '[步骤15-情况1-重试] 第' + retry + '次重试...');

      // 重启企业微信
      await zbbAutomation.launchAppWithMonkey(
        APP_PACKAGES.WECHAT,
        APP_PACKAGES.WECHAT_MAIN_ACTIVITY
      );
      await zbbAutomation.delay(getDelay('openApp'));

      // 重新进入工作台
      const workbenchNode = await this.findNodeByText('工作台');
      if (workbenchNode) {
        await zbbAutomation.tap(workbenchNode.centerX, workbenchNode.centerY);
      }
      await zbbAutomation.delay(randomDelay(2000, 3000));

      // 上滑找到"云和家经纪云"
      let found = false;
      for (let i = 0; i < 5; i++) {
        const node = await this.findNodeByText('云和家经纪云');
        if (node) {
          await zbbAutomation.tap(node.centerX, node.centerY);
          found = true;
          break;
        }
        await zbbAutomation.swipe(540, 1800, 540, 600, 800);
        await zbbAutomation.delay(1500);
      }

      if (!found) {
        await zbbAutomation.tap(668, 1502);
      }

      await zbbAutomation.delay(randomDelay(8000, 10000));

      // 重新填写表单（使用 this.currentCustomer）
      if (this.currentCustomer) {
        await this.fillForm(this.currentCustomer);

        // 检测结果：成功则更新数据库并退出，重复则继续重试
        const resultNodes = await this.printScreenText();
        const isSuccess = resultNodes?.some((n) =>
          n.text.includes('报备成功') || n.text.includes('提交成功')
        );
        const isRepeat = resultNodes?.some((n) =>
          n.text.includes('疑似重号') || n.text.includes('重复')
        );

        if (isSuccess) {
          logToBoth('success', '[步骤15-情况1-重试成功] 重试后报备成功');
          await this.handleSuccessCase(1);
          return;
        }

        if (isRepeat && retry < maxRetries) {
          logToBoth('warn', '[步骤15-情况1-重试] 仍为重复，继续重试...');
          await zbbAutomation.killZbbProcess();
          await zbbAutomation.delay(2000);
          continue;
        }

        if (isRepeat && retry >= maxRetries) {
          logToBoth('error', '[步骤15-情况1-重试] 达到最大重试次数，标记为重复');
          if (this.currentReportId !== null) {
            await updateReportStatus(this.currentReportId, '重号');
            logToBoth('success', '[步骤15-情况1-重号] ID=' + this.currentReportId + ' status→重号');
          }
          if (this.currentCustomer) {
            await zbbAutomation.showToast('报备疑似重复，请人工处理');
          }
          await zbbAutomation.killZbbProcess();
          await zbbAutomation.delay(2000);
          return;
        }
      }

      break; // 已填完表单或无需继续
    }
  }

  /**
   * 情况2：报备成功处理
   */
  private async handleSuccessCase(round: number = 1): Promise<void> {
    logToBoth('info', '[步骤15-情况2] 报备成功处理（第' + round + '轮）');

    // 更新数据库状态为 done
    try {
      if (this.currentReportId !== null) {
        await updateReportStatus(this.currentReportId, 'done');
        logToBoth('success', '[步骤15-情况2-更新数据库] ID=' + this.currentReportId + ' status→done');
      } else {
        logToBoth('warn', '[步骤15-情况2-更新数据库] currentReportId 为空，跳过');
      }
    } catch (e) {
      logToBoth('error', '[步骤15-情况2-更新数据库] 失败: ' + e);
    }

    // 上滑屏幕50像素
    logToBoth('info', '[步骤15-情况2-0] 报备成功处理-截图');
    await zbbAutomation.swipe(540, 1200, 540, 800);

    // 1. 查找"上传附件"位置
    const attachNodes = await this.printScreenText();
    const attachNode = attachNodes?.find((n) => n.text.includes('上传附件'));

    if (attachNode) {
      logToBoth('success', '[步骤15-情况2-1] 找到"上传附件" @ (' + attachNode.centerX + ', ' + attachNode.centerY + ')');
      await zbbAutomation.tap(attachNode.centerX + 500, attachNode.centerY);
    } else {
      logToBoth('warn', '[步骤15-情况2-1] 未找到"上传附件"，使用兜底坐标 (970, 1240)');
      await zbbAutomation.tap(970, 1240);
    }

    // 2. 等待3-4秒
    await zbbAutomation.delay(randomDelay(3000, 4000));

    // 3. 截图保存
    try {
      const screenshotDir = '/sdcard/Pictures/ZBB/';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = screenshotDir + 'zbb_' + timestamp + '.png';
      const result = await zbbAutomation.screencapShellBase64(filePath);
      if (result) {
        logToBoth('success', '[步骤15-情况2-4] 截图已保存');
      } else {
        logToBoth('error', '[步骤15-情况2-4] 截图失败');
      }
    } catch (e) {
      logToBoth('error', '[步骤15-情况2-4] 截图失败: ' + e);
    }

    // 4. 按返回键回到报备界面
    await zbbAutomation.pressBack();
    await zbbAutomation.delay(1000);

    // 5. 第一轮报备成功后，执行第二轮报备（同一客户，第二项目：保利山水和颂）
    if (round === 1) {
      logToBoth('info', '[步骤15-情况2] 第一轮报备完成，开始第二轮...');
      await this.handleSecondRound();
    } else {
      // 6. 第二轮也完成，退出小程序及企微
      logToBoth('info', '[第二轮-完成] 两轮报备均完成，退出小程序...');
      await this.exitMiniProgram();
    }
  }

  /**
   * 情况2第二轮：重新填写表单
   */
  async handleSecondRound(): Promise<void> {
    await zbbAutomation.delay(randomDelay(2000, 3000));

    // 点击"报备"
    const formNodes2 = await this.printScreenText();
    const baobeiNode2 = formNodes2?.find((n) => n.text === '报备');
    if (baobeiNode2) {
      await zbbAutomation.tap(baobeiNode2.centerX, baobeiNode2.centerY);
    } else {
      await zbbAutomation.tap(700, 2200);
    }

    await zbbAutomation.delay(randomDelay(3000, 4000));

    // 复制客户信息
    await zbbAutomation.setClipboardText(generateFullRecord(this.currentCustomer!));

    // 长按"粘贴完整客户信息"
    const pasteNodes = await this.printScreenText();
    const pasteNode = pasteNodes?.find((n) => n.text.includes('粘贴完整客户信息'));
    if (pasteNode) {
      await zbbAutomation.longPress(pasteNode.centerX, pasteNode.centerY, 2000);
      await zbbAutomation.delay(1000);
    }

    // 点击粘贴
    await zbbAutomation.tap(130, 710);

    // 点击"请选择分期"
    const fenqiNodes = await this.printScreenText();
    const fenqiNode = fenqiNodes?.find((n) => n.text === '请选择分期' || n.text === '分期');
    if (fenqiNode) {
      await zbbAutomation.tap(fenqiNode.centerX, fenqiNode.centerY);
    }

    await zbbAutomation.delay(randomDelay(2000, 3000));

    // 选择项目
    const projectNodes = await this.printScreenText();
    const projectNode = projectNodes?.find((n) => n.text.includes('郑州市三村杓袁7号地项目-保利山水和颂'));
    if (projectNode) {
      await zbbAutomation.tap(projectNode.centerX, projectNode.centerY);
    } else {
      await zbbAutomation.tap(540, 2150);
    }

    // 点击"确认"
   logToBoth('info', ' 点击"确认"...');
    await zbbAutomation.delay(1000);
    const confirmNode = await this.findExactNode('确认');
    if (confirmNode) {
      logToBoth('success', '找到"确认" @ (' + confirmNode.centerX + ', ' + confirmNode.centerY + ')');
      await zbbAutomation.tap(confirmNode.centerX, confirmNode.centerY);
    } else {
      logToBoth('warn', '未找到"确认"，使用备用坐标 (950, 1500)');
      await zbbAutomation.tap(950, 1500);
    }

    // 点击"智能识别"
    await zbbAutomation.delay(1000);
    const zhinengNodes = await this.printScreenText();
    const zhinengNode = zhinengNodes?.find((n) => n.text.includes('智能识别'));
    if (zhinengNode) {
      await zbbAutomation.tap(zhinengNode.centerX, zhinengNode.centerY);
    } else {
      await zbbAutomation.tap(910, 1100);
    }

    await zbbAutomation.delay(randomDelay(3000, 4000));

    // 点击"报备"
    const baobeiNodes2 = await this.printScreenText();
    const baobeiNodeFinal = baobeiNodes2?.find((n) => n.text === '报备');
    if (baobeiNodeFinal) {
      await zbbAutomation.tap(baobeiNodeFinal.centerX, baobeiNodeFinal.centerY);
    } else {
      await zbbAutomation.tap(540, 2200);
    }

    await zbbAutomation.delay(randomDelay(3000, 6000));

    // ========== 复制 handleSuccessCase 的代码 ==========
    // 上滑屏幕50像素
    logToBoth('info', '[第二轮-情况2] 报备成功处理-截图');
    await zbbAutomation.swipe(540, 1200, 540, 800);

    // 1. 查找"上传附件"位置
    const attachNodes = await this.printScreenText();
    const attachNode = attachNodes?.find((n) => n.text.includes('上传附件'));

    if (attachNode) {
      logToBoth('success', '[第二轮-情况2-1] 找到"上传附件" @ (' + attachNode.centerX + ', ' + attachNode.centerY + ')');
      await zbbAutomation.tap(attachNode.centerX + 500, attachNode.centerY);
    } else {
      logToBoth('warn', '[第二轮-情况2-1] 未找到"上传附件"，使用兜底坐标 (970, 1240)');
      await zbbAutomation.tap(970, 1240);
    }

    // 2. 等待3-4秒
    await zbbAutomation.delay(randomDelay(3000, 4000));

    // 3. 截图保存
    try {
      const screenshotDir = '/sdcard/Pictures/ZBB/';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = screenshotDir + 'zbb_r2_' + timestamp + '.png';
      const result = await zbbAutomation.screencapShellBase64(filePath);
      if (result) {
        logToBoth('success', '[第二轮-情况2-4] 截图已保存');
      } else {
        logToBoth('error', '[第二轮-情况2-4] 截图失败');
      }
    } catch (e) {
      logToBoth('error', '[第二轮-情况2-4] 截图失败: ' + e);
    }

    // 4. 第二轮报备也成功，重试检测逻辑（等待第二轮"防截客中"）
    logToBoth('info', '[第二轮] 检测报备结果...');
    await zbbAutomation.delay(randomDelay(3000, 6000));
    const nodes2 = await this.printScreenText();
    const success2 = nodes2?.find((n) => n.text.includes('防截客中') || n.text.includes('已报备'));
    if (success2) {
      logToBoth('success', '[第二轮-情况2] 第二轮报备成功');
      await zbbAutomation.pressBack();
      await zbbAutomation.delay(1000);
      // 第二轮报备完成，退出小程序
      logToBoth('info', '[第二轮-完成] 两轮报备均完成，退出小程序...');
      await this.exitMiniProgram();
    } else {
      logToBoth('warn', '[第二轮] 未检测到第二轮报备成功，保持当前界面');
    }
  }

  /**
   * 退出小程序
   */
  async exitMiniProgram(): Promise<void> {
    await zbbAutomation.tap(300, 2300); // 多任务键
    await zbbAutomation.delay(1000);
    await zbbAutomation.tap(540, 2150); // 垃圾箱
    await zbbAutomation.delay(1000);
    await zbbAutomation.tap(540, 2300); // Home键
    await zbbAutomation.delay(1000);
  }
}

export const baoliService = BaoliService.getInstance();
