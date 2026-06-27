# ZBB 保利 Workflow (v2 重构 W4 + 编号重构 B)

保利端 Step 引擎工作流 + 统一编号 + 启动段 P1-P7 迁 workflow。

## 目录结构

```
client/workflows/baoli/
├── types.ts                       BaoliContext（baoliService/lastExitReason/round）
├── utils.ts                       拟人化 + 延时工具（getDelay/humanTap/pGammaDelay/humanSwipeWithBounce/BAOLI_DELAY_CONFIG）
├── baoliLaunchWorkflow.ts         7 步启动 workflow（P1-P7）
├── index.ts                       统一导出
└── steps/
    ├── home.ts                    P1 pressHomeToDesktopStep
    ├── launch.ts                  P2 launchWechatWorkStep
    ├── workbench.ts               P3 tapWorkbenchStep
    ├── cloudHome.ts               P4 findCloudHomeStep
    ├── findProject.ts             P5 findProjectStep
    ├── enterForm.ts               P6 enterFormStep
    └── clickReport.ts             P7 clickReportStep
```

## 7 步启动业务流（v2 设计文档 §3 保利端）

```
P1 pressHomeToDesktopStep       按 Home 键退出到桌面
P2 launchWechatWorkStep         识别桌面企业微信图标 + 启动（兜底 launchAppWithMonkey）
P3 tapWorkbenchStep             点击"工作台"（兜底坐标 540,199）
P4 findCloudHomeStep            上滑 3 次 + 找"云和家经纪云"（兜底坐标 668,1502）
P5 findProjectStep              3 次 find 找"郑州保利山水和颂"（兜底坐标 810,1440）
P6 enterFormStep                进入填表流程（打印界面 + 准备 P7）
P7 clickReportStep              点击"报备"（兜底坐标 700,2200 + 4s 后打印界面）
```

## V2 接入（BaoliService V2 方法）

| 老方法 | 新方法 | 用途 |
|---|---|---|
| `execute()` | `startBaoliLaunchV2()` | 跑 P1-P7 启动段（V2 workflow）+ 复用老 fillForm + detectResult |

老 `execute()` **完整保留**为 v1.6.4 fallback（1 周并行对比，W8 删除）。

## V2 启动段架构

```
[BaoliService.startBaoliLaunchV2()]
  ↓
[buildBaoliContext()] → BaoliContext (ctx.baoliService = this)
  ↓
[runWorkflow(baoliLaunchWorkflow, ctx)]
  ↓ P1-P7 走 baoliLaunchWorkflow (V2 engine)
  ↓
[this.fillForm()]  ← 老方法，v1.6.4 保留
  ↓
[this.detectResult()]  ← 老方法
  ↓
[handleSuccessCase / handleFailCase / handleRepeatCase]
  ↓
[完成 / GO 按钮 / 重试]
```

## 与 W3 千机 V2 接入差异

| 项 | W3 千机 | W4 保利 |
|---|---|---|
| V2 跑几步 | 4（千机本来就 4 步）| 7（启动段）+ 老 fillForm + detectResult |
| workflow 文件 | 2（qianjiCollect + qianjiCollectOnly）| 1（baoliLaunchWorkflow）|
| step 文件 | 4 | 7 |
| 跨版本复用 | 无 | 复用老 fillForm + detectResult |
| 老方法保留 | startQianjiFlow() + testOnlyQianjiFlow() | execute() 完整保留 |

## GO 兜底配置

| 步骤 | action | 备注 |
|---|---|---|
| P1 pressHomeToDesktop | **abort** | Home 键失败用户介入 |
| P2 launchWechatWork | **abort** | 启动失败用户介入 |
| P3 tapWorkbench | **continue** | 未找到用兜底坐标继续 |
| P4 findCloudHome | **continue** | 未找到用兜底坐标继续 |
| P5 findProject | **continue** | 未找到用兜底坐标继续 |
| P6 enterForm | - | 仅 printScreenText |
| P7 clickReport | **continue** | 未找到用兜底坐标继续 |

## 已知限制 / TODO

- ctx.baoliService: any（QianjiService ↔ BaoliService 循环引用，W6 类型收紧）
- P3-P7 通过 ctx.baoliService 调 this.findNodeByText / findExactNode / printScreenText（W5+ 拆到 actions 工具库）
- P8-P15 填表段 + P16 检测分支保留在 BaoliService 内部（W4 阶段不迁子流程）
- step 内部 try/catch → ActionResult 风格尚未展开（W4 阶段保留老 try/catch 行为到 V2 启动段外）

## 验收

- tsc --noEmit workflows/ + engine/ + services/BaoliService = **0 错误**
- 总错 140 = baseline
- 千机端老代码 100% 不动
- 保利端老 execute() 100% 不动（fallback）

## 累计 W1-W4-B 全部 commit（24 个）

| 阶段 | commits | 内容 |
|---|---|---|
| W1 | 9 | actions 库（14 文件）|
| W2 | 5 | engine 库（6 文件）|
| W3 | 3 | 千机 workflow（10 文件）|
| B 编号重构 | 6 | C1-C6 |
| W4 | 3 | 保利 workflow（11 文件 + 1 服务接入）|

## 老板下一步

- 🟢 **W5 保利 P8-P15 填表段迁 workflow**（与 W4 同款，8 步）
- 🟡 W6 event bus + native 精简（event bus 接入 + native 1651 → 500 行）
- 🔴 W7 抽回千机（Q6/Q7 从 BaoliService 抽到 QianjiService 或 orchestration layer）

## 参考

- v2 设计文档 `docs/architecture/v2-design-2026-06-27.md` §3 + §5.5
- v1.6.4 老代码 `client/services/BaoliService.ts`（1061 行，W4 阶段完整保留）
- W3 千机 workflow README `client/workflows/qianji/README.md`
