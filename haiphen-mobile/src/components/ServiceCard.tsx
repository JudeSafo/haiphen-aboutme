import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  name: string;
  tagline: string;
  active?: boolean;
  onPress?: () => void;
};

export default function ServiceCard({ name, tagline, active = false, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.iconPlaceholder}>
        <Text style={styles.iconText}>{name.charAt(0)}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.tagline}>{tagline}</Text>
      </View>
      <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
        <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextInactive]}>
          {active ? 'Active' : 'Inactive'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  iconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  content: {
    flex: 1,
  },
  name: {
    ...typography.h3,
    fontSize: 15,
  },
  tagline: {
    ...typography.caption,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  badgeInactive: {
    backgroundColor: 'rgba(226,232,240,0.08)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: colors.success,
  },
  badgeTextInactive: {
    color: colors.textMuted,
  },
});
