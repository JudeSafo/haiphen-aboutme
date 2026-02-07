import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { fetchPortfolioAssets } from '../api/services';

type Asset = {
  id: string;
  name: string;
  symbol: string;
  value: string;
  change: number;
  changePercent: string;
  allocation: number;
};

const MOCK_ASSETS: Asset[] = [
  { id: '1', name: 'Edge Gateway Alpha', symbol: 'EGA', value: '$12,450', change: 3.2, changePercent: '+3.2%', allocation: 0.28 },
  { id: '2', name: 'Protocol Bridge X', symbol: 'PBX', value: '$8,920', change: -1.4, changePercent: '-1.4%', allocation: 0.20 },
  { id: '3', name: 'Sensor Mesh Network', symbol: 'SMN', value: '$6,780', change: 5.8, changePercent: '+5.8%', allocation: 0.15 },
  { id: '4', name: 'OT Firewall Suite', symbol: 'OFS', value: '$5,230', change: -0.6, changePercent: '-0.6%', allocation: 0.12 },
  { id: '5', name: 'SCADA Monitor Pro', symbol: 'SMP', value: '$4,100', change: 2.1, changePercent: '+2.1%', allocation: 0.09 },
  { id: '6', name: 'IoT Analytics Hub', symbol: 'IAH', value: '$3,680', change: -2.9, changePercent: '-2.9%', allocation: 0.08 },
  { id: '7', name: 'Modbus Relay Unit', symbol: 'MRU', value: '$2,150', change: 0.4, changePercent: '+0.4%', allocation: 0.05 },
  { id: '8', name: 'CAN Bus Decoder', symbol: 'CBD', value: '$1,340', change: 1.7, changePercent: '+1.7%', allocation: 0.03 },
];

export default function TradesScreen() {
  const [assets, setAssets] = useState<Asset[]>(MOCK_ASSETS);
  const [filtered, setFiltered] = useState<Asset[]>(MOCK_ASSETS);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadAssets = useCallback(async () => {
    try {
      const result = await fetchPortfolioAssets();
      if (result.ok && Array.isArray(result.data)) {
        setAssets(result.data);
      }
      // On failure, keep existing data (mock or previously loaded)
    } catch {
      // Silently keep current data
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAssets();
      setLoading(false);
    })();
  }, [loadAssets]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(assets);
    } else {
      const q = search.toLowerCase();
      setFiltered(
        assets.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.symbol.toLowerCase().includes(q),
        ),
      );
    }
  }, [search, assets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAssets();
    setRefreshing(false);
  }, [loadAssets]);

  const handleAssetPress = (asset: Asset) => {
    Alert.alert(
      asset.name,
      [
        `Symbol: ${asset.symbol}`,
        `Value: ${asset.value}`,
        `Change: ${asset.changePercent}`,
        `Allocation: ${(asset.allocation * 100).toFixed(1)}%`,
      ].join('\n'),
      [{ text: 'Close', style: 'cancel' }],
    );
  };

  const renderItem = ({ item }: { item: Asset }) => {
    const changeColor = item.change >= 0 ? colors.success : colors.danger;

    return (
      <TouchableOpacity
        style={styles.assetRow}
        onPress={() => handleAssetPress(item)}
        activeOpacity={0.7}
      >
        {/* Left: Symbol badge + Name */}
        <View style={styles.assetLeft}>
          <View style={styles.symbolBadge}>
            <Text style={styles.symbolText}>{item.symbol.slice(0, 2)}</Text>
          </View>
          <View style={styles.assetInfo}>
            <Text style={styles.assetName}>{item.name}</Text>
            <Text style={styles.assetSymbol}>{item.symbol}</Text>
          </View>
        </View>

        {/* Right: Value + Change */}
        <View style={styles.assetRight}>
          <Text style={styles.assetValue}>{item.value}</Text>
          <Text style={[styles.assetChange, { color: changeColor }]}>
            {item.change >= 0 ? '\u25B2' : '\u25BC'} {item.changePercent}
          </Text>
        </View>

        {/* Allocation bar */}
        <View style={styles.allocBarContainer}>
          <View
            style={[
              styles.allocBarFill,
              {
                width: `${Math.min(item.allocation * 100, 100)}%`,
                backgroundColor: changeColor,
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search assets..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No assets found</Text>
              <Text style={styles.emptySubtext}>
                {search ? 'Try a different search term' : 'Pull to refresh'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetRow: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  symbolBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.bgInput,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  symbolText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  assetSymbol: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  assetRight: {
    position: 'absolute',
    top: 16,
    right: 16,
    alignItems: 'flex-end',
  },
  assetValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  assetChange: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  allocBarContainer: {
    height: 4,
    backgroundColor: colors.bgInput,
    borderRadius: 2,
    overflow: 'hidden',
  },
  allocBarFill: {
    height: 4,
    borderRadius: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },
});
