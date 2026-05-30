/**
 * OCR 功能使用示例
 * 
 * 本文件展示如何使用集成到 ZBB 主项目的 OCR 功能
 */

import ZBBAutomation from '@/native/ZBBAutomation';

/**
 * 示例 1: 查找"绿城云"小程序并点击
 * 
 * 这是流程中"下拉微信首页 → 查找绿城云 → 点击进入"的关键步骤
 */
async function findAndClickGreenCity() {
  // 截图并查找"绿城云"文字
  const result = await ZBBAutomation.screenshotAndFindText('绿城云');
  
  if (result.found) {
    console.log(`找到"绿城云"，坐标: (${result.x}, ${result.y})`);
    // 点击该坐标
    await ZBBAutomation.click(result.x!, result.y!);
    console.log('已点击"绿城云"');
  } else {
    console.error('未找到"绿城云"', result.error);
  }
}

/**
 * 示例 2: 识别屏幕上的所有文字
 */
async function recognizeAllText() {
  const results = await ZBBAutomation.recognizeScreen();
  
  console.log(`识别到 ${results.length} 个文字块:`);
  for (const item of results) {
    console.log(`  "${item.text}" @ (${item.centerX}, ${item.centerY}) 置信度: ${(item.confidence * 100).toFixed(1)}%`);
  }
  
  return results;
}

/**
 * 示例 3: 提取手机号和姓名
 * 
 * 在报备流程中，从抖音截图提取客户信息
 */
async function extractCustomerInfo() {
  const content = await ZBBAutomation.extractScreenContent('all');
  
  console.log('提取到的手机号:', content.phones);
  console.log('提取到的姓名:', content.names);
  console.log('所有文字:', content.allTexts);
  
  return {
    phone: content.phones?.[0] || '',
    name: content.names?.[0] || ''
  };
}

/**
 * 示例 4: 检查屏幕是否包含指定文字
 */
async function checkScreenContent() {
  // 检查是否显示"报备成功"
  const hasSuccess = await ZBBAutomation.ocrContainsText('报备成功');
  console.log('是否包含"报备成功":', hasSuccess);
  
  // 检查是否显示"我要报备"
  const hasReport = await ZBBAutomation.ocrContainsText('我要报备');
  console.log('是否包含"我要报备":', hasReport);
  
  return { hasSuccess, hasReport };
}

/**
 * 示例 5: 等待屏幕上出现指定文字
 */
async function waitForTextAppear() {
  const targetText = '报备成功';
  const timeout = 30000; // 30秒超时
  
  // 轮询检查直到找到或超时
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const found = await ZBBAutomation.ocrContainsText(targetText);
    if (found) {
      console.log(`找到"${targetText}"`);
      return true;
    }
    // 等待 1 秒再检查
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`未在 ${timeout}ms 内找到"${targetText}"`);
  return false;
}

/**
 * 示例 6: 在报备流程中查找"我要报备"按钮
 */
async function clickReportButton() {
  // 先查找"我要报备"按钮
  const result = await ZBBAutomation.screenshotAndFindText('我要报备');
  
  if (result.found) {
    console.log(`找到"我要报备"按钮 @ (${result.x}, ${result.y})`);
    
    // 点击该按钮
    await ZBBAutomation.click(result.x!, result.y!);
    console.log('已点击"我要报备"');
    
    // 等待页面切换
    await ZBBAutomation.delay(1500);
    return true;
  }
  
  console.error('未找到"我要报备"按钮');
  return false;
}

/**
 * 示例 7: 完整的微信小程序报备流程
 */
async function runWechatMiniProgramFlow() {
  console.log('=== 开始微信小程序报备流程 ===');
  
  // 步骤 1: 下拉微信首页
  console.log('步骤 1: 下拉微信首页');
  await ZBBAutomation.swipe(300, 800, 300, 200, 500);
  await ZBBAutomation.delay(500);
  
  // 步骤 2: 查找并点击"绿城云"
  console.log('步骤 2: 查找"绿城云"小程序');
  const greenCityResult = await ZBBAutomation.screenshotAndFindText('绿城云');
  
  if (greenCityResult.found) {
    console.log(`找到"绿城云" @ (${greenCityResult.x}, ${greenCityResult.y})`);
    await ZBBAutomation.click(greenCityResult.x!, greenCityResult.y!);
    console.log('已点击"绿城云"');
  } else {
    console.error('未找到"绿城云"，请手动操作');
    return false;
  }
  
  // 等待小程序加载
  console.log('等待小程序加载...');
  await ZBBAutomation.delay(3000);
  
  // 步骤 3: 查找并点击"我要报备"
  console.log('步骤 3: 查找"我要报备"');
  const reportResult = await ZBBAutomation.screenshotAndFindText('我要报备');
  
  if (reportResult.found) {
    console.log(`找到"我要报备" @ (${reportResult.x}, ${reportResult.y})`);
    await ZBBAutomation.click(reportResult.x!, reportResult.y!);
    console.log('已点击"我要报备"');
    return true;
  }
  
  console.error('未找到"我要报备"');
  return false;
}

/**
 * 示例 8: 识别底部导航栏
 * 
 * 用于确认当前在哪个页面
 */
async function checkBottomNav() {
  // 识别屏幕上的导航文字
  const navItems = ['首页', '客户', '消息', '我的'];
  const results = await ZBBAutomation.recognizeScreen();
  
  for (const item of navItems) {
    const found = results.some(r => r.text.includes(item));
    if (found) {
      console.log(`✓ 导航栏包含: ${item}`);
    }
  }
}
