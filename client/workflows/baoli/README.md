# ZBB 保利 Workflow (v2 重构 W4 + W5 + 编号重构 B)

保利端 Step 引擎工作流 + 统一编号 + 启动段 P1-P7 + 填表段 P8-P15。

## 目录结构

```
client/workflows/baoli/
├── types.ts                       BaoliContext（12 字段：baoliService/lastExitReason/round/projectName/pasteNode/formNodes/9 字段/formFilled）
├── utils.ts                       拟人化 + 延时工具（getDelay/humanTap/pGammaDelay/humanSwipeWithBounce/BAOLI_DELAY_CONFIG）
├── baoliLaunchWorkflow.ts         7 步启动 workflow（P1-P7）
├── baoliFillFormWorkflow.ts       9 步填表 workflow（P8-P15，P9 拆 render + parse）
├── index.ts                       统一导出（2 workflow + 16 step）
├── README.md                      本文件
└── steps/
    ├── home.ts                    P1 pressHomeToDesktopStep
    ├── launch.ts                  P2 launchWechatWorkStep
    ├── workbench.ts               P3 tapWorkbenchStep
    ├── cloudHome.ts               P4 findCloudHomeStep
    ├── findProject.ts             P5 findProjectStep
    ├── enterForm.ts               P6 enterFormStep
    ├── clickReport.ts             P7 clickReportStep
    ├── paste.ts                   P8 pasteCustomerInfoStep
    ├── render.ts                  P9a waitForRenderStep
    ├── parse.ts                   P9b parseFormNodesStep
    ├── checkEntry.ts              P10 selectInstallmentStep
    ├── selectProject.ts           P11 selectProjectStep
    ├── confirm.ts                 P12 tapConfirmStep
    ├── aiRecognize.ts             P13 tapAiRecognizeStep
    ├── clickReportForm.ts         P14 tapReportFormStep
    └── waitResult.ts              P15 waitReportResultStep
```

## 16 步业务流（v2 设计文档 §3 保利端）

```
[启动段 baoliLaunchWorkflow]
P1 pressHomeToDesktopStep       按 Home 键退出到桌面
P2 launchWechatWorkStep         识别桌面企业微信图标 + 启动（兜底 launchAppWithMonkey）
P3 tapWorkbenchStep             点击"工作台"（兜底坐标 540,199）
P4 findCloudHomeStep            上滑 3 次 + 找"云和家经纪云"（兜底坐标 668,1502）
P5 findProjectStep              3 次 find 找"郑州保利山水和颂"（兜底坐标 810,1440）
P6 enterFormStep                进入填表流程（打印界面 + 准备 P7）
P7 clickReportStep              点击"报备"（兜底坐标 700,2200 + 4s 后打印界面）

[填表段 baoliFillFormWorkflow]
P8 pasteCustomerInfoStep        找输入框 + 长按 + tap 粘贴（兜底坐标长按 (450,800)）
P9a waitForRenderStep           等粘贴内容渲染（2000ms）+ 抓 formNodes
P9b parseFormNodesStep          解析 9 字段（公司/客户/性别/电话/项目/物业/报备时间/到访/经纪人）
P10 selectInstallmentStep       入口检测 isFormFilled + 点"请选择分期"（兜底 (580,640)）
P11 selectProjectStep           选报备项目（ctx.projectName = 缦城/山水和颂）
P12 tapConfirmStep              点"确认"（兜底 (950,1500)）
P13 tapAiRecognizeStep          点"智能识别"（pGammaDelay 2000-3000）
P14 tapReportFormStep           点"报备"（兜底 (540,2200)）
P15 waitReportResultStep        等报备结果（3-6 秒）

[结果段 P16 - 不在 workflow 内，BaoliService 保留]
P16 detectResult                报备结果分支（重号/成功/超时）
P16-情况1 handleRepeatCase      重号分支
P16-情况2 handleSuccessCase     成功分支（含 Q6/Q7 千机端步骤）
P16-超时 handleFailCase         超时分支
```

## V2 接入（BaoliService V2 方法）

| 老方法 | 新方法 | 用途 |
|---|---|---|
| `execute()` | `startBaoliLaunchV2()` | V2 启动段 + V2 填表 + 老 detectResult |
| `fillForm()` | `startBaoliFillFormV2(round, projectName)` | V2 填表 1 轮 P8-P15 |
| `handleSecondRound()` | （W7 接入 V2）| 第 2 轮填表（当前保留老 fillForm）|

老 `execute()` / `fillForm()` / `handleSecondRound()` **完整保留**为 v1.6.4 fallback（1 周并行对比，W8 删除）。

## V2 全流程架构

