/**
 * ZBB 坐标校准页面
 * 版本: v3.0
 * 
 * 功能：
 * - 在顶部显示操作引导
 * - 用户自行操作后，APP自动记录点击坐标
 * - 完成校准后保存坐标
 * 
 * 使用说明：
 * 1. 步骤1：在企业微信工作台，点击"新绿城云"小程序
 * 2. 步骤2：在打开的小程序中，点击"我要推荐"按钮
 * 3. 校准完成
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { zbbAutomation } from '@/native';
import { CalibrationService } from '@/services';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 校准步骤定义
type CalibrationStep = 1 | 2 | 'complete';

interface StepConfig {
  step: CalibrationStep;
  title: string;
  instruction: string;
  subInstruction: string;
  targetApp: string;
}

const STEP_CONFIGS: StepConfig[] = [
  {
    step: 1,
    title: '校准步骤1',
    instruction: '请打开企业微信，点击"工作台"',
    subInstruction: '点击屏幕上的"新绿城云"小程序图标',
    targetApp: '企业微信',
  },
  {
    step: 2,
    title: '校准步骤2',
    instruction: '请点击小程序中的',
    subInstruction: '"我要推荐"按钮',
    targetApp: '新绿城云小程序',
  },
];

export default function CalibrationScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  
  // 状态
  const [currentStep, setCurrentStep] = useState<CalibrationStep>(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedCoords, setRecordedCoords] = useState<{ x: number; y: number }[]>([]);
  const [step1Coords, setStep1Coords] = useState<{ x: number; y: number } | null>(null);
  const [step2Coords, setStep2Coords] = useState<{ x: number; y: number } | null>(null);
  
  // 动画
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  
  // 初始化
  useEffect(() => {
    checkCalibrationStatus();
  }, []);
  
  // 检查校准状态
  const checkCalibrationStatus = async () => {
    try {
      const calibrationService = CalibrationService.getInstance();
      const data = await calibrationService.getCalibrationData();
      
      if (data.isCalibrated && data.greenCloud && data.recommendBtn) {
        setCurrentStep('complete');
        setStep1Coords({ x: data.greenCloud.x, y: data.greenCloud.y });
        setStep2Coords({ x: data.recommendBtn.x, y: data.recommendBtn.y });
      } else {
        setCurrentStep(1);
      }
    } catch (error) {
      console.error('检查校准状态失败:', error);
      setCurrentStep(1);
    }
  };
  
  // 开始记录点击
  const startRecording = useCallback(async () => {
    setIsRecording(true);
    setRecordedCoords([]);
    
    // 开始脉冲动画
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
    
    // 开始箭头动画
    Animated.loop(
      Animated.timing(arrowAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
    
    // 清除之前的点击历史
    await zbbAutomation.clearClickHistory();
    
    // 开始轮询检测点击
    const pollInterval = 500; // 每500ms检查一次
    const maxPolls = 60; // 最多30秒
    
    let pollCount = 0;
    
    const poll = async () => {
      if (!isRecording) return;
      
      pollCount++;
      if (pollCount > maxPolls) {
        stopRecording();
        Alert.alert('超时', '未检测到点击，请重试');
        return;
      }
      
      try {
        // 获取最近的点击坐标（5秒内）
        const result = await zbbAutomation.getRecentClick(5000);
        
        if (result.found && result.x !== undefined && result.y !== undefined) {
          // 记录点击坐标
          const newCoord = { x: result.x, y: result.y };
          setRecordedCoords(prev => [...prev, newCoord]);
          
          // 如果检测到多次点击，取最后一次
          if (pollCount >= 3) {
            stopRecording();
            handleClickRecorded(newCoord);
            return;
          }
        }
      } catch (error) {
        console.error('轮询检查点击失败:', error);
      }
      
      // 继续轮询
      setTimeout(poll, pollInterval);
    };
    
    poll();
  }, [isRecording, currentStep]);
  
  // 停止记录
  const stopRecording = useCallback(() => {
    setIsRecording(false);
    pulseAnim.stopAnimation();
    arrowAnim.stopAnimation();
    pulseAnim.setValue(1);
    arrowAnim.setValue(0);
  }, [pulseAnim, arrowAnim]);
  
  // 处理记录的点击
  const handleClickRecorded = useCallback(async (coords: { x: number; y: number }) => {
    try {
      const calibrationService = CalibrationService.getInstance();
      
      if (currentStep === 1) {
        // 保存步骤1的坐标
        await calibrationService.saveGreenCloudCoords(coords.x, coords.y);
        setStep1Coords(coords);
        
        Alert.alert(
          '坐标已记录',
          `点击坐标: (${Math.round(coords.x)}, ${Math.round(coords.y)})\n\n是否继续下一步？`,
          [
            { text: '取消', style: 'cancel' },
            { text: '下一步', onPress: () => {
              setCurrentStep(2);
              setRecordedCoords([]);
            }},
          ]
        );
      } else if (currentStep === 2) {
        // 保存步骤2的坐标
        await calibrationService.saveRecommendBtnCoords(coords.x, coords.y);
        setStep2Coords(coords);
        
        // 完成校准
        await calibrationService.completeCalibration();
        setCurrentStep('complete');
        
        Alert.alert(
          '校准完成！',
          `已保存的坐标:\n\n新绿城云: (${Math.round(coords.x)}, ${Math.round(coords.y)})\n\n可以返回首页启动自动化流程了。`,
          [
            { text: '确定', onPress: () => {} },
          ]
        );
      }
    } catch (error) {
      Alert.alert('错误', '保存坐标失败: ' + error);
    }
  }, [currentStep]);
  
  // 重置校准
  const resetCalibration = useCallback(async () => {
    Alert.alert(
      '确认重置',
      '确定要重置校准数据吗？这将删除已保存的坐标。',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '重置', 
          style: 'destructive',
          onPress: async () => {
            try {
              const calibrationService = CalibrationService.getInstance();
              await calibrationService.resetCalibration();
              await zbbAutomation.clearClickHistory();
              setCurrentStep(1);
              setStep1Coords(null);
              setStep2Coords(null);
              setRecordedCoords([]);
              Alert.alert('成功', '校准数据已重置');
            } catch (error) {
              Alert.alert('错误', '重置失败: ' + error);
            }
          }
        },
      ]
    );
  }, []);
  
  // 返回首页
  const handleGoBack = useCallback(() => {
    stopRecording();
    router.back();
  }, [router, stopRecording]);
  
  // 获取当前步骤配置
  const getCurrentStepConfig = (): StepConfig | null => {
    if (currentStep === 'complete') return null;
    return STEP_CONFIGS.find(c => c.step === currentStep) || null;
  };
  
  const stepConfig = getCurrentStepConfig();
  
  return (
    <Screen 
      backgroundColor={theme.backgroundRoot} 
      statusBarStyle={isDark ? 'light' : 'dark'}
    >
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        {/* 头部 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h2" color={theme.textPrimary}>
            坐标校准
          </ThemedText>
          <View style={{ width: 40 }} />
        </View>
        
        {/* 已完成状态 */}
        {currentStep === 'complete' && step1Coords && step2Coords && (
          <View style={styles.content}>
            <View style={[styles.successCard, { backgroundColor: '#10B98120' }]}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <FontAwesome6 name="check-circle" size={64} color="#10B981" />
              </Animated.View>
              <ThemedText variant="h2" color="#10B981" style={styles.successTitle}>
                校准已完成
              </ThemedText>
              
              <View style={[styles.coordCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={styles.coordRow}>
                  <FontAwesome6 name="th-large" size={20} color={theme.primary} />
                  <View style={styles.coordInfo}>
                    <Text style={[styles.coordLabel, { color: theme.textMuted }]}>新绿城云</Text>
                    <Text style={[styles.coordValue, { color: theme.textPrimary }]}>
                      ({Math.round(step1Coords.x)}, {Math.round(step1Coords.y)})
                    </Text>
                  </View>
                </View>
                
                <View style={[styles.divider, { backgroundColor: '#E5E7EB' }]} />
                
                <View style={styles.coordRow}>
                  <FontAwesome6 name="hand-pointer" size={20} color={theme.primary} />
                  <View style={styles.coordInfo}>
                    <Text style={[styles.coordLabel, { color: theme.textMuted }]}>我要推荐按钮</Text>
                    <Text style={[styles.coordValue, { color: theme.textPrimary }]}>
                      ({Math.round(step2Coords.x)}, {Math.round(step2Coords.y)})
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            
            <TouchableOpacity
              style={[styles.resetButton, { borderColor: '#FF4444' }]}
              onPress={resetCalibration}
            >
              <FontAwesome6 name="redo" size={16} color="#FF4444" />
              <Text style={[styles.resetButtonText, { color: '#FF4444' }]}>
                重置校准
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* 校准步骤 */}
        {stepConfig && (
          <View style={styles.content}>
            {/* 步骤指示器 */}
            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, currentStep === 1 && styles.stepDotActive]} />
              <View style={[styles.stepLine, currentStep === 2 && styles.stepLineActive]} />
              <View style={[styles.stepDot, currentStep === 2 && styles.stepDotActive]} />
            </View>
            
            {/* 引导卡片 */}
            <Animated.View 
              style={[
                styles.guideCard, 
                { backgroundColor: theme.backgroundDefault, transform: [{ scale: pulseAnim }] }
              ]}
            >
              {/* 步骤标题 */}
              <View style={[styles.stepBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.stepBadgeText}>{currentStep}</Text>
              </View>
              
              <ThemedText variant="h2" color={theme.textPrimary} style={styles.guideTitle}>
                {stepConfig.title}
              </ThemedText>
              
              {/* 动画箭头 */}
              <Animated.View 
                style={[
                  styles.arrowContainer,
                  {
                    opacity: arrowAnim,
                    transform: [{
                      translateY: arrowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-10, 10],
                      }),
                    }],
                  },
                ]}
              >
                <FontAwesome6 name="arrow-down" size={32} color={theme.primary} />
              </Animated.View>
              
              {/* 操作说明 */}
              <Text style={[styles.instruction, { color: theme.textPrimary }]}>
                {stepConfig.instruction}
              </Text>
              <Text style={[styles.subInstruction, { color: theme.primary }]}>
                {stepConfig.subInstruction}
              </Text>
              
              {/* 目标APP */}
              <View style={[styles.targetBadge, { backgroundColor: theme.primary + '20' }]}>
                <FontAwesome6 name="mobile-alt" size={14} color={theme.primary} />
                <Text style={[styles.targetText, { color: theme.primary }]}>
                  {stepConfig.targetApp}
                </Text>
              </View>
              
              {/* 已记录的坐标 */}
              {recordedCoords.length > 0 && (
                <View style={[styles.recordedCard, { backgroundColor: '#10B98120' }]}>
                  <FontAwesome6 name="check" size={16} color="#10B981" />
                  <Text style={[styles.recordedText, { color: '#10B981' }]}>
                    检测到点击: ({Math.round(recordedCoords[recordedCoords.length - 1].x)}, {Math.round(recordedCoords[recordedCoords.length - 1].y)})
                  </Text>
                </View>
              )}
            </Animated.View>
            
            {/* 操作按钮 */}
            {!isRecording ? (
              <TouchableOpacity
                style={[styles.recordButton, { backgroundColor: theme.primary }]}
                onPress={startRecording}
              >
                <FontAwesome6 name="dot-circle" size={24} color="#fff" />
                <Text style={styles.recordButtonText}>
                  开始监听点击
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.recordButton, { backgroundColor: '#FF4444' }]}
                onPress={stopRecording}
              >
                <FontAwesome6 name="stop" size={24} color="#fff" />
                <Text style={styles.recordButtonText}>
                  停止监听
                </Text>
              </TouchableOpacity>
            )}
            
            {/* 提示信息 */}
            <View style={[styles.tipCard, { backgroundColor: theme.backgroundDefault }]}>
              <FontAwesome6 name="info-circle" size={16} color={theme.textMuted} />
              <Text style={[styles.tipText, { color: theme.textMuted }]}>
                点击"开始监听"后，请返回{stepConfig.targetApp}进行操作
              </Text>
            </View>
            
            {/* 跳过上一步（仅步骤2） */}
            {currentStep === 2 && (
              <TouchableOpacity
                style={[styles.skipButton, { borderColor: theme.textMuted }]}
                onPress={() => {
                  Alert.alert(
                    '跳过步骤2',
                    '是否跳过步骤2？这将使用默认坐标。',
                    [
                      { text: '取消', style: 'cancel' },
                      { 
                        text: '跳过', 
                        onPress: async () => {
                          // 使用默认坐标
                          const defaultX = SCREEN_WIDTH * 0.5;
                          const defaultY = SCREEN_HEIGHT * 0.65;
                          await CalibrationService.getInstance().saveRecommendBtnCoords(defaultX, defaultY);
                          setStep2Coords({ x: defaultX, y: defaultY });
                          await CalibrationService.getInstance().completeCalibration();
                          setCurrentStep('complete');
                        }
                      },
                    ]
                  );
                }}
              >
                <Text style={[styles.skipButtonText, { color: theme.textMuted }]}>
                  使用默认坐标
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* 底部间距 */}
        <View style={{ height: insets.bottom + 20 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  
  // 步骤指示器
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  stepDotActive: {
    backgroundColor: '#4F46E5',
  },
  stepLine: {
    width: 60,
    height: 3,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#4F46E5',
  },
  
  // 引导卡片
  guideCard: {
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  stepBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepBadgeText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  guideTitle: {
    marginBottom: 16,
  },
  arrowContainer: {
    marginVertical: 16,
  },
  instruction: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  subInstruction: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  targetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  targetText: {
    fontSize: 14,
    fontWeight: '500',
  },
  recordedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  recordedText: {
    fontSize: 14,
    fontWeight: '500',
  },
  
  // 操作按钮
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 12,
    marginBottom: 16,
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  
  // 提示信息
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  
  // 跳过按钮
  skipButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  skipButtonText: {
    fontSize: 14,
  },
  
  // 完成状态
  successCard: {
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    marginTop: 16,
    marginBottom: 24,
  },
  coordCard: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coordInfo: {
    flex: 1,
  },
  coordLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  coordValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  
  // 重置按钮
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  resetButtonText: {
    fontSize: 14,
  },
});
