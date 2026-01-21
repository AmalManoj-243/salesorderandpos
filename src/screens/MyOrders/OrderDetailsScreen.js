import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { fetchPosOrderById, fetchOrderLinesByIds } from '@api/services/generalApi';
import axios from 'axios';
import ODOO_BASE_URL from '@api/config/odooConfig';

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

const OrderLineItem = ({ item }) => {
  const productName = Array.isArray(item.product_id) ? item.product_id[1] : item.name || 'Product';
  const qty = item.qty || item.product_uom_qty || 1;
  const price = item.price_unit || 0;
  const subtotal = item.price_subtotal || item.price_subtotal_incl || (qty * price);

  return (
    <View style={styles.lineItem}>
      <View style={styles.lineItemLeft}>
        <Text style={styles.productName} numberOfLines={2}>{productName}</Text>
        <Text style={styles.qtyPrice}>{qty} x {formatCurrency(price)}</Text>
      </View>
      <Text style={styles.lineSubtotal}>{formatCurrency(subtotal)}</Text>
    </View>
  );
};

const OrderDetailsScreen = ({ route, navigation }) => {
  const { order, orderType } = route.params;
  const [loading, setLoading] = useState(true);
  const [orderLines, setOrderLines] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadOrderDetails();
  }, []);

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      if (orderType === 'pos') {
        // Fetch POS order details with lines
        const orderResult = await fetchPosOrderById(order.id);
        if (orderResult.error) {
          setError('Failed to load order details');
          return;
        }

        const orderData = orderResult.result;
        if (orderData && orderData.lines && orderData.lines.length > 0) {
          const linesResult = await fetchOrderLinesByIds(orderData.lines);
          if (linesResult.result) {
            setOrderLines(linesResult.result);
          }
        }
      } else {
        // Fetch Sale Order lines
        const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'sale.order.line',
            method: 'search_read',
            args: [[['order_id', '=', order.id]]],
            kwargs: {
              fields: ['id', 'product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'],
            },
          },
          id: new Date().getTime(),
        }, { headers: { 'Content-Type': 'application/json' } });

        if (response.data && response.data.result) {
          setOrderLines(response.data.result);
        }
      }
    } catch (err) {
      console.error('Error loading order details:', err);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const stateColor = getStateColor(order.state);
  const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : null;

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader
        title="Order Details"
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Order Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.orderTitleRow}>
            <Text style={styles.orderName}>{order.name || `Order #${order.id}`}</Text>
            <View style={[styles.stateBadge, { backgroundColor: stateColor + '20' }]}>
              <Text style={[styles.stateText, { color: stateColor }]}>
                {getStateLabel(order.state)}
              </Text>
            </View>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Order Type</Text>
              <Text style={styles.infoValue}>{orderType === 'pos' ? 'POS Order' : 'Sales Order'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{formatDate(order.create_date)}</Text>
            </View>
            {partnerName && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Customer</Text>
                <Text style={styles.infoValue}>{partnerName}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Order Lines */}
        <View style={styles.linesCard}>
          <Text style={styles.sectionTitle}>Order Items</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : orderLines.length === 0 ? (
            <Text style={styles.emptyText}>No items found</Text>
          ) : (
            orderLines.map((item, index) => (
              <OrderLineItem key={item.id || index} item={item} />
            ))
          )}
        </View>

        {/* Order Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Items</Text>
            <Text style={styles.summaryValue}>{orderLines.length}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.amount_total)}</Text>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  orderTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  orderName: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#111827',
    flex: 1,
  },
  stateBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stateText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    textTransform: 'capitalize',
  },
  infoSection: {
    borderTopWidth: 1,
    borderTopColor: '#f1f2f6',
    paddingTop: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistRegular,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#374151',
  },
  linesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#111827',
    marginBottom: 16,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  lineItemLeft: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#374151',
    marginBottom: 4,
  },
  qtyPrice: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistRegular,
    color: '#9ca3af',
  },
  lineSubtotal: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistRegular,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#374151',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#f1f2f6',
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#111827',
  },
  totalValue: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#ef4444',
    textAlign: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistRegular,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default OrderDetailsScreen;
