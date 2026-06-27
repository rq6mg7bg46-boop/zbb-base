# ZBB 千机 Workflow (v2 重构 W3)

千机端 Step 引擎工作流，替代 v1.6.4 QianjiService 手写 try/catch（786 行）。

## 目录结构

```
client/workflows/qianji/
├── types.ts                       QianjiContext 扩展（lastTextNodes/customerInfo/lastExitReason/baoliService）
├── utils.ts                       拟人化 + 解析工具（getDelay/humanTap/humanSwipeWithBounce/parseClipboardText/...）
├── qianjiCollectWorkflow.ts       4 步全流程（开 APP → 识别 → 找客户 → 跳保利）
├── qianjiCollectOnlyWorkflow.ts   3 步接龙（开 APP → 识别 → 找客户，不跳保利）
├── index.ts                       统一导出
└── steps/
    ├── open.ts                    stepOpenQianji（30 行）
    ├── recognize.ts               stepRecognizeInterface（94 行）
    ├── find.ts                    stepFindAndCollectCustomer（168 行，最复杂）
    └── jump.ts                    stepJumpToReportApp（32 行）
```

## 4 步业务流（v2 设计文档 §3 千机端）

```
1. openQianji             launchAppWithAmStart → delay openApp → maybePause
2. recognizeInterface     getAllTextNodes → 过滤 → 预检查待报备数量（3 次）
                          连续 0 → showToast + pressHome + lastExitReason='no_pending'
3. findCustomer           找"报备审核"（3 次滑动）→ 找"保利"（无则 Toast + 震动 + lastExitReason='no_baoli'）
                          转发 3 步：3-1 列表"转发" → 3-2 联系人"转发"（Y最大）→ 3-3 分享页"复制"
                          解析 lastTextNodes → customerInfo
4. jumpToReportApp        拟人化反应 → 同步调 baoliService.execute()
```

## GO 兜底配置

| 步骤 | action | 备注 |
|---|---|---|
| openQianji | **abort** | 启动失败用户手动开 |
| recognizeInterface | **abort** | 识别失败用户介入 |
| findCustomer | **continue** | 找不到不重试，继续等下次接龙 |
| jumpToReportApp | - | 关键路径无 GO 兜底（保留 v1.6.4 行为）|

## V2 接入（QianjiService V2 方法）

| 老方法 | 新方法 | 用途 |
|---|---|---|
| `startQianjiFlow()` | `startQianjiFlowV2()` | 跑全 4 步（监听触发） |
| `testOnlyQianjiFlow()` | `testOnlyQianjiFlowV2()` | 跑 3 步（接龙循环） |

老方法**完整保留**为 fallback（v1.6.4 release 并行 1 周对比）。

## 已知限制 / TODO

- baoliService: any（QianjiService ↔ BaoliService 循环引用，W6 引入 event bus 时收紧）
- jump 步骤同步调 baoliService.execute()（v1.6.4 老行为，W6 改为事件订阅）
- 4 步骤内部逻辑原样照搬（v1.6.4 release 行为兼容，不重写子流程）

## 验收

- tsc --noEmit workflows/ + services/ + engine/ = **0 错误**
- 总错 140 = baseline
- 千机端老代码 100% 不动

## 老板下一步

- 🟢 W4 迁保利端（BaoliService）→ 与 W3 模式一致
- 🟡 W6 native 精简（1651 → 500 行）
- 🔴 暂停，做新雅新享反馈邮件草稿

## 参考

- v2 设计文档 `docs/architecture/v2-design-2026-06-27.md` §3 + §5.5
- v1.6.4 老代码 `client/services/QianjiService.ts`（786 行）