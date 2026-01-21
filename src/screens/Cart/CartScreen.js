import React from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { useProductStore } from '@stores/product';
import { createSaleOrderOdoo, confirmSaleOrderOdoo, createInvoiceOdoo, linkInvoiceToSaleOrderOdoo } from '@api/services/generalApi';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import { useState } from 'react';
import { useAuthStore } from '@stores/auth';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const CartScreen = ({ navigation }) => {
  const { getCurrentCart, addProduct, removeProduct, clearProducts } = useProductStore();
  const cart = getCurrentCart() || [];
  const [creatingOrder, setCreatingOrder] = useState(false);
  const subtotal = cart.reduce((sum, item) => {
    const qty = Number(item.quantity ?? item.qty ?? 1) || 0;
    const price = Number(item.price ?? item.price_unit ?? 0) || 0;
    return sum + qty * price;
  }, 0);

  const renderItem = ({ item }) => {
    const unit = Number(item.price ?? item.price_unit ?? 0) || 0;
    const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
    const lineTotal = unit * qty;
    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          {item.image_base64 ? (
            <Image source={{ uri: `data:image/png;base64,${item.image_base64}` }} style={styles.cartImage} />
          ) : item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.cartImage} />
          ) : (
            <View style={[styles.cartImage, styles.cartImagePlaceholder]} />
          )}
          <View style={styles.itemText}>
            <Text style={styles.name}>{item.product_name || item.name}</Text>
            {item.product_code ? <Text style={styles.code}>{item.product_code}</Text> : null}
            <Text style={styles.unitPrice}>{unit.toFixed(3)} OMR</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.qtyText}>Qty: {item.quantity ?? item.qty ?? 1}</Text>
          <Text style={styles.lineTotal}>{lineTotal.toFixed(3)} OMR</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView>
      <RoundedScrollContainer>
          <NavigationHeader title="Cart" onBackPress={() => navigation.goBack()} />
        <View style={{ padding: 12 }}>
          <FlatList
            data={cart}
            keyExtractor={(i) => i.id?.toString() || Math.random().toString()}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={<Text>No items in cart</Text>}
          />
          <View style={styles.footer}>
            <View>
              <Text style={styles.subtotalLabel}>Subtotal</Text>
              <Text style={styles.subtotalValue}>{subtotal.toFixed(3)} OMR</Text>
            </View>
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.placeOrderBtn}
                onPress={async () => {
                  if (!cart || cart.length === 0) return showToastMessage('Cart is empty');
                  try {
                    setCreatingOrder(true);
                    const authUser = useAuthStore.getState().user || null;
                    let partnerIdForOrder = null;
                    try {
                      const p = authUser?.partner_id;
                      partnerIdForOrder = Array.isArray(p) ? p[0] : p || null;
                    } catch (e) {
                      partnerIdForOrder = null;
                    }

                    const lines = cart.map(item => {
                      const resolvedProductId = item.product_id || item.id;
                      return {
                        product_id: resolvedProductId,
                        name: item.product_name || item.name,
                        quantity: Number(item.quantity ?? item.qty ?? 1),
                        price_unit: Number(item.price ?? item.price_unit ?? item.list_price ?? 0),
                      };
                    });

                    const resp = await createSaleOrderOdoo({ partnerId: partnerIdForOrder, lines });
                    if (resp?.error) {
                      console.error('createSaleOrderOdoo failed', resp.error);
                      showToastMessage('Failed to create sale order in Odoo');
                      setCreatingOrder(false);
                      return;
                    }
                    const orderId = resp.result || resp?.result;
                    if (!orderId) {
                      showToastMessage('Order creation returned no id');
                      setCreatingOrder(false);
                      return;
                    }
                    showToastMessage('Sale order created (quotation)');
                    clearProducts();
                    setCreatingOrder(false);
                    navigation.goBack();
                  } catch (e) {
                    console.error('Place Order error', e);
                    showToastMessage('Place Order failed');
                    setCreatingOrder(false);
                  }
                }}
              >
                <Text style={styles.placeOrderText}>Place Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.checkoutBtn}
                onPress={async () => {
                  if (!cart || cart.length === 0) return showToastMessage('Cart is empty');
                  try {
                    setCreatingOrder(true);
                    const authUser = useAuthStore.getState().user || null;
                    let partnerIdForInvoice = null;
                    try {
                      const p = authUser?.partner_id;
                      partnerIdForInvoice = Array.isArray(p) ? p[0] : p || null;
                    } catch (e) {
                      partnerIdForInvoice = 1; // fallback
                    }

                    const invoiceProducts = cart.map(p => ({ id: p.product_id || p.id, name: p.product_name || p.name, price: p.price ?? p.price_unit ?? 0, quantity: p.quantity ?? p.qty ?? 1 }));
                    const invoiceResp = await createInvoiceOdoo({ partnerId: partnerIdForInvoice, products: invoiceProducts });
                    if (!invoiceResp || invoiceResp.error) {
                      console.error('createInvoiceOdoo failed', invoiceResp?.error || invoiceResp);
                      showToastMessage('Direct invoice creation failed');
                      setCreatingOrder(false);
                      return;
                    }
                    const invoiceId = invoiceResp.id || invoiceResp?.result || invoiceResp?.id;
                    if (!invoiceId) {
                      showToastMessage('Invoice creation returned no id');
                      setCreatingOrder(false);
                      return;
                    }
                    showToastMessage('Direct invoice created');
                    clearProducts();
                    setCreatingOrder(false);
                    navigation.navigate('POSReceiptScreen', { invoiceId, products: cart, totalAmount: subtotal, customer: null, paymentMode: 'direct' });
                  } catch (e) {
                    console.error('Direct Invoice error', e);
                    showToastMessage('Direct Invoice failed');
                    setCreatingOrder(false);
                  }
                }}
              >
                <Text style={styles.checkoutText}>Direct Invoice</Text>
              </TouchableOpacity>
            </View>
          </View>
          <OverlayLoader visible={creatingOrder} />
        </View>
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  cardLeft: { flex: 1, paddingRight: 10, flexDirection: 'row', alignItems: 'center' },
  cartImage: { width: 72, height: 72, borderRadius: 8, marginRight: 20, resizeMode: 'cover' },
  cartImagePlaceholder: { backgroundColor: '#f2f2f2' },
  itemText: { flex: 1, justifyContent: 'center' },
  cardRight: { alignItems: 'flex-end', justifyContent: 'center' },
  name: { fontSize: 15, fontFamily: FONT_FAMILY.urbanistBold, color: '#222' },
  code: { fontSize: 12, color: '#888', marginTop: 4 },
  unitPrice: { fontSize: 13, color: COLORS.green, marginTop: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '700' },
  qtyText: { marginHorizontal: 12, minWidth: 28, textAlign: 'center', fontSize: 15 },
  lineTotal: { marginTop: 8, fontSize: 13, fontWeight: '700', color: '#333' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  subtotalLabel: { fontSize: 12, color: '#666' },
  subtotalValue: { fontSize: 18, fontFamily: FONT_FAMILY.urbanistBold, marginTop: 4 },
  buttonContainer: { flexDirection: 'row' },
  placeOrderBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.primaryThemeColor, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, marginRight: 8 },
  placeOrderText: { color: COLORS.primaryThemeColor, fontWeight: '700' },
  checkoutBtn: { backgroundColor: COLORS.primaryThemeColor, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  checkoutText: { color: '#fff', fontWeight: '700' },
});

export default CartScreen;