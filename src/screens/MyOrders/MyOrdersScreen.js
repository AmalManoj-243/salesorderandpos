import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from '@components/containers';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchOrders, fetchSaleOrders } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';

const getStateColor = (state) => {
  switch (state) {
    case 'paid':
    case 'sale':
      return '#10b981';
    case 'done':
      return '#6366f1';
    case 'invoiced':
      return '#3b82f6';
    case 'draft':
    case 'sent':
      return '#f59e0b';
    case 'cancel':
      return '#ef4444';
    default:
      return '#6b7280';
  }
};

const getStateLabel = (state) => {
  switch (state) {
    case 'paid':
      return 'Paid';
    case 'done':
      return 'Done';
    case 'invoiced':
      return 'Invoiced';
    case 'draft':
      return 'Draft';
    case 'cancel':
      return 'Cancelled';
    case 'sale':
      return 'Sales Order';
    case 'sent':
      return 'Sent';
    default:
      return state || 'Unknown';
  }
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency = (amount) => {
  if (amount == null) return '0.00';
  return parseFloat(amount).toFixed(2);
};

const OrderCard = ({ order, orderType, onPress }) => {
  const stateColor = getStateColor(order.state);
  const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderName}>{order.name || `Order #${order.id}`}</Text>
        <View style={[styles.stateBadge, { backgroundColor: stateColor + '20' }]}>
          <Text style={[styles.stateText, { color: stateColor }]}>
            {getStateLabel(order.state)}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDate(order.create_date)}</Text>
        </View>
        {partnerName && (
          <View style={styles.row}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{partnerName}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Total</Text>
          <Text style={styles.amount}>{formatCurrency(order.amount_total)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const OrderTypeSelector = ({ selectedType, onSelect }) => {
  return (
    <View style={styles.selectorContainer}>
      <TouchableOpacity
        style={[
          styles.selectorButton,
          selectedType === 'pos' && styles.selectorButtonActive,
        ]}
        onPress={() => onSelect('pos')}
      >
        <Text
          style={[
            styles.selectorText,
            selectedType === 'pos' && styles.selectorTextActive,
          ]}
        >
          POS Orders
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.selectorButton,
          selectedType === 'sales' && styles.selectorButtonActive,
        ]}
        onPress={() => onSelect('sales')}
      >
        <Text
          style={[
            styles.selectorText,
            selectedType === 'sales' && styles.selectorTextActive,
          ]}
        >
          Sales Orders
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const SearchBar = ({ value, onChangeText, placeholder }) => {
  return (
    <View style={styles.searchContainer}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Text style={styles.clearIcon}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const MyOrdersScreen = ({ navigation }) => {
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [orderType, setOrderType] = useState('pos');
  const [searchQuery, setSearchQuery] = useState('');

  const loadOrders = async (type = orderType, isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      let response;
      if (type === 'pos') {
        response = await fetchOrders({ limit: 50, order: 'create_date desc' });
      } else {
        response = await fetchSaleOrders({ limit: 50, order: 'create_date desc' });
      }

      if (response.error) {
        setError('Failed to load orders');
        console.error('Error fetching orders:', response.error);
      } else {
        const fetchedOrders = response.result || [];
        setAllOrders(fetchedOrders);
        setOrders(fetchedOrders);
        setSearchQuery('');
      }
    } catch (err) {
      setError('Failed to load orders');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadOrders(orderType);
    }, [orderType])
  );

  const handleOrderTypeChange = (type) => {
    setOrderType(type);
    loadOrders(type);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setOrders(allOrders);
    } else {
      const lowerQuery = query.toLowerCase();
      const filtered = allOrders.filter((order) => {
        const orderName = (order.name || '').toLowerCase();
        const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1]?.toLowerCase() : '';
        const amount = formatCurrency(order.amount_total);
        return (
          orderName.includes(lowerQuery) ||
          partnerName.includes(lowerQuery) ||
          amount.includes(lowerQuery)
        );
      });
      setOrders(filtered);
    }
  };

  const handleOrderPress = (order) => {
    navigation.navigate('OrderDetailsScreen', { order, orderType });
  };

  const onRefresh = () => {
    loadOrders(orderType, true);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No orders found</Text>
      <Text style={styles.emptySubtext}>
        {orderType === 'pos' ? 'Your POS orders will appear here' : 'Your Sales orders will appear here'}
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => loadOrders(orderType)}>
        <Text style={styles.retryText}>Tap to retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <View style={styles.container}>
        <Text style={styles.title}>My Orders</Text>

        <SearchBar
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search by order name, customer, or amount..."
        />

        <OrderTypeSelector selectedType={orderType} onSelect={handleOrderTypeChange} />

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
          </View>
        ) : error ? (
          renderError()
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <OrderCard order={item} orderType={orderType} onPress={() => handleOrderPress(item)} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[COLORS.primaryThemeColor]}
                tintColor={COLORS.primaryThemeColor}
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  title: {
    fontSize: 24,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#242760',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#111827',
    padding: 0,
  },
  clearIcon: {
    fontSize: 14,
    color: '#9ca3af',
    paddingLeft: 10,
  },
  selectorContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#f1f2f6',
    borderRadius: 12,
    padding: 4,
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  selectorButtonActive: {
    backgroundColor: COLORS.primaryThemeColor,
  },
  selectorText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#6b7280',
  },
  selectorTextActive: {
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderName: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#111827',
    flex: 1,
  },
  stateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stateText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'capitalize',
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: '#f1f2f6',
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistRegular,
    color: '#6b7280',
  },
  value: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#374151',
  },
  amount: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#374151',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistRegular,
    color: '#9ca3af',
  },
  errorText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#ef4444',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#ffffff',
  },
});

export default MyOrdersScreen;
