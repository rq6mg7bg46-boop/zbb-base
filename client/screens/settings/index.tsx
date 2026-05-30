/**
 * ZBB 设置页面
 * 延时、项目配置
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { automationEngine, FlowConfig } from '@/services/AutomationEngine';

export default function SettingsScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  
  const [config, setConfig] = useState<FlowConfig>(() => automationEngine.getConfig());
  const [hasChanges, setHasChanges] = useState(false);
  
  // 更新配置
  const updateConfig = useCallback((path: string, value: any) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      const keys = path.split('.');
      let obj: any = newConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return newConfig;
    });
    setHasChanges(true);
  }, []);
  
  // 保存配置
  const handleSave = useCallback(() => {
    Alert.alert('成功', '配置已保存', [
      { text: '确定' }
    ]);
    setHasChanges(false);
  }, []);
  
  // 重置配置
  const handleReset = useCallback(() => {
    Alert.alert(
      '确认重置',
      '确定要恢复默认配置吗？',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '确定', 
          style: 'destructive',
          onPress: () => {
            // 重置为默认值
            setConfig({
              delays: {
                openApp: { min: 10000, max: 15000 },
                other: { min: 5000, max: 8000 },
                notice: { min: 8000, max: 8000 },
              },
              retries: {
                maxAttempts: 3,
                interval: 5000,
                timeout: 30000,
              },
              projects: {
                first: '郑州春月锦庐',
                second: '郑州湖畔雲庐',
              },
              source: {
                app: '抖音',
                friend: '只如初见',
              },
              targetApp: '新绿城云',
            });
            setHasChanges(true);
          }
        },
      ]
    );
  }, []);
  
  // 返回
  const handleBack = useCallback(() => {
    if (hasChanges) {
      Alert.alert(
        '有未保存的更改',
        '是否保存更改？',
        [
          { text: '不保存', style: 'destructive', onPress: () => router.back() },
          { text: '取消', style: 'cancel' },
          { text: '保存', onPress: () => { handleSave(); router.back(); } },
        ]
      );
    } else {
      router.back();
    }
  }, [hasChanges, router, handleSave]);
  
  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      {/* 顶部导航 */}
      <View style={[styles.header, { 
        backgroundColor: theme.backgroundDefault,
        paddingTop: insets.top + 8,
        borderBottomColor: theme.border,
      }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
        </TouchableOpacity>
        <ThemedText variant="h4" color={theme.textPrimary}>设置</ThemedText>
        {hasChanges && (
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={[styles.saveButtonText, { color: theme.primary }]}>保存</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* 延时配置 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="clock" size={18} color={theme.primary} />
            <ThemedText variant="h4" color={theme.textPrimary} style={styles.sectionTitle}>
              延时配置
            </ThemedText>
          </View>
          
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              打开APP延时（毫秒）
            </Text>
            <View style={styles.rangeInput}>
              <View style={[styles.inputGroup, { backgroundColor: theme.backgroundTertiary }]}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>最小</Text>
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  value={String(config.delays.openApp.min)}
                  onChangeText={(v) => updateConfig('delays.openApp.min', parseInt(v) || 0)}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.rangeSeparator, { color: theme.textMuted }]}>~</Text>
              <View style={[styles.inputGroup, { backgroundColor: theme.backgroundTertiary }]}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>最大</Text>
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  value={String(config.delays.openApp.max)}
                  onChangeText={(v) => updateConfig('delays.openApp.max', parseInt(v) || 0)}
                  keyboardType="numeric"
                />
              </View>
            </View>
            
            <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>
              其他操作延时（毫秒）
            </Text>
            <View style={styles.rangeInput}>
              <View style={[styles.inputGroup, { backgroundColor: theme.backgroundTertiary }]}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>最小</Text>
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  value={String(config.delays.other.min)}
                  onChangeText={(v) => updateConfig('delays.other.min', parseInt(v) || 0)}
                  keyboardType="numeric"
                />
              </View>
              <Text style={[styles.rangeSeparator, { color: theme.textMuted }]}>~</Text>
              <View style={[styles.inputGroup, { backgroundColor: theme.backgroundTertiary }]}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>最大</Text>
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  value={String(config.delays.other.max)}
                  onChangeText={(v) => updateConfig('delays.other.max', parseInt(v) || 0)}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        </View>
        
        {/* 项目配置 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="building" size={18} color={theme.primary} />
            <ThemedText variant="h4" color={theme.textPrimary} style={styles.sectionTitle}>
              项目配置
            </ThemedText>
          </View>
          
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>第一个报备项目</Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={config.projects.first}
              onChangeText={(v) => updateConfig('projects.first', v)}
              placeholder="输入项目名称"
              placeholderTextColor={theme.textMuted}
            />
            
            <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>第二个报备项目</Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={config.projects.second}
              onChangeText={(v) => updateConfig('projects.second', v)}
              placeholder="输入项目名称"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>
        
        {/* 信息来源 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="user" size={18} color={theme.primary} />
            <ThemedText variant="h4" color={theme.textPrimary} style={styles.sectionTitle}>
              信息来源
            </ThemedText>
          </View>
          
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>来源APP</Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={config.source.app}
              onChangeText={(v) => updateConfig('source.app', v)}
              placeholder="如：抖音"
              placeholderTextColor={theme.textMuted}
            />
            
            <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>好友名称</Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={config.source.friend}
              onChangeText={(v) => updateConfig('source.friend', v)}
              placeholder="如：只如初见"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>
        
        {/* 目标小程序 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="qrcode" size={18} color={theme.primary} />
            <ThemedText variant="h4" color={theme.textPrimary} style={styles.sectionTitle}>
              目标小程序
            </ThemedText>
          </View>
          
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>小程序名称</Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={config.targetApp}
              onChangeText={(v) => updateConfig('targetApp', v)}
              placeholder="如：新绿城云"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>
        
        {/* 重试配置 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome6 name="rotate" size={18} color={theme.primary} />
            <ThemedText variant="h4" color={theme.textPrimary} style={styles.sectionTitle}>
              重试配置
            </ThemedText>
          </View>
          
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>最大重试次数</Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={String(config.retries.maxAttempts)}
              onChangeText={(v) => updateConfig('retries.maxAttempts', parseInt(v) || 3)}
              keyboardType="numeric"
            />
            
            <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>
              重试间隔（毫秒）
            </Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={String(config.retries.interval)}
              onChangeText={(v) => updateConfig('retries.interval', parseInt(v) || 5000)}
              keyboardType="numeric"
            />
            
            <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>
              单步超时时间（毫秒）
            </Text>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.backgroundTertiary,
                color: theme.textPrimary,
              }]}
              value={String(config.retries.timeout)}
              onChangeText={(v) => updateConfig('retries.timeout', parseInt(v) || 30000)}
              keyboardType="numeric"
            />
          </View>
        </View>
        
        {/* 重置按钮 */}
        <TouchableOpacity
          style={[styles.resetButton, { borderColor: '#FF4444' }]}
          onPress={handleReset}
        >
          <FontAwesome6 name="rotate-left" size={16} color="#FF4444" />
          <Text style={styles.resetButtonText}>恢复默认配置</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  saveButton: {
    padding: 8,
    marginLeft: 'auto',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  card: {
    padding: 16,
    borderRadius: 12,
  },
  label: {
    fontSize: 13,
    marginBottom: 8,
  },
  textInput: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  rangeInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  inputLabel: {
    fontSize: 12,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    textAlign: 'center',
  },
  rangeSeparator: {
    marginHorizontal: 12,
    fontSize: 16,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  resetButtonText: {
    color: '#FF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
