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

type ServiceItem = {
  id: string;
  name: string;
  tagline: string;
  letter: string;
  color: string;
  status: 'active' | 'beta' | 'coming soon';
};

const SERVICES: ServiceItem[] = [
  {
    id: 'secure',
    name: 'Secure',
    tagline: 'CVE scanning & vulnerability detection',
    letter: 'S',
    color: colors.primary,
    status: 'active',
  },
  {
    id: 'network',
    name: 'Network',
    tagline: 'Protocol analysis & traffic parsing',
    letter: 'N',
    color: '#14B8A6',
    status: 'active',
  },
  {
    id: 'graph',
    name: 'Graph',
    tagline: 'Knowledge mapping & entity linking',
    letter: 'G',
    color: colors.secondary,
    status: 'active',
  },
  {
    id: 'risk',
    name: 'Risk',
    tagline: 'Monte Carlo VaR assessment',
    letter: 'R',
    color: colors.warning,
    status: 'beta',
  },
  {
    id: 'causal',
    name: 'Causal',
    tagline: 'Root cause analysis & event chains',
    letter: 'C',
    color: colors.success,
    status: 'beta',
  },
  {
    id: 'supply',
    name: 'Supply',
    tagline: 'Supplier risk & chain monitoring',
    letter: 'U',
    color: '#F97316',
    status: 'coming soon',
  },
];

const STATUS_COLORS: Record<string, string> = {
  active: colors.success,
  beta: colors.warning,
  'coming soon': colors.textMuted,
};

export default function ServicesScreen() {
  const handleServicePress = (service: ServiceItem) => {
    if (service.status === 'coming soon') {
      Alert.alert(service.name, 'This service is coming soon. Stay tuned!');
      return;
    }

    Alert.alert(
      `${service.name} Service`,
      `Enter parameters to run a ${service.name.toLowerCase()} operation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Launch',
          onPress: () =>
            Alert.alert('Submitted', `${service.name} job queued successfully.`),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.heading}>Intelligence Services</Text>
      <Text style={styles.subheading}>
        Six AI-powered modules for edge protocol intelligence
      </Text>

      <View style={styles.grid}>
        {SERVICES.map((service) => (
          <TouchableOpacity
            key={service.id}
            style={styles.card}
            onPress={() => handleServicePress(service)}
            activeOpacity={0.7}
          >
            {/* Icon placeholder */}
            <View style={[styles.iconCircle, { backgroundColor: service.color }]}>
              <Text style={styles.iconLetter}>{service.letter}</Text>
            </View>

            {/* Status badge */}
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${STATUS_COLORS[service.status]}20` },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: STATUS_COLORS[service.status] },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: STATUS_COLORS[service.status] },
                ]}
              >
                {service.status}
              </Text>
            </View>

            {/* Info */}
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.serviceTagline}>{service.tagline}</Text>
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
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 24,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  card: {
    width: '47%',
    margin: '1.5%',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 18,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconLetter: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  serviceTagline: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
