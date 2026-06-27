# ZBB Actions 层 (v2 重构 W1)

v2 重构 Action 层 — 20 个原子动作的统一封装（2026-06-27）。

## 目录结构

```
client/actions/
├── types.ts          NodeTarget / ActionResult / ActionError 公共类型
├── _internal.ts      zbbAutomation 引用 + logAction 日志封装（不对外导出）
├── delay.ts          delay / gammaDelay / randomDelay（3 个）
├── find.ts           findText / findAllText / findExactNode / findNodeCenter / getAllTextNodes（5 个）
├── tap.ts            tap / tapWithRetry（2 个）
├── longpress.ts      longPress（1 个）
├── input.ts          inputText / pasteFromClipboard（2 个）
├── swipe.ts          swipe / scrollUp / scrollDown（3 个）
├── app.ts            openApp / backToHome / closeApp / pressBack（4 个）
├── vibrate.ts        pulseVibration / cancelVibration / vibrateShort（3 个）
├── maybePause.ts     maybePause（1 个）
├── showToast.ts      showToast（1 个）
├── clipboard.ts      readClipboard / writeClipboard（2 个，备用）
├── screenshot.ts     takeScreenshot / saveScreenshot（2 个，备用）
└── index.ts          统一导出
```

## 设计原则（v2 设计文档 §P1 + §P2）

- **P1 唯一出口**：所有 Action 副作用通过 `zbbAutomation` 唯一出口，禁止直接调 `ZBBAutomation`
- **P1 拟人化**：tap/longPress 默认抖动 ±5px / swipe 用 ease-in-out cubic / maybePause 泊松分布
- **P1 错误透明**：`ActionError` 类型化错误，不静默失败（GO 按钮机制 W5 兜底）
- **P2 类型安全**：`ActionResult<T>` 统一格式，`{ok, data?, error?}` 三态

## 关键依赖

- `native/index.ts` — `zbbAutomation` 唯一出口
- `services/AutomationLogger.ts` — `logToBoth` 全局日志通道
- `utils/deviceModel.ts` — `getPasteMenuCoord` 机型分支（W6 计划迁 `adapters/devices.ts`）

## 迁移路径（v2.0 W3-W4）

| v1.6.4 散落代码 | v2 Action |
| --- | --- |
| `BaoliService.findNodeByText` | `findText` |
| `BaoliService.findExactNode` | `findExactNode` |
| `humanTap(x, y)` | `tap({kind:'coord', x, y})` |
| 写剪贴板 + 长按 + 机型分支点击 三步 | `pasteFromClipboard` |
| `humanSwipe` (10 段 ease-in-out) | `swipe` |
| 步骤 1 pressHomeKey × 2 | `backToHome()` × 2 |
| 步骤 13 zbbAutomation.showToast | `showToast(msg, true)` |
| 步骤 13 30S 循环震动 | `pulseVibration(30000)` |

## 单测（W7 任务）

- actions/ 层单测覆盖率目标 ≥40%
- 关键 Action 优先：pasteFromClipboard / pulseVibration / maybePause
- jest 配置已就绪（client/package.json）

## 关联文档

- v2 设计文档：`docs/architecture/v2-design-2026-06-27.md` §5.2 Action 层
- W1 commit 链：refactor/v2 877282a → e88be58（8 个 commit）