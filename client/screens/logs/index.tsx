import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { logs } from '@/services/AutomationLogger';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export default function LogsScreen() {
  const [displayLogs, setDisplayLogs] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      setDisplayLogs([...logs]);
    }, [])
  );

  return (
    <Screen style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {displayLogs.map((log, index) => (
          <Text key={index} style={styles.logText}>
            {log}
          </Text>
        ))}
        {displayLogs.length === 0 && (
          <Text style={styles.emptyText}>暂无日志</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#00ff00',
    marginBottom: 2,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
});
