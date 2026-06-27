# ZBB 千机 Workflow (v2 重构 W3 + 编号重构 B)

千机端 Step 引擎工作流 + 统一编号 + 下游派发抽象。

## 目录结构

```
client/workflows/qianji/
├── types.ts                       QianjiContext 扩展（customerInfo/lastTextNodes/lastExitReason/targetApp/dispatch）
├── utils.ts                       拟人化 + 解析工具（getDelay/humanTap/humanSwipeWithBounce/parseClipboardText/pGammaDelay）
├── qianjiCollec...[truncated]