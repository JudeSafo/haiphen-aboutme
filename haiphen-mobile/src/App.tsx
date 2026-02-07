import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Haiphen</Text>
      <Text style={styles.sub}>Portfolio Intelligence On-the-Go</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sub: {
    color: 'rgba(226,232,240,0.6)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
});
