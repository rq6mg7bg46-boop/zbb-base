// client/events/index.ts
// V2 事件总线统一导出（W6 引入）

export { emitEvent, onEvent, offEvent } from './core';
export type { ZbbEventName, ZbbEventPayload, ZbbEventSubscription } from './core';

export { QIANJI_EVENTS } from './qianji';
export type { QianjiDataReadyPayload, QianjiHasCustomerPayload } from './qianji';

export { BAOLI_EVENTS } from './baoli';
export type { BaoliLaunchDonePayload } from './baoli';
