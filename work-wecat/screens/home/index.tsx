/**
 * 企业微信测试首页
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { workWechatAutomation } from '@/services/WorkWechatService';

export default function HomeScreen() {
  const [isRunning, setIsRunning] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  
  // 添加日志
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogLines(prev => [...prev.slice(-50), `[${timestamp}] ${message}`]);
  }, []);
  
  // 执行测试流程
  const handleStartTest = async () => {
    if (isRunning) {
      Alert.alert('提示', '测试正在进行中...');
      return;
    }
    
    setIsRunning(true);
    setLogLines([]);
    
    try {
      addLog('开始企业微信测试...');
      
      // 拦截日志输出
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        const message = args.join(' ');
        addLog(message);
        originalLog.apply(console, args);
      };
      
      const result = await workWechatAutomation.executeWorkWechatFlow();
      
      console.log = originalLog;
      
      if (result.success) {
        addLog('========================================');
        addLog('测试完成！');
        addLog(`截图数量: ${result.screenshots.length}`);
        result.screenshots.forEach((path, index) => {
          addLog(`截图${index + 1}: ${path}`);
        });
        Alert.alert('成功', '企业微信测试已完成！\n请检查相册中的截图。');
      } else {
        Alert.alert('失败', '测试过程中出现错误，请查看日志。');
      }
      
    } catch (error: any) {
      addLog(`执行出错: ${error.message}`);
      Alert.alert('错误', error.message);
    } finally {
      setIsRunning(false);
    }
  };
  
  // 停止测试
  const handleStopTest = () => {
    workWechatAutomation.stop();
    setIsRunning(false);
    addLog('已停止测试');
  };
  
  return (
    <Screen style={styles.container}>
      {/* 标题 */}
      <View style={styles.header}>
        <Text style={styles.title}>企业微信测试</Text>
        <Text style={styles.subtitle}>WorkWechat Automation Test</Text>
      </View>
      
      {/* 测试数据展示 */}
      <View style={styles.dataCard}>
        <Text style={styles.cardTitle}>测试数据</Text>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>姓名:</Text>
          <Text style={styles.dataValue}>刘先生</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>电话:</Text>
          <Text style={styles.dataValue}>13212341234</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>项目1:</Text>
          <Text style={styles.dataValue}>郑州春月锦庐</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>项目2:</Text>
          <Text style={styles.dataValue}>郑州湖畔雲庐</Text>
        </View>
      </View>
      
      {/* 控制按钮 */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, isRunning ? styles.buttonStop : styles.buttonStart]}
          onPress={isRunning ? handleStopTest : handleStartTest}
        >
          <Text style={styles.buttonText}>
            {isRunning ? '停止测试' : '开始测试'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* 日志区域 */}
      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>执行日志</Text>
        <ScrollView style={styles.logScroll} showsVerticalScrollIndicator>
          {logLines.map((line, index) => (
            <Text
              key={index}
              style={[
                styles.logLine,
                line.includes('ERROR') && styles.logError,
                line.includes('SUCCESS') && styles.logSuccess,
              ]}
            >
              {line}
            </Text>
          ))}
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 20,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.8,
    marginTop: 4,
  },
  dataCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dataLabel: {
    fontSize: 14,
    color: '#666',
  },
  dataValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  controls: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#4CAF50',
  },
  buttonStop: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    margin: 16,
    padding: 12,
    borderRadius: 12,
  },
  logTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  logScroll: {
    flex: 1,
  },
  logLine: {
    color: '#AAAAAA',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  logError: {
    color: '#FF6B6B',
  },
  logSuccess: {
    color: '#4CAF50',
  },
});
