/**
 * QianjiActionCountdown - 千机端 8 秒倒计时浮窗
 *
 * 2026-06-21 老板拍板方案 A：
 * - 千机收到消息 8 秒后自动启动流程（替代原 5 秒硬延迟）
 * - 8 秒内弹底部浮窗让出控制权
 * - 倒计时走完没点 = 沉默即同意 = 自动开
 * - 点"让小的歇会" = 持久化 cooldown 3 分钟
 * - 点"立即干活" = 立即开
 * - 点背景 = 同沉默（视为同意）
 *
 * 拟人化：图标 hammer/vial（沿用 zbb-automation 偏好，禁 home/building）
 *        + 倒计时进度条 + 情绪话术副标题
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logToBoth } from '@/services/AutomationLogger';

interface Props {
  visible: boolean;
  totalSeconds?: number; // 默认 8（2026-06-21 老板拍）
  onGo: () => void; // 立即干活 / 沉默同意
  onSkip: () => void; // 让小的歇会
  onClose: () => void; // 外部主动关（沉默 = 沉默即同意）
}

export function QianjiActionCountdown({
  visible,
  totalSeconds = 8,
  onGo,
  onSkip,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [remaining, setRemaining] = useState(totalSeconds);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastVisibleRef = useRef(visible);

  // 显隐动画 + 重置倒计时
  useEffect(() => {
    const justOpened = visible && !lastVisibleRef.current;
    lastVisibleRef.current = visible;
    if (visible && justOpened) {
      setRemaining(totalSeconds);
    }
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 250 : 200,
      useNativeDriver: true,
    }).start();
  }, [visible, totalSeconds, fadeAnim]);

  // 倒计时：每秒减 1；归零触发 onGo（沉默即同意）
  useEffect(() => {
    if (!visible) return;
    if (remaining <= 0) {
      logToBoth('info', '[千机浮窗] 倒计时归零，沉默即同意 → 自动开');
      onGo();
      return;
    }
    const id = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, visible, onGo]);

  if (!visible) return null;

  const progress = ((totalSeconds - remaining) / totalSeconds) * 100;

  // 副标题按阶段变化（拟人化话术）
  let subtitle = '📱 有新客户要报备啦';
  let subtitleEmoji = '🔔';
  if (remaining <= 2) {
    subtitle = '🚀 准备就绪，马上开工';
    subtitleEmoji = '🚀';
  } else if (remaining <= 5) {
    subtitle = '⚡ 马上要开工啦';
    subtitleEmoji = '⚡';
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.overlay, { opacity: fadeAnim }]}
    >
      {/* 背景遮罩（点背景 = 沉默 = onClose，8 秒后组件自然 onGo） */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
      >
        {/* 标题行 */}
        <View style={styles.titleRow}>
          <FontAwesome6 name="bell-concierge" size={22} color="#F59E0B" />
          <Text style={styles.title}>
            小主，{remaining} 秒后开始干活
          </Text>
        </View>

        {/* 进度条 */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        {/* 副标题（情绪话术，按阶段变） */}
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitleEmoji}>{subtitleEmoji}</Text>
          <Text style={styles.subtitle}>{subtitle.replace(/^[^ ]+ /, '')}</Text>
        </View>

        {/* 按钮行 */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.skipButton]}
            onPress={() => {
              logToBoth('info', '[千机浮窗] 用户点"让小的歇会"');
              onSkip();
            }}
            activeOpacity={0.7}
          >
            <FontAwesome6 name="mug-hot" size={18} color="#6B7280" />
            <Text style={styles.skipText}>让小的歇会</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.goButton]}
            onPress={() => {
              logToBoth('info', '[千机浮窗] 用户点"立即干活"');
              onGo();
            }}
            activeOpacity={0.7}
          >
            <FontAwesome6 name="hammer" size={18} color="#FFFFFF" />
            <Text style={styles.goText}>立即干活</Text>
          </TouchableOpacity>
        </View>

        {/* 底部小提示 */}
        <Text style={styles.hint}>
          不想动？小主不点就当同意啦 ~
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  subtitleEmoji: {
    fontSize: 14,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  skipButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  skipText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  goButton: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  goText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
  },
});
