# ZBB 保利端情况二问题与解决方案记录

> 最后更新时间：2026-05-05

---

## 一、情况二流程概述

情况二（报备成功）是指第一轮报备成功后，需要进行三轮操作：
1. 第一轮截图
2. 第二轮重新填写表单
3. 第三轮再次截图退出

---

## 二、问题与解决方案记录

### 问题1：第二轮长按操作无日志提示

**问题描述**：
- 第一轮步骤11有"长按2秒..."和"长按完成"的日志提示
- 第二轮步骤5的长按操作没有这些日志提示
- 执行时无法确认长按操作是否正常执行

**解决方案**：
- 在第二轮步骤5中添加与第一轮一致的日志提示
- 添加 `await zbbAutomation.delay(1000)` 等待1秒

**修改前代码**：
```typescript
if (pasteNode) {
  logToBoth('info', `[保利端] 找到"粘贴完整客户信息..." @ (${pasteNode.centerX}, ${pasteNode.centerY})`);
  await zbbAutomation.longPress(pasteNode.centerX, pasteNode.centerY, 2000);
} else {
  logToBoth('error', '[保利端] 情况2第二轮步骤5：未找到"粘贴完整客户信息..."');
}
```

**修改后代码**：
```typescript
if (pasteNode) {
  logToBoth('info', `[保利端] 找到"粘贴完整客户信息..." @ (${pasteNode.centerX}, ${pasteNode.centerY})`);
  // 长按2秒
  logToBoth('info', '[保利端] 情况2第二轮步骤5：长按2秒...');
  await zbbAutomation.longPress(pasteNode.centerX, pasteNode.centerY, 2000);
  // 等待1秒
  await zbbAutomation.delay(1000);
  logToBoth('info', '[保利端] 情况2第二轮步骤5：长按完成');
} else {
  logToBoth('error', '[保利端] 情况2第二轮步骤5：未找到"粘贴完整客户信息..."');
}
```

---

### 问题2：第二轮步骤9点击项目名称不准确

**问题描述**：
- 最初代码只查找"保利山水和颂"文本
- 实际界面上的完整文本是"郑州市三村杓袁7号地项目-保利山水和颂【郑州保利山水和颂】"
- 查找到的坐标可能不准确

**解决方案**：
- 修改查找文本为"郑州市三村杓袁7号地项目-保利山水和颂"
- 添加兜底坐标 `(540, 2159)`

**修改前代码**：
```typescript
logToBoth('info', '[保利端] 情况2第二轮步骤9：点击"保利山水和颂"');
const stageNodes = await this.debugPrintScreenText();
const stageNode = stageNodes?.find((n: any) => 
  n.text && n.text.includes('保利山水和颂')
);
if (stageNode) {
  logToBoth('info', `[保利端] 找到"郑州保利山水和颂" @ (${stageNode.centerX}, ${stageNode.centerY})`);
  await zbbAutomation.tap(stageNode.centerX, stageNode.centerY);
} else {
  logToBoth('error', '[保利端] 情况2第二轮步骤9：未找到"保利山水和颂"');
}
```

**修改后代码**：
```typescript
logToBoth('info', '[保利端] 情况2第二轮步骤9：点击"郑州市三村杓袁7号地项目-保利山水和颂"');
const stageNodes = await this.debugPrintScreenText();
const stageNode = stageNodes?.find((n: any) => 
  n.text && n.text.includes('郑州市三村杓袁7号地项目-保利山水和颂')
);
if (stageNode) {
  logToBoth('info', `[保利端] 找到"郑州市三村杓袁7号地项目-保利山水和颂【郑州保利山水和颂】" @ (${stageNode.centerX}, ${stageNode.centerY})`);
  await zbbAutomation.tap(stageNode.centerX, stageNode.centerY);
} else {
  // 兜底：点击固定坐标 (540, 2159)
  logToBoth('warn', '[保利端] 未找到完整项目名称，兜底点击 (540, 2159)');
  await zbbAutomation.tap(540, 2159);
}
```

---

### 问题3：第二轮流程步骤过多

**问题描述**：
- 最初第二轮设计了18个步骤
- 包含数据库读取、从剪贴板复制等操作
- 实际测试发现剪贴板内容已存在，不需要重新复制

