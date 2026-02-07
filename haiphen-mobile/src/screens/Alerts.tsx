import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { colors } from '../theme/colors';

type Severity = 'critical' | 'high' | 'medium' | 'low';

type AlertItem = {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  timestamp: string;
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: colors.danger,
  high: '#F97316',
  medium: colors.warning,
  low: colors.primary,
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

const MOCK_ALERTS: AlertItem[] = [
  {
    id: '1',
    severity: 'critical',
    title: 'CVE-2026-1847 detected',
    description:
      'Critical vulnerability found in edge-gateway-04 firmware. Immediate patching required.',
    timestamp: '5 min ago',
  },
  {
    id: '2',
    severity: 'high',
    title: 'Unusual protocol traffic spike',
    description:
      'Modbus TCP traffic on subnet 10.0.3.0/24 exceeded 3x baseline for 15 minutes.',
    timestamp: '23 min ago',
  },
  {
    id: '3',
    severity: 'medium',
    title: 'Portfolio allocation drift',
    description:
      'Current allocation deviates 8.2% from target. Consider rebalancing to reduce risk exposure.',
    timestamp: '1h ago',
  },
  {
    id: '4',
    severity: 'low',
    title: 'New supplier risk assessment',
    description:
      'Supply chain analysis completed for Q1. 2 suppliers flagged for elevated geopolitical risk.',
    timestamp: '3h ago',
  },
  {
    id: '5',
    severity: 'medium',
    title: 'Graph entity conflict',
    description:
      'Duplicate entity detected in knowledge graph: "sensor-node-12" has conflicting attributes.',
    timestamp: '5h ago',
  },
  {
    id: '6',
    severity: 'low',
    title: 'Daily quota at 80%',
    description:
      'API usage has reached 160 of 200 daily requests on the Free plan. Consider upgrading.',
    timestamp: '6h ago',
  },
];

export default function AlertsScreen() {
  const [alerts] = useState<AlertItem[]>(MOCK_ALERTS);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulate network refresh
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderItem = ({ item }: { item: AlertItem }) => {
    const borderColor = SEVERITY_COLORS[item.severity];

    return (
      <View style={[styles.alertCard, { borderLeftColor: borderColor }]}>
        <View style={styles.alertHeader}>
          <View
            style={[
              styles.severityBadge,
              { backgroundColor: `${borderColor}20` },
            ]}
          >
            <Text style={[styles.severityText, { color: borderColor }]}>
              {SEVERITY_LABELS[item.severity]}
            </Text>
          </View>
          <Text style={styles.timestamp}>{item.timestamp}</Text>
        </View>

        <Text style={styles.alertTitle}>{item.title}</Text>
        <Text style={styles.alertDescription}>{item.description}</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Text style={styles.emptyIcon}>{'\u2713'}</Text>
      </View>
      <Text style={styles.emptyTitle}>No alerts</Text>
      <Text style={styles.emptySubtext}>
        All systems are operating normally
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          alerts.length === 0 ? styles.emptyList : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.heading}>Alerts</Text>
            <Text style={styles.countBadge}>
              {alerts.length} active
            </Text>
          </View>
        }
        ListEmptyComponent={renderEmpty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  alertCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  alertDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.success}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 28,
    color: colors.success,
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
