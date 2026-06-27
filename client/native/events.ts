// client/native/events.ts
// 原生模块事件监听（v2 重构 W6 拆出）
// 来源：native/index.ts L1517-1644

import { NativeEventEmitter, type EmitterSubscription } from 'react-native';
import type { QianjiMessagePayload } from './types';

let ZBBAutomationRef: any = null;

export function setZBBAutomationRef(ref: any): void {
  ZBBAutomationRef = ref;
}

// 事件发射器单例
let eventEmitter: NativeEventEmitter | null = null;

// 活跃的监听器列表
const activeListeners: EmitterSubscription[] = [];

function getEventEmitter(): NativeEventEmitter | null {
  if (!ZBBAutomationRef) {
    return null;
  }
  if (!eventEmitter) {
    eventEmitter = new NativeEventEmitter(ZBBAutomationRef);
  }
  return eventEmitter;
}

/**
 * 监听自动化停止事件（用户点悬浮窗停止按钮触发）
 */
export const addStopListener = (callback: () => void): EmitterSubscription | null => {
  const emitter = getEventEmitter();
  if (!emitter) {
    console.error('[ZBB] 无法添加停止监听器，模块未初始化');
    return null;
  }
  const subscription = emitter.addListener('onAutomationStopped', () => {
    console.log('[ZBB] 收到停止事件');
    callback();
  });
  activeListeners.push(subscription);
  return subscription;
};

/**
 * 监听截图确认事件
 */
export const addScreenshotConfirmedListener = (callback: () => void): EmitterSubscription | null => {
  const emitter = getEventEmitter();
  if (!emitter) {
    console.error('[ZBB] 无法添加截图确认监听器，模块未初始化');
    return null;
  }
  const subscription = emitter.addListener('onScreenshotConfirmed', () => {
    console.log('[ZBB] 收到截图确认事件');
    callback();
  });
  activeListeners.push(subscription);
  return subscription;
};

/**
 * 监听千机消息事件（方案 1 + 方案 2 双保险）
 */
export const addQianjiMessageListener = (
  callback: (payload: QianjiMessagePayload) => void
): EmitterSubscription | null => {
  const emitter = getEventEmitter();
  if (!emitter) {
    console.error('[ZBB] 无法添加千机消息监听器，模块未初始化');
    return null;
  }
  const subscription = emitter.addListener('QianjiMessageReceived', (payload: QianjiMessagePayload) => {
    console.log('[ZBB] 收到千机消息:', payload);
    callback(payload);
  });
  activeListeners.push(subscription);
  return subscription;
};

export const removeQianjiMessageListener = (subscription: EmitterSubscription | null): void => {
  if (subscription) {
    subscription.remove();
    const index = activeListeners.indexOf(subscription);
    if (index > -1) {
      activeListeners.splice(index, 1);
    }
  }
};

export const removeStopListener = (subscription: EmitterSubscription | null): void => {
  if (subscription) {
    subscription.remove();
    const index = activeListeners.indexOf(subscription);
    if (index > -1) {
      activeListeners.splice(index, 1);
    }
  }
};
