/**
 * 顶部状态栏组件
 * 显示当前操作内容和进度
 */

/* eslint-disable react-hooks/refs */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { automationEngine, FlowPhase, StepInfo, LogEntry } from '@/services/AutomationEngine';

interface StatusBarProps {
  visible?: boolean;
}

export function StatusBar({ visible = true }: StatusBarProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [currentStep, setCurrentStep] = useState<StepInfo | null>(null);
  const [currentPhase, setCurrentPhase] = useState<FlowPhase>('idle');
  const [status, setStatus] = useState<string>('就绪');
  const [progress, setProgress] = useState<number>(0);
  
  const fadeAnim = React.useRef(new Animated.Value(0));
  
  // 监听流程事件
  useEffect(() => {
    const unsubStarted = automationEngine.addListener((event) => {
      if (event.type === 'started') {
        setStatus('运行中');
        Animated.timing(fadeAnim.current, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    });
    
    const unsubStep = automationEngine.addListener((event) => {
      if (event.type === 'step_changed') {
        setCurrentStep(event.data.step);
        setCurrentPhase(event.data.step.phase);
        const steps = automationEngine.getSteps();
        const completed = steps.filter(s => s.completed).length;
        setProgress(Math.round((completed / steps.length) * 100));
      }
    });
    
    const unsubPhase = automationEngine.addListener((event) => {
      if (event.type === 'phase_changed') {
        setCurrentPhase(event.data.phase);
      }
    });
    
    const unsubStopped = automationEngine.addListener((event) => {
      if (event.type === 'stopped' || event.type === 'completed') {
        setStatus(event.type === 'completed' ? '已完成' : '已停止');
        Animated.timing(fadeAnim.current, {
          toValue: 0,
          duration: 300,
          delay: 2000,
          useNativeDriver: true,
        }).start();
      }
    });
    
    return () => {
      unsubStarted();
      unsubStep();
      unsubPhase();
      unsubStopped();
    };
  }, []);
  
  // 获取阶段名称
  const getPhaseName = useCallback((phase: FlowPhase): string => {
    const names: Record<FlowPhase, string> = {
      idle: '就绪',
      open_douyin: '打开抖音',
      find_message: '获取信息',
      open_wechat: '打开微信',
      search_xiaochengxu: '搜索小程序',
      enter_project: '进入项目',
      input_customer_1: '输入信息',
      select_project_1: '选择项目1',
      read_notice_1: '阅读须知1',
      input_customer_2: '输入信息',
      select_project_2: '选择项目2',
      read_notice_2: '阅读须知2',
      return_wechat: '返回微信',
      open_douyin_send: '发送截图',
      exit_douyin: '退出抖音',
      completed: '已完成',
      error: '错误',
      paused: '已暂停',
      stopped: '已停止',
    };
    return names[phase] || phase;
  }, []);
  
  // 获取状态颜色
  const getStatusColor = useCallback((currentStatus: string) => {
    switch (currentStatus) {
      case '运行中': return theme.primary;
      case '已暂停': return '#FFA500';
      case '已完成': return theme.success || '#10B981';
      case '已停止': return '#FF4444';
      default: return theme.textSecondary;
    }
  }, [theme]);
  
  if (!visible) return null;
  
  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          backgroundColor: theme.backgroundDefault,
          paddingTop: insets.top + 8,
          borderBottomColor: theme.border,
          opacity: fadeAnim.current,
        }
      ]}
    >
      {/* 状态指示器 */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
        <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
          {status}
        </Text>
        {currentStep && (
          <Text style={[styles.stepText, { color: theme.textMuted }]}>
            步骤 {currentStep.step}/38
          </Text>
        )}
      </View>
      
      {/* 当前操作 */}
      <View style={styles.operationRow}>
        <Text style={[styles.phaseText, { color: theme.textPrimary }]}>
          {getPhaseName(currentPhase)}
        </Text>
        {currentStep && (
          <Text style={[styles.descText, { color: theme.textMuted }]} numberOfLines={1}>
            {currentStep.name}
          </Text>
        )}
      </View>
      
      {/* 进度条 */}
      <View style={[styles.progressContainer, { backgroundColor: theme.backgroundTertiary }]}>
        <View 
          style={[
            styles.progressBar, 
            { 
              backgroundColor: theme.primary,
              width: `${progress}%`,
            }
          ]} 
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepText: {
    fontSize: 11,
    marginLeft: 'auto',
  },
  operationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  phaseText: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  descText: {
    fontSize: 13,
    flex: 1,
  },
  progressContainer: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});

export default StatusBar;
