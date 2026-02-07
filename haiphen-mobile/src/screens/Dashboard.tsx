import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../store/auth';
import { fetchKPIs } from '../api/services';

type KPI = {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
};

const FALLBACK_KPIS: KPI[] = [
  { label: 'Portfolio Value', value: '--', change: 0, changeLabel: '--' },
  { label: 'Daily PnL', value: '--', change: 0, changeLabel: '--' },
  { label: 'Win Rate', value: '--', change: 0, changeLabel: '--' },
  { label: 'Active Signals', value: '--', change: 0, changeLabel: '--' },
];

const RECENT_ACTIVITY = [
  { id: '1', title: 'CVE scan completed', detail: 'haiphen-api: 0 critical', time: '2m ago' },
  { id: '2', title: 'Risk model updated', detail: 'VaR recalculated for Q1', time: '18m ago' },
  { id: '3', title: 'New signal detected', detail: 'Protocol anomaly on edge-04', time: '1h ago' },
  { id: '4', title: 'Portfolio rebalanced', detail: '3 assets reallocated', time: '3h ago' },
];

const QUICK_ACTIONS = [
  { label: 'Run Scan', color: colors.primary },
  { label: 'Analyze Risk', color: colors.warning },
  { label: 'Map Graph', color: colors.secondary },
  { label: 'Trace Network', color: colors.success },
];

export default function DashboardScreen() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<KPI[]>(FALLBACK_KPIS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKPIs = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchKPIs();
      if (result.ok && result.data) {
        const d = result.data;
        setKpis([
          {
            label: 'Portfolio Value',
            value: d.portfolio_value ?? '--',
            change: d.portfolio_change ?? 0,
            changeLabel: d.portfolio_change_label ?? '--',
          },
          {
            label: 'Daily PnL',
            value: d.daily_pnl ?? '--',
            change: d.daily_pnl_change ?? 0,
            changeLabel: d.daily_pnl_change_label ?? '--',
          },
          {
            label: 'Win Rate',
            value: d.win_rate ?? '--',
            change: d.win_rate_change ?? 0,
            changeLabel: d.win_rate_change_label ?? '--',
          },
          {
            label: 'Active Signals',
            value: d.active_signals ?? '--',
            change: d.signals_change ?? 0,
            changeLabel: d.signals_change_label ?? '--',
          },
        ]);
      } else {
        setError(result.error || 'Failed to load KPIs');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadKPIs();
      setLoading(false);
    })();
  }, [loadKPIs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadKPIs();
    setRefreshing(false);
  }, [loadKPIs]);

  const handleQuickAction = (label: string) => {
    Alert.alert(label, `Launching ${label.toLowerCase()}...`);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Greeting */}
      <Text style={styles.greeting}>
        Welcome back{user?.name ? `, ${user.name}` : ''}
      </Text>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        {kpis.map((kpi, index) => (
          <View key={index} style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{kpi.label}</Text>
            <Text style={styles.kpiValue}>{kpi.value}</Text>
            <View style={styles.kpiChangeRow}>
              <Text
                style={[
                  styles.kpiChange,
                  { color: kpi.change >= 0 ? colors.success : colors.danger },
                ]}
              >
                {kpi.change >= 0 ? '\u25B2' : '\u25BC'} {kpi.changeLabel}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Recent Activity */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityList}>
        {RECENT_ACTIVITY.map((item) => (
          <View key={item.id} style={styles.activityItem}>
            <View style={styles.activityDot} />
            <View style={styles.activityContent}>
              <Text style={styles.activityTitle}>{item.title}</Text>
              <Text style={styles.activityDetail}>{item.detail}</Text>
            </View>
            <Text style={styles.activityTime}>{item.time}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.actionButton, { borderColor: action.color }]}
            onPress={() => handleQuickAction(action.label)}
            activeOpacity={0.7}
          >
            <View
              style={[styles.actionDot, { backgroundColor: action.color }]}
            />
            <Text style={[styles.actionLabel, { color: action.color }]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 20,
  },
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  retryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 12,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 28,
  },
  kpiCard: {
    width: '47%',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    margin: '1.5%',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  kpiChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  kpiChange: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  activityList: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 4,
    marginBottom: 28,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  activityDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activityTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  actionButton: {
    width: '47%',
    margin: '1.5%',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
