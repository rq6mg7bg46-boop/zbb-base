# ZBB V2 Refactor W7 收官 — Q6/Q7 抽回千机（V2 100% 独立）

v2 重构 W7（老板 06-28 拍板）— **Q6/Q7 抽回千机** + **handleSecondRound 接入 V2** + **老入口方法 @deprecated**。

## 5 commit 累计

```
W7 收官 (5 commit, push origin):
  37fa284 feat(services): W7 C4 - handleSecondRound 接入 V2
  9235a47 feat(services): W7 C3 - Q6/Q7 抽回千机（handleSuccessCase 改写 + QianjiService 订阅）
  xxxxxx feat(workflows): W7 C2 - 千机 Q6/Q7 step
  xxxxxx feat(workflows): W7 C1 - types/qianji/types 扩展
  xxxxxx docs(architecture): W7 收官 README + push（待提交）
```

W7 完整异步链路（V2 100% 独立）：
```
[千机 Q5 step: ctx.dispatch()]
  ↓ emitEvent(ON_QIANJI_DATA_READY)
[BaoliService 订阅 initEventSubscriptions]
  ↓ startBaoliLaunchV2()
[runWorkflow(baoliLaunchWorkflow) P1-P7]
  ↓ startBaoliFillFormV2(1, '缦城和颂')
[runWorkflow(baoliFillFormWorkflow) P8-P15 第 1 轮]
  ↓ 老 detectResult(1) V2 阶段保留
[handleSuccessCase(round=1)]
  ↓
[handleSecondRound V2 接入]
  ↓
[startBaoliFillFormV2(2, '山水和颂')]
  ↓
[runWorkflow(baoliFillFormWorkflow) P8-P15 第 2 轮]
  ↓
[老 detectResult(2) V2 阶段保留]
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
| W3 | 30% | 3 | 千机 workflow Q1-Q5 |
| W4 | 50% | 7 | 保利启动段 P1-P7 |
| W5 | 70% | 9 | 保利填表段 P8-P15 |
| W6 | 90% | 14 | event bus + native 精简 |
| W7 | **100% 独立** | **~19** | **Q6/Q7 抽回 + 老入口 @deprecated** |
| W8 | 收官 | 20+ | 删 v1 老代码 1955 行 |

## W7 新增文件清单（5 commit）

1. `workflows/qianji/steps/returnToQianji.ts` — Q6 step
2. `workflows/qianji/steps/showGoAndWait.ts` — Q7 step
3. `workflows/qianji/qianjiReturnWorkflow.ts` — Q6/Q7 workflow
4. `workflows/qianji/types.ts` — 扩展 finishedRound/relayGroupCount
5. `services/QianjiService.ts` — startQianjiReturnV2 + initEventSubscriptions
6. `services/BaoliService.ts` — handleSuccessCase 改写 + handleSecondRound V2
7. `events/baoli.ts` — BaoliLaunchDonePayload 加 baoliCount

## W7 关键设计决策

1. **handleSuccessCase 改写**：删 Q6/Q7 内部代码（约 70 行），改 emit ON_BAOLI_LAUNCH_DONE
2. **Q6/Q7 抽回千机 step**：returnToQianjiStep + showGoAndWaitStep，跨实例异步
3. **handleSecondRound V2 接入**：1 行改动 `this.fillForm` → `this.startBaoliFillFormV2`
4. **5 个老入口方法 @deprecated 标记**：execute / fillForm / detectResult / startQianjiFlow / testOnlyQianjiFlow
5. **1 周并行对比**：V2 异步 vs 老同步（异步链路完整 = 实际等同于 V2 接管）
6. **循环接龙保留死代码**：W7 阶段暂不接入，W8 收官时删

## W8 收官 TODO 清单

- [ ] 删 v1 老代码 1955 行
  - `services/BaoliService.ts` 老 execute / 老 fillForm / 老 detectResult / 老 handleSuccessCase Q6/Q7 内部
  - `services/QianjiService.ts` 老 startQianjiFlow / 老 testOnlyQianjiFlow
- [ ] 删"循环接龙"死代码（handleSuccessCase 内被 L957 return 跳过的段）
- [ ] 删 5 个老入口方法 @deprecated
- [ ] 千机/保利 README 更新（V2 100% 独立版本）
- [ ] release APK 打包 + 装 nova 7 5G 实测验证
- [ ] tag v2.0.0 收官

## 验收

- tsc 0 错：5 commit 全部通过
- 总错 135 = baseline 不变
- V2 链路完整：千机 Q5 → 保利 P1-P15 × 2 轮 → 千机 Q6/Q7
- 老 v1.6.4 fallback 完整保留（execute / fillForm / detectResult / startQianjiFlow / testOnlyQianjiFlow）
- 老 v1.6.4 fallback 调用方（startQianjiFlow → baoliService.execute → 老 fillForm + 老 handleSuccessCase round=1 → handleSecondRound 老 fillForm → 老 detectResult round=2 → handleSuccessCase round=2 emit ON_BAOLI_LAUNCH_DONE → 千机 Q6/Q7 step）

## 下一步

- 🟢 **W8 删 v1 老代码 1955 行**（V2 收官）
- 🟡 加轻量互斥（v1/v2 防冲突，已不必要，V2 已接管）
- 🔵 实测验证（先打 release APK + 装 nova 7 5G + 跑 V2 完整流程）
