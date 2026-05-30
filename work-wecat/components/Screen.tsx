import React, { useEffect, useState } from 'react';
import {
  Platform,
  StyleSheet,
  ScrollView,
  View,
  TouchableWithoutFeedback,
  Keyboard,
  ViewStyle,
  FlatList,
  SectionList,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets, Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

/**
 * # Screen 组件
 * 
 * 统一使用手动安全区管理 (padding)，支持沉浸式布局，解决 iOS/Android 状态栏一致性问题。
 */
interface ScreenProps {
  children: React.ReactNode;
  /** 背景色，默认 #fff */
  backgroundColor?: string;
  /** 状态栏样式 */
  statusBarStyle?: 'auto' | 'inverted' | 'light' | 'dark';
  /** 状态栏背景色 */
  statusBarColor?: string;
  /** 安全区控制 */
  safeAreaEdges?: Edge[];
  /** 自定义容器样式 */
  style?: ViewStyle;
}

export const Screen = ({
  children,
  backgroundColor = '#fff',
  statusBarStyle = 'dark',
  statusBarColor = 'transparent',
  safeAreaEdges = ['top', 'left', 'right', 'bottom'],
  style,
}: ScreenProps) => {
  const insets = useSafeAreaInsets();
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvent, () => setKeyboardShown(true));
    const s2 = Keyboard.addListener(hideEvent, () => setKeyboardShown(false));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  // 自动检测：若子树中包含 ScrollView/FlatList/SectionList，则认为页面自身处理滚动
  const isNodeScrollable = (node: React.ReactNode): boolean => {
    const isScrollableElement = (el: unknown): boolean => {
      if (!React.isValidElement(el)) return false;
      const element = el as React.ReactElement<any, any>;
      const t = element.type;
      if (t === Modal) return false;
      const props = element.props as Record<string, unknown> | undefined;
      const isHorizontal = !!(props && (props as any).horizontal === true);
      if ((t === ScrollView || t === FlatList || t === SectionList) && !isHorizontal) return true;
      const c: React.ReactNode | undefined = props && 'children' in props
        ? (props.children as React.ReactNode)
        : undefined;
      if (Array.isArray(c)) return c.some(isScrollableElement);
      return c ? isScrollableElement(c) : false;
    };
    if (Array.isArray(node)) return node.some(isScrollableElement);
    return isScrollableElement(node);
  };

  const childIsNativeScrollable = isNodeScrollable(children);

  // 解析安全区设置
  const hasTop = safeAreaEdges.includes('top');
  const hasBottom = safeAreaEdges.includes('bottom');
  const hasLeft = safeAreaEdges.includes('left');
  const hasRight = safeAreaEdges.includes('right');

  const wrapperStyle: ViewStyle = {
    flex: 1,
    backgroundColor,
    paddingTop: hasTop ? insets.top : 0,
    paddingLeft: hasLeft ? insets.left : 0,
    paddingRight: hasRight ? insets.right : 0,
    paddingBottom: hasBottom ? insets.bottom : 0,
  };

  return (
    <View style={wrapperStyle}>
      <StatusBar
        style={statusBarStyle}
        backgroundColor={statusBarColor}
        translucent
      />
      
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} enabled={Platform.OS !== 'web'}>
          <View style={[styles.innerContainer, style]}>
            {children}
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
