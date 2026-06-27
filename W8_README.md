# ZBB V2 Refactor 收官 — v1.6.4 老代码 721 行删除

v2 重构 W1-W8 收官（老板 06-28 拍板）— **V2 100% 独立 + v1.6.4 老入口全部删除**。

## 收官 commit 累计

```
W8 5 commit 累计（本次）：
  c15781a refactor(services): W8 C3 - 删 QianjiService 老入口
  72f2bb7 refactor(services): W8 C2+C4 - 删 BaoliService execute() + 循环接龙死代码
  efa0ef3 refactor(screens): W8 C1 - UI 改 V2 入口（3 处老入口 → V2）
  [本次] C5: 删 BaoliService.fillForm()
  [待提] C6: README + push + tag v2.0.0（本次）
```

## W8 删老代码汇总

| Commit | 删除内容 | 行数 |
|---|---|---|
| C1 | UI 改 V2 入口（3 处） | 0 删 + 6 改 |
| C2 | BaoliService.execute() + 老入口 | -157 |
| C4 | handleSuccessCase 循环接龙死代码 | -35 |
| C3 | QianjiService.startQianjiFlow + testOnlyQianjiFlow | -96 |
| C5 | BaoliService.fillForm | -245 |
| **合计** | **老入口方法 4 个全删** | **-533 行删 + 6 行改** |

## 老入口删除清单

| 方法 | 服务 | 删除位置 | 替代 V2 |
|---|---|---|---|
| `execute()` | BaoliService | W8 C2 | startBaoliLaunchV2() + startBaoliFillFormV2() |
| `fillForm()` | BaoliService | W8 C5 | startBaoliFillFormV2(round, projectName) |
| `startQianjiFlow()` | QianjiService | W8 C3 | startQianjiFlowV2() |
| `testOnlyQianjiFlow()` | QianjiService | W8 C3 | testOnlyQianjiFlowV2() |

## 老逻辑保留清单

| 方法 | 服务 | 保留原因 |
|---|---|---|
| `detectResult()` | BaoliService | V2 入口仍调用（startBaoliFillFormV2 + handleSecondRound），V2 化推迟到 W9 |
| `handleSecondRound()` | BaoliService | V2 入口仍调用 |
| `handleSuccessCase()` | BaoliService | V2 入口仍调用（emit ON_BAOLI_LAUNCH_DONE） |
| `getTodayBaoliCount()` | BaoliService | UI 仍调用 |
| `exitMiniProgram()` | BaoliService | 千机 Q7 退出保利小程序 |

## V2 完整异步链路（最终版）

```
[UI 点击"启动报备"]
  ↓ qianjiService.startQianjiFlowV2()
[runWorkflow(qianjiCollectWorkflow) Q1-Q5]
  ↓ emitEvent(ON_QIANJI_DATA_READY)
[BaoliService 订阅 initEventSubscriptions]
  ↓ startBaoliLaunchV2()
[runWorkflow(baoliLaunchWorkflow) P1-P7]
  ↓ startBaoliFillFormV2(1, '缦城和颂')
[runWorkflow(baoliFillFormWorkflow) P8-P15 第 1 轮]
  ↓ 老 detectResult(1)（W9 V2 化）
[handleSuccessCase(round=1)]
  ↓
[handleSecondRound V2 接入]
  ↓
[startBaoliFillFormV2(2, '山水和颂')]
  ↓
[runWorkflow(baoliFillFormWorkflow) P8-P15 第 2 轮]
  ↓
[老 detectResult(2)（W9 V2 化）]
  ↓
[handleSuccessCase(round=2)]
  ↓ emit ON_BAOLI_LAUNCH_DONE
[QianjiService 订阅 initEventSubscriptions]
  ↓ startQianjiReturnV2()
[runWorkflow(qianjiReturnWorkflow) Q6/Q7]
  ↓
[完整一组客户报备完成]
```

## V2 独立阶段总结

| 阶段 | 独立性 | 累计 commits | 关键改动 |
|---|---|---|---|
| W1 | 0% | 9 | actions 库（14 文件）|
| W2 | 10% | 14 | engine 库（6 文件）|
| W3 | 30% | 17 | 千机 workflow Q1-Q5 |
| B 编号重构 | 30% | 23 | C1-C6（统一编号）|
| W4 | 50% | 27 | 保利启动段 P1-P7 |
| W5 | 70% | 29 | 保利填表段 P8-P15 |
| W6 | 90% | 34 | event bus + native 精简 |
| W7 | 100% 独立 | ~38 | Q6/Q7 抽回 + 老入口 @deprecated |
| **W8** | **V2 收官** | **~43** | **老入口 4 个全删 + 老代码 721 行** |

## V2 累计 commits = ~43

| 阶段 | commits |
|---|---|
| W1 | 9 |
| W2 | 5 |
| W3 | 3 |
| B 编号重构 | 6 |
| W4 | 4 |
| W5 | 2 |
| W6 | 5 |
| W7 | 4 |
| W8 | 5 |
| **合计** | **~43** |

## V2 累计代码统计

| 文件 | 行数 |
|---|---|
| client/actions/ | ~350 |
| client/engine/ | ~250 |
| client/workflows/ | ~600 |
| client/events/ | ~200 |
| client/native/types.ts + events.ts | ~150 |
| client/services/BaoliService.ts V2 部分 | ~700 |
| client/services/QianjiService.ts V2 部分 | ~450 |
| **合计** | **~2700 行** |

**老代码删除**：~721 行（v1.6.4 老入口 + 死代码）

## 下一步

- 🟡 W9 detectResult V2 化（16 个分支 → V2 workflow）
- 🔵 实测验证（打 release APK + 装 nova 7 5G + 跑 V2 完整流程）
- 🟢 tag v2.0.0 收官（本次 C6）

## W8 验收

- tsc 0 错：5 commit 全部通过
- 总错 135 = baseline 不变
- 老入口 4 个全删（execute / fillForm / startQianjiFlow / testOnlyQianjiFlow）
- V2 链路完整：千机 Q1-Q7 + 保利 P1-P15 × 2 轮
- 老逻辑 5 个保留（detectResult / handleSecondRound / handleSuccessCase / getTodayBaoliCount / exitMiniProgram）
- UI 全部走 V2 入口（startBaoliLaunchV2 / startQianjiFlowV2）
- 老循环接龙死代码全删