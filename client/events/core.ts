// client/events/core.ts
// V2 异步派发事件总线核心（v2 设计文档 §5.5 + W6 老板拍板）
// 来源：基于 RN 内置 DeviceEventEmitter 封装
// 目的：千机 Q5 dispatch 改 emitEvent，不再同步调 baoliService.execute()

import { DeviceEventEmitter, EmitterSubscription } from 'react-native';
import { logToBoth } from '@/services/AutomationLogger';

export type ZbbEventName = string;

export type ZbbEventPayload = Record<string, unknown>;

export type ZbbEventPayloadWithOptional = ZbbEventPayload | undefined;

export interface ZbbEventSubscription {
  name: ZbbEventName;
  subscription: EmitterSubscription | null;
}

/**
 * emitEvent() - 发布 V2 事件
 * @param name 事件名（约定 ON_<MODULE>_<ACTION>）
 * @param payload 事件数据
 */
export function emitEvent<T extends ZbbEventPayload = ZbbEventPayload>(
  name: ZbbEventName,
  payload?: T
): void {
  logToBoth('info', `[Event] emit ${name}${payload ? ' payload=' + JSON.stringify(payload) : ''}`);
  DeviceEventEmitter.emit(name, payload);
}

/**
 * onEvent() - 订阅 V2 事件
 * @param name 事件名
 * @param handler 处理函数（payload 透传）
 * @returns ZbbEventSubscription（含 subscription 用于反注册）
 */
export function onEvent<T extends ZbbEventPayload = ZbbEventPayload>(
  name: ZbbEventName,
  handler: (payload?: T) => void
): ZbbEventSubscription {
  const subscription = DeviceEventEmitter.addListener(name, (payload?: T) => {
    try {
      handler(payload);
    } catch (error) {
      logToBoth('error', `[Event] handler for ${name} threw: ${error}`);
    }
  });
  return { name, subscription };
}

/**
 * offEvent() - 取消订阅
 */
export function offEvent(sub: ZbbEventSubscription): void {
  sub.subscription?.remove();
}
