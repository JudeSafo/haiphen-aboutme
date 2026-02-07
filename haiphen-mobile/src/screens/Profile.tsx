import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../store/auth';

const APP_VERSION = '1.0.0';

const PLAN_COLORS: Record<string, string> = {
  free: colors.textSecondary,
  pro: colors.primary,
  enterprise: colors.secondary,
};

const PLAN_QUOTAS: Record<string, number> = {
  free: 200,
  pro: 10000,
  enterprise: 50000,
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const plan = user?.plan?.toLowerCase() || 'free';
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const planColor = PLAN_COLORS[plan] || colors.textSecondary;
  const quota = PLAN_QUOTAS[plan] || 200;

  // Simulated usage for display
  const usedRequests = 127;
  const usagePercent = Math.min((usedRequests / quota) * 100, 100);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.user_login?.slice(0, 2).toUpperCase() || '??';

  const handleManageKeys = () => {
    Alert.alert(
      'API Keys',
      'Manage your API keys from the web dashboard at haiphen.io.',
      [{ text: 'OK' }],
    );
  };

  const handleSubscription = () => {
    Alert.alert(
      'Subscription',
      `Current plan: ${planLabel}\nQuota: ${quota.toLocaleString()} requests/day\n\nVisit haiphen.io to manage your subscription.`,
      [{ text: 'OK' }],
    );
  };

  const handleAbout = () => {
    Alert.alert(
      'About Haiphen',
      `Version: ${APP_VERSION}\n\nSemantic Edge Protocol Intelligence Platform\n\nhttps://haiphen.io`,
      [{ text: 'OK' }],
    );
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch {
            // Logout failed silently
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* User Info */}
      <View style={styles.profileSection}>
        <View style={[styles.avatar, { backgroundColor: planColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <Text style={styles.userName}>
          {user?.name || user?.user_login || 'User'}
        </Text>

        {user?.email && (
          <Text style={styles.userEmail}>{user.email}</Text>
        )}

        <View style={[styles.planBadge, { backgroundColor: `${planColor}20` }]}>
          <Text style={[styles.planBadgeText, { color: planColor }]}>
            {planLabel} Plan
          </Text>
        </View>
      </View>

      {/* Quota */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily Quota</Text>
        <View style={styles.quotaCard}>
          <View style={styles.quotaHeader}>
            <Text style={styles.quotaUsed}>
              {usedRequests.toLocaleString()} of {quota.toLocaleString()} requests
            </Text>
            <Text style={styles.quotaPercent}>
              {usagePercent.toFixed(0)}%
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${usagePercent}%`,
                  backgroundColor:
                    usagePercent > 90
                      ? colors.danger
                      : usagePercent > 70
                      ? colors.warning
                      : colors.success,
                },
              ]}
            />
          </View>
          <Text style={styles.quotaReset}>Resets daily at 00:00 UTC</Text>
        </View>
      </View>

      {/* Settings Buttons */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleManageKeys}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.primary }]}>
            <Text style={styles.menuIconText}>K</Text>
          </View>
          <Text style={styles.menuLabel}>Manage API Keys</Text>
          <Text style={styles.menuArrow}>{'\u203A'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleSubscription}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.secondary }]}>
            <Text style={styles.menuIconText}>S</Text>
          </View>
          <Text style={styles.menuLabel}>Subscription</Text>
          <Text style={styles.menuArrow}>{'\u203A'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleAbout}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.bgInput }]}>
            <Text style={styles.menuIconText}>i</Text>
          </View>
          <Text style={styles.menuLabel}>About</Text>
          <Text style={styles.menuArrow}>{'\u203A'}</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>Version {APP_VERSION}</Text>
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
    paddingBottom: 60,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  planBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  quotaCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 18,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quotaUsed: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  quotaPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.bgInput,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  quotaReset: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuArrow: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: '300',
  },
  logoutButton: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.danger,
  },
  versionText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