**解决方案**：
- 删除前7步（等待、点击报备、打印界面、读取数据库、复制剪贴板等）
- 简化为与第一轮一致的表单填写流程（15步）

**最终确定的第二轮流程（15步）**：
1. 等待2-3秒
2. 点击"报备"
3. 等待3-4秒
4. 复制客户信息到剪贴板
5. 长按"粘贴完整客户信息..."
6. 点击粘贴
7. 点击"请选择分期"
8. 等待2-3秒
9. 点击"郑州市三村杓袁7号地项目-保利山水和颂"
10. 等待0-1秒
11. 点击"确认"
12. 等待1-2秒
13. 点击"智能识别"
14. 等待1-2秒
15. 点击"报备"

---

### 问题4：第三轮截图识别二维码不准确

**问题描述**：
- 最初使用ML Kit识别二维码
- 识别结果可能包含"更多"等无关元素
- 右侧Y值最小的二维码可能不是目标二维码

**解决方案**：
- 修改为与第一轮一致的逻辑：查找"上传附件"文字
- 点击"上传附件"右侧 `(x+500, y)`
- 兜底坐标 `(970, 1240)`

**修改前代码**：
```typescript
// 使用 ML Kit 识别当前界面二维码
logToBoth('info', '[保利端] 情况2第三轮步骤2：使用ML Kit识别当前界面二维码位置');
const screenshotPath = await zbbAutomation.screenshot();
const result = await zbbAutomation.mlkitScanQrCode(screenshotPath);
```

**修改后代码**：
```typescript
// 情况2第三轮步骤2：查找"上传附件"文字
logToBoth('info', '[保利端] 情况2第三轮步骤2：ML Kit识别"上传附件"');
const screenshotPath = await zbbAutomation.screenshot();
const uploadNodes = await zbbAutomation.mlkitOcr(screenshotPath);
const uploadNode = uploadNodes?.find((n: any) => 
  n.text && n.text.includes('上传附件')
);
if (uploadNode) {
  logToBoth('info', `[保利端] 找到"上传附件" @ (${uploadNode.centerX}, ${uploadNode.centerY})`);
  // 点击右侧区域 (x+500, y)
  const targetX = uploadNode.centerX + 500;
  const targetY = uploadNode.centerY;
  logToBoth('info', `[保利端] 情况2第三轮步骤3：点击"上传附件"右侧 @ (${targetX}, ${targetY})`);
  await zbbAutomation.tap(targetX, targetY);
} else {
  // 兜底：点击 (970, 1240)
  logToBoth('warn', '[保利端] 未找到"上传附件"，兜底点击 (970, 1240)');
  await zbbAutomation.tap(970, 1240);
}
```

---

## 三、调试日志规范

### 第一轮流程日志格式
```
[保利端] 步骤X：操作描述
[保利端] 找到"目标文字" @ (x, y)
[保利端] 长按2秒...
[保利端] 长按完成
```

### 情况二日志格式
```
[保利端] 情况2第一轮/二轮/三轮步骤X：操作描述
[保利端] 找到"目标文字" @ (x, y)
[保利端] 情况2第X轮步骤X：具体操作
```

---

## 四、关键坐标汇总

| 操作 | 坐标 | 说明 |
|------|------|------|
| 点击粘贴 | (130, 710) | 粘贴按钮位置 |
| 点击"请选择分期" | (520, 605) | 分期选择入口 |
| 点击"上传附件"右侧 | (x+500, y) | 上传附件按钮右侧 |
| 点击"上传附件"兜底 | (970, 1240) | 上传附件按钮兜底坐标 |
| 点击分期选项 | (540, 2159) | 分期选项固定位置 |
| 点击"确认" | (958, 1496) | 确认按钮位置 |
| 点击"智能识别" | (919, 1360) | 智能识别按钮位置 |
| 点击"报备" | (448, 2180) | 报备提交按钮位置 |
| 长按粘贴输入框 | 动态坐标 | "粘贴完整客户信息..."文本位置 |
| 长按时长 | 2000ms | 2秒 |

---

## 五、待优化项

1. **数据库操作**：当前 `execAsync` 存在 NullPointerException 问题，需后续修复
2. **状态更新**：情况二完成后暂不更新数据库状态
3. **图片保存验证**：需要确认截图是否成功保存到相册