```
[BaoliService.startBaoliLaunchV2()]
  ↓
[buildBaoliContext(round=1, projectName=缦城和颂)] → BaoliContext
  ↓
[runWorkflow(baoliLaunchWorkflow, ctx)]
  ↓ P1-P7 走 baoliLaunchWorkflow (V2 engine)
  ↓
[startBaoliFillFormV2(1)]  ← V2 填表第 1 轮
  ↓ buildBaoliContext(round=1, projectName=缦城和颂)
  ↓
  ↓ [runWorkflow(baoliFillFormWorkflow, ctx)]
  ↓   P8 paste → P9a waitForRender → P9b parse
  ↓   P10 selectInstallment → P11 selectProject
  ↓   P12 confirm → P13 aiRecognize → P14 reportForm → P15 wait
  ↓
[detectResult()]  ← 老方法，v1.6.4 保留
  ↓
[handleSuccessCase()]  ← 老方法
  ↓
[handleSecondRound()]  ← 老方法，第 2 轮走老 fillForm（W7 接入 V2）
  ↓
[fillForm('山水和颂')]  ← 老方法，第 2 轮（W7 改为 V2）
  ↓
[detectResult(2)]  ← 老方法
  ↓
[完成 / GO 按钮 / 重试]
```

## 与 W3 千机 V2 接入差异

| 项 | W3 千机 | W5 保利 |
|---|---|---|
| V2 跑几步 | **4 步（千机本来就 4 步）** | **16 步（启动 7 + 填表 9）** |
| workflow 文件 | 2（qianjiCollect + qianjiCollectOnly）| **2**（baoliLaunch + baoliFillForm）|
| step 文件 | 4 | **16** |
| 第 2 轮填表 | 无（千机无接龙）| 老 handleSecondRound（V2 阶段不接入，W7 接入）|
| 老方法保留 | startQianjiFlow() + testOnlyQianjiFlow() | execute() + fillForm() + handleSecondRound() |

## GO 兜底配置（16 步）

| 步骤 | action | 备注 |
|---|---|---|
| P1 pressHomeToDesktop | **abort** | Home 键失败用户介入 |
| P2 launchWechatWork | **abort** | 启动失败用户介入 |
| P3 tapWorkbench | **continue** | 未找到用兜底坐标继续 |
| P4 findCloudHome | **continue** | 未找到用兜底坐标继续 |
| P5 findProject | **continue** | 未找到用兜底坐标继续 |
| P6 enterForm | - | 仅 printScreenText |
| P7 clickReport | **continue** | 未找到用兜底坐标继续 |
| P8 pasteCustomerInfo | **continue** | 兜底坐标长按 + handlePasteFailure |
| P9a waitForRender | - | 静默等渲染 |
| P9b parseFormNodes | - | 解析（仅 log）|
| P10 selectInstallment | **continue** | 未找到用兜底坐标继续 |
| P11 selectProject | **continue** | 未找到用兜底坐标继续 |
| P12 tapConfirm | **continue** | 未找到用兜底坐标继续 |
| P13 tapAiRecognize | **continue** | 未找到用兜底坐标继续 |
| P14 tapReportForm | **continue** | 未找到用兜底坐标继续 |
| P15 waitReportResult | - | 仅 delay 3-6s |

## 已知限制 / TODO

- ctx.baoliService: any（QianjiService ↔ BaoliService 循环引用，W6 类型收紧）
- P3-P15 通过 ctx.baoliService 调 this.findNodeByText / findExactNode / printScreenText / handlePasteFailure / isFormFilledSilent（W6 拆到 actions 工具库）
- P16 detectResult + handleRepeat/Success/Fail + handleSecondRound 保留在 BaoliService 内部
- handleSecondRound W5 阶段保留老 fillForm()（W7 接入 V2：startBaoliFillFormV2(2, '山水和颂')）

## 验收

- tsc --noEmit workflows/ + engine/ + services/BaoliService = **0 错误**
- 总错 140 = baseline
- 老 BaoliService.execute() / fillForm() / handleSecondRound() 100% 不动
- 千机端老代码 100% 不动

## 累计 W1-W5-B 全部 commit（~30 个）

| 阶段 | commits | 内容 |
|---|---|---|
| W1 | 9 | actions 库（14 文件）|
| W2 | 5 | engine 库（6 文件）|
| W3 | 3 | 千机 workflow（10 文件）|
| B 编号重构 | 6 | C1-C6（千机 + 保利统一编号）|
| W4 | 3 + 1 README = 4 | 保利 workflow 启动段（11 文件）|
| W5 | 2 + 1 注释 + 1 README = 4 | 保利 workflow 填表段（12 文件）|
| **合计** | **~30** | **~6800 行** |

## 老板下一步

- 🟢 **W6 event bus + native 精简**（异步派发 + native 1651 → 500 行）
- 🟡 W7 抽回千机（Q6/Q7 跨端抽离）+ handleSecondRound 接入 V2
- 🔵 加轻量互斥（方案 1 配套的 v1/v2 互斥保护）

## 参考

- v2 设计文档 `docs/architecture/v2-design-2026-06-27.md` §3 + §5.5
- v1.6.4 老代码 `client/services/BaoliService.ts`（1061 行，W5 阶段完整保留）
- W3 千机 workflow README `client/workflows/qianji/README.md`
