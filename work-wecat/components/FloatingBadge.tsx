/**
 * FloatingBadge 悬浮角标组件
 * 版本: v1.0
 * 
 * 功能：
 * - 悬浮在屏幕角落的按钮
 * - 用于在后台运行时提供停止操作
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';

interface FloatingBadgeProps {
  visible: boolean;
  onStop: () => void;
}

export default function FloatingBadge({ visible, onStop }: FloatingBadgeProps) {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [visible, scaleAnim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.button}
        onPress={onStop}
        activeOpacity={0.8}
      >
        <View style={styles.iconContainer}>
          <View style={styles.stopIcon}>
            <View style={styles.stopIconInner} />
          </View>
        </View>
        <Text style={styles.buttonText}>停止 ZBB</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 9999,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF4444',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    marginRight: 8,
  },
  stopIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIconInner: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#FF4444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
