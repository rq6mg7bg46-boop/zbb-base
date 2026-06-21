/**
 * useCooldown - 让出控制权 cooldown 持久化 hook
 *
 * 2026-06-21 老板拍板方案 A：
 * 千机收到消息后弹倒计时浮窗；点"让小的歇会"后 cooldown 期内不再触发浮窗
 * 持久化到 AsyncStorage（重启 ZBB 仍尊重老板决定）
 *
 * 默认 3 分钟（2026-06-21 老板拍）
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COOLDOWN_KEY = '@zbb:qianji_cooldown_until';

/** 老板 2026-06-21 拍：cooldown 3 分钟 */
export const QIANJI_COOLDOWN_MINUTES_DEFAULT = 3;

export function useCooldown() {
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [remainingMs, setRemainingMs] = useState<number>(0);

  // 启动时读 storage
  useEffect(() => {
    AsyncStorage.getItem(COOLDOWN_KEY)
      .then((v) => {
        if (!v) return;
        const until = parseInt(v, 10);
        if (Number.isFinite(until) && until > Date.now()) {
          setCooldownUntil(until);
        } else {
          // 过期清掉
          AsyncStorage.removeItem(COOLDOWN_KEY);
        }
      })
      .catch(() => {
        // AsyncStorage 读取失败忽略，不影响功能
      });
  }, []);

  // 倒计时刷新（每秒）
  useEffect(() => {
    if (cooldownUntil <= 0) return;
    const tick = () => {
      const left = cooldownUntil - Date.now();
      if (left <= 0) {
        setCooldownUntil(0);
        setRemainingMs(0);
        AsyncStorage.removeItem(COOLDOWN_KEY).catch(() => {});
      } else {
        setRemainingMs(left);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const isInCooldown = useCallback(
    () => cooldownUntil > Date.now(),
    [cooldownUntil],
  );

  const setCooldown = useCallback(
    (minutes: number = QIANJI_COOLDOWN_MINUTES_DEFAULT) => {
      const until = Date.now() + minutes * 60 * 1000;
      setCooldownUntil(until);
      setRemainingMs(minutes * 60 * 1000);
      AsyncStorage.setItem(COOLDOWN_KEY, String(until)).catch(() => {});
    },
    [],
  );

  const clearCooldown = useCallback(() => {
    setCooldownUntil(0);
    setRemainingMs(0);
    AsyncStorage.removeItem(COOLDOWN_KEY).catch(() => {});
  }, []);

  return {
    isInCooldown,
    setCooldown,
    clearCooldown,
    remainingMs,
    cooldownUntil,
  };
}
