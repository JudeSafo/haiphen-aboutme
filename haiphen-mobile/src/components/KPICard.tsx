import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  label: string;
  value: string;
  change?: string;
  changePositive?: boolean;
};

export default function KPICard({ label, value, change, changePositive }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {change != null && (
        <Text style={[styles.change, { color: changePositive ? colors.success : colors.danger }]}>
          {changePositive ? '+' : ''}{change}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    minWidth: 140,
    marginRight: 12,
    marginBottom: 12,
  },
  label: {
    ...typography.label,
    marginBottom: 8,
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
  },
  change: {
    ...typography.caption,
    marginTop: 4,
  },
});
