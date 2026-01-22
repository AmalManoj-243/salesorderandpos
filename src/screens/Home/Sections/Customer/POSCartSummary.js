import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Image, ScrollView } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { useProductStore } from '@stores/product';
import { fetchCustomersOdoo, fetchTaxesOdoo } from '@api/services/generalApi';
import { COLORS } from '@constants/theme';

const POSCartSummary = ({ navigation, route }) => {
  const {
    openingAmount,
    sessionId,
    registerId,
    registerName,
    userId,
    userName
  } = route?.params || {};
  const { getCurrentCart, clearProducts, setCurrentCustomer, addProduct, removeProduct, loadCustomerCart } = useProductStore();
  const errorImage = require('@assets/images/error/error.png');
  const products = getCurrentCart();
  const [customerModal, setCustomerModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Tax state
  const [taxes, setTaxes] = useState([]);
  const [loadingTaxes, setLoadingTaxes] = useState(false);
  const [taxModal, setTaxModal] = useState(false);
  const [selectedProductForTax, setSelectedProductForTax] = useState(null);
  const [productTaxes, setProductTaxes] = useState({}); // { productId: [taxId1, taxId2] }

  useEffect(() => {
    console.log('POSCartSummary params:', route?.params);
    loadTaxes();
  }, []);

  // Auto-apply taxes from products when products or taxes change
  useEffect(() => {
    if (taxes.length > 0 && products.length > 0) {
      const initialProductTaxes = {};
      products.forEach(p => {
        // taxes_id from Odoo is an array of tax IDs assigned to the product
        if (p.taxes_id && Array.isArray(p.taxes_id) && p.taxes_id.length > 0) {
          initialProductTaxes[p.id] = p.taxes_id;
        }
      });
      // Only set if there are taxes to apply and we haven't already set them
      if (Object.keys(initialProductTaxes).length > 0) {
        setProductTaxes(prev => {
          // Merge with existing, but don't override user selections
          const merged = { ...initialProductTaxes };
          Object.keys(prev).forEach(key => {
            if (prev[key] && prev[key].length > 0) {
              merged[key] = prev[key]; // Keep user selection
            }
          });
          return merged;
        });
      }
    }
  }, [taxes, products.length]);

  const loadTaxes = async () => {
    setLoadingTaxes(true);
    try {
      const result = await fetchTaxesOdoo({ type_tax_use: 'sale' });
      if (result.result) {
        setTaxes(result.result);
      }
    } catch (e) {
      console.error('Failed to load taxes:', e);
    } finally {
      setLoadingTaxes(false);
    }
  };

  // Calculate tax amount for a product
  const calculateProductTax = (product) => {
    const qty = Number(product.quantity || product.qty || 0);
    const price = Number(product.price || 0);
    const lineTotal = qty * price;
    const appliedTaxIds = productTaxes[product.id] || [];

    let taxAmount = 0;
    appliedTaxIds.forEach(taxId => {
      const tax = taxes.find(t => t.id === taxId);
      if (tax) {
        if (tax.amount_type === 'percent') {
          taxAmount += (lineTotal * tax.amount) / 100;
        } else if (tax.amount_type === 'fixed') {
          taxAmount += tax.amount * qty;
        }
      }
    });
    return taxAmount;
  };

  // Get tax names for display
  const getProductTaxNames = (productId) => {
    const appliedTaxIds = productTaxes[productId] || [];
    if (appliedTaxIds.length === 0) return null;
    return appliedTaxIds.map(taxId => {
      const tax = taxes.find(t => t.id === taxId);
      return tax ? tax.name : '';
    }).filter(Boolean).join(', ');
  };

  const computeUntaxedTotal = () => products.reduce((s, p) => s + ((p.price || 0) * (p.quantity || p.qty || 0)), 0);

  const computeTaxTotal = () => products.reduce((s, p) => s + calculateProductTax(p), 0);

  const computeTotal = () => computeUntaxedTotal() + computeTaxTotal();

  const openTaxModal = (product) => {
    setSelectedProductForTax(product);
    setTaxModal(true);
  };

  const toggleTaxForProduct = (taxId) => {
    if (!selectedProductForTax) return;
    const productId = selectedProductForTax.id;
    const currentTaxes = productTaxes[productId] || [];

    let newTaxes;
    if (currentTaxes.includes(taxId)) {
      newTaxes = currentTaxes.filter(id => id !== taxId);
    } else {
      newTaxes = [...currentTaxes, taxId];
    }

    setProductTaxes(prev => ({
      ...prev,
      [productId]: newTaxes
    }));
  };

  const closeTaxModal = () => {
    setTaxModal(false);
    setSelectedProductForTax(null);
  };

  const handleCustomer = async () => {
    setCustomerModal(true);
    setLoadingCustomers(true);
    try {
      const list = await fetchCustomersOdoo({ limit: 50 });
      setCustomers(list);
    } catch (e) {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSelectCustomer = (customer) => {
    // Preserve current cart by moving it to the selected customer's cart
    try {
      const currentCart = getCurrentCart() || [];
      // loadCustomerCart will set the currentCustomerId and assign the cart data
      loadCustomerCart(customer.id, currentCart);
    } catch (e) {
      console.warn('Failed to migrate cart to selected customer', e);
      // fallback: just set current customer id
      setCurrentCustomer(customer.id);
    }
    setSelectedCustomer(customer);
    setCustomerModal(false);
  };

  const handleCheckout = () => {
    // Add tax info to each product
    const productsWithTax = products.map(p => ({
      ...p,
      tax_ids: productTaxes[p.id] || [],
      tax_amount: calculateProductTax(p),
    }));

    navigation.navigate('POSPayment', {
      openingAmount,
      sessionId,
      registerId,
      registerName,
      userId,
      userName,
      products: productsWithTax,
      untaxedTotal: computeUntaxedTotal(),
      taxTotal: computeTaxTotal(),
      grandTotal: computeTotal(),
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <NavigationHeader title="Cart" onBackPress={() => navigation.goBack()} />
      <View style={{ padding: 12, flex: 1, backgroundColor: '#fff' }}>
        {products && products.length > 0 ? (
          <FlatList
            data={products}
            keyExtractor={(i) => String(i.id)}
            renderItem={({ item }) => {
              const qty = Number(item.quantity || item.qty || 0);
              const price = Number(item.price || 0);
              const lineTotal = (qty * price).toFixed(3);
              const increase = () => {
                addProduct({ ...item, quantity: qty + 1, price });
              };
              const decrease = () => {
                if (qty <= 1) {
                  removeProduct(item.id);
                } else {
                  addProduct({ ...item, quantity: qty - 1, price });
                }
              };
              // normalize image source: support `data:` URIs, http URLs, or raw base64
              const rawImg = item.imageUrl || item.image_url || null;
              let imageSource = errorImage;
              if (rawImg) {
                if (typeof rawImg === 'string') {
                  if (rawImg.startsWith('data:') || rawImg.startsWith('http')) {
                    imageSource = { uri: rawImg };
                  } else if (rawImg.length > 100) {
                    // likely a base64 string without data: prefix
                    imageSource = { uri: `data:image/png;base64,${rawImg}` };
                  }
                } else if (rawImg.uri) {
                  imageSource = rawImg;
                }
              }

              const taxNames = getProductTaxNames(item.id);
              const lineTax = calculateProductTax(item);

              return (
                  <View style={styles.line}>
                    <Image
                      source={imageSource}
                      style={styles.thumb}
                      resizeMode="cover"
                      onError={() => { /* fallback to errorImage automatically */ }}
                    />
                  <View style={styles.productInfo}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.qty}>{qty} × {price.toFixed(3)}</Text>
                    {taxNames && (
                      <Text style={styles.taxInfo}>Tax: {taxNames}</Text>
                    )}
                  </View>
                  <View style={styles.rightSection}>
                    <View style={styles.controlsRow}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={decrease}>
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyDisplay}>{qty}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={increase}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.lineTotals}>
                      <Text style={styles.lineTotal}>{lineTotal}</Text>
                      {lineTax > 0 && (
                        <Text style={styles.lineTaxAmount}>+{lineTax.toFixed(3)}</Text>
                      )}
                    </View>
{/* Tax Button hidden
                    <TouchableOpacity style={styles.taxBtn} onPress={() => openTaxModal(item)}>
                      <Text style={styles.taxBtnText}>+ Tax</Text>
                    </TouchableOpacity>
*/}
                  </View>
                </View>
              );
            }}
          />
        ) : (
          <Text style={{ color: '#666' }}>Cart is empty</Text>
        )}

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Untaxed Amount</Text>
            <Text style={styles.summaryValue}>{computeUntaxedTotal().toFixed(3)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>{computeTaxTotal().toFixed(3)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{computeTotal().toFixed(3)}</Text>
          </View>
        </View>

        {/* Customer selection removed from cart page. Now only available in payment page. */}

        <View style={{ marginTop: 12 }}>
          <Button title="Checkout / Payment" onPress={handleCheckout} />
        </View>

        <Modal visible={customerModal} animationType="slide" transparent={true}>
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Text style={{ fontWeight: '700', fontSize: 18, marginBottom: 12 }}>Select Customer</Text>
              {loadingCustomers ? (
                <ActivityIndicator size="large" color="#444" />
              ) : (
                <FlatList
                  data={customers}
                  keyExtractor={(i) => String(i.id)}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.customerItem} onPress={() => handleSelectCustomer(item)}>
                      <Text style={{ fontSize: 22, fontWeight: '700' }}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
              <Button title="Close" onPress={() => setCustomerModal(false)} />
            </View>
          </View>
        </Modal>

        {/* Tax Selection Modal */}
        <Modal visible={taxModal} animationType="slide" transparent={true}>
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Select Tax for {selectedProductForTax?.name || 'Product'}
              </Text>
              {loadingTaxes ? (
                <ActivityIndicator size="large" color="#444" />
              ) : taxes.length === 0 ? (
                <Text style={styles.noTaxText}>No taxes available</Text>
              ) : (
                <ScrollView style={{ maxHeight: 300 }}>
                  {taxes.map((tax) => {
                    const isSelected = selectedProductForTax &&
                      (productTaxes[selectedProductForTax.id] || []).includes(tax.id);
                    return (
                      <TouchableOpacity
                        key={tax.id}
                        style={[styles.taxItem, isSelected && styles.taxItemSelected]}
                        onPress={() => toggleTaxForProduct(tax.id)}
                      >
                        <View style={styles.taxItemContent}>
                          <Text style={[styles.taxItemName, isSelected && styles.taxItemNameSelected]}>
                            {tax.name}
                          </Text>
                          <Text style={[styles.taxItemAmount, isSelected && styles.taxItemAmountSelected]}>
                            {tax.amount_type === 'percent' ? `${tax.amount}%` : `Fixed ${tax.amount}`}
                          </Text>
                        </View>
                        {isSelected && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
              <View style={{ marginTop: 16 }}>
                <Button title="Done" onPress={closeTaxModal} />
              </View>
            </View>
          </View>
        </Modal>

      </View>
    </SafeAreaView>
  );
};

export default POSCartSummary;

const styles = StyleSheet.create({
  line: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', alignItems: 'flex-start' },
  productInfo: { flex: 1, marginRight: 10 },
  name: { fontWeight: '700', fontSize: 16, color: '#111' },
  qty: { color: '#666', marginTop: 4, fontSize: 14 },
  taxInfo: { color: COLORS.primaryThemeColor || '#1316c5', marginTop: 4, fontSize: 12, fontStyle: 'italic' },
  rightSection: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  qtyBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  qtyBtnText: { color: '#111', fontWeight: '700', fontSize: 18 },
  qtyDisplay: { color: '#111', marginHorizontal: 8, minWidth: 28, textAlign: 'center', fontWeight: '700', fontSize: 16 },
  lineTotals: { alignItems: 'flex-end', marginBottom: 4 },
  lineTotal: { fontWeight: '700', color: '#111', fontSize: 16 },
  lineTaxAmount: { color: COLORS.primaryThemeColor || '#1316c5', fontSize: 12, marginTop: 2 },
  taxBtn: { backgroundColor: '#ff9800', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, marginTop: 4 },
  taxBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  summarySection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#e0e0e0' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: '#666' },
  summaryValue: { fontSize: 14, color: '#333', fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#f0f0f0' },
  totalLabel: { fontWeight: '800', fontSize: 20, color: '#111' },
  totalValue: { fontWeight: '800', fontSize: 24, color: '#111' },
  customerLabel: { fontWeight: '600', fontSize: 16, marginBottom: 6, color: '#111' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 12, width: '85%', maxHeight: '80%' },
  modalTitle: { fontWeight: '700', fontSize: 18, marginBottom: 16, color: '#111' },
  customerItem: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  thumb: { width: 48, height: 48, borderRadius: 6, marginRight: 12, backgroundColor: '#fff' },
  noTaxText: { color: '#666', textAlign: 'center', paddingVertical: 20 },
  taxItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#f0f0f0', borderRadius: 8, marginBottom: 8, backgroundColor: '#f9f9f9' },
  taxItemSelected: { backgroundColor: (COLORS.primaryThemeColor || '#1316c5') + '15', borderColor: COLORS.primaryThemeColor || '#1316c5' },
  taxItemContent: { flex: 1 },
  taxItemName: { fontSize: 16, fontWeight: '600', color: '#333' },
  taxItemNameSelected: { color: COLORS.primaryThemeColor || '#1316c5' },
  taxItemAmount: { fontSize: 13, color: '#666', marginTop: 2 },
  taxItemAmountSelected: { color: COLORS.primaryThemeColor || '#1316c5' },
  checkmark: { fontSize: 20, color: COLORS.primaryThemeColor || '#1316c5', fontWeight: '700' },
});
