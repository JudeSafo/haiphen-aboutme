import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Severity = 'critical' | 'warning' | 'info';

type Props = {
  title: string;
  description: string;
  timestamp: string;
  severity: Severity;
};

const severityColors: Record<Severity, string> = {
  critical: colors.danger,
  warning: colors.warning,
  info: colors.primary,
};

export default function AlertItem({ title, description, timestamp, severity }: Props) {
  const borderColor = severityColors[severity] || colors.primary;

  return (
    <View style={[styles.item, { borderLeftColor: borderColor }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    ...typography.h3,
    fontSize: 15,
    flex: 1,
  },
  timestamp: {
    ...typography.caption,
    marginLeft: 8,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
