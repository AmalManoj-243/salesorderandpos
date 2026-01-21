import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, Image, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearCartFromStorage } from '@api/customer/cartApi';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { DetailField } from '@components/common/Detail';
import { Button } from '@components/common/Button';

import { useProductStore } from '@stores/product';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { EmptyState } from '@components/common/empty';
import { COLORS } from '@constants/theme';
import styles from './styles';
import { format } from 'date-fns';
import { useAuthStore } from '@stores/auth';
import { post } from '@api/services/utils';
import { fetchCustomerDetailsOdoo, createInvoiceOdoo, createSaleOrderOdoo, confirmSaleOrderOdoo } from '@api/services/generalApi';
import Toast from 'react-native-toast-message';
import { useCurrencyStore } from '@stores/currency';

const CustomerDetails = ({ navigation, route }) => {
  const { details } = route?.params || {};
  const currentUser = useAuthStore(state => state.user);
  const { 
    getCurrentCart, 
    setCurrentCustomer, 
    loadCustomerCart,
    removeProduct, 
    addProduct, 
    clearProducts 
  } = useProductStore();
  const currency = useCurrencyStore((state) => state.currency) || '';
  
  // Set current customer and load their cart when component mounts
  useEffect(() => {
    if (details?.id || details?._id) {
      const customerId = details.id || details._id;
      setCurrentCustomer(customerId);
      
      // Try to load saved cart from AsyncStorage
      loadCartFromStorage(customerId);
    }
  }, [details]);
  
  // Get current customer's products
  const products = getCurrentCart();
  
  // Save cart to AsyncStorage whenever it changes
  useEffect(() => {
    if (details?.id || details?._id) {
      const customerId = details.id || details._id;
      saveCartToStorage(customerId, products);
    }
  }, [products, details]);

  const loadCartFromStorage = async (customerId) => {
    try {
      const savedCart = await AsyncStorage.getItem(`cart_${customerId}`);
      if (savedCart) {
        const cartData = JSON.parse(savedCart);
        loadCustomerCart(customerId, cartData);
      } else {
        loadCustomerCart(customerId, []);
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error);
      loadCustomerCart(customerId, []);
    }
  };

  const saveCartToStorage = async (customerId, cartData) => {
    try {
      await AsyncStorage.setItem(`cart_${customerId}`, JSON.stringify(cartData));
    } catch (error) {
      console.error('Error saving cart to storage:', error);
    }
  };
  

  const handleDelete = (productId) => {
    removeProduct(productId);
  };

  const handleQuantityChange = (productId, quantity) => {
    const updatedQuantity = Math.max(0, isNaN(parseInt(quantity)) ? 0 : parseInt(quantity));
    const product = products.find(p => p.id === productId);
    addProduct({ ...product, quantity: updatedQuantity });
  };

  const handlePriceChange = (productId, price) => {
    const updatedPrice = isNaN(parseFloat(price)) ? 0 : parseFloat(price);
    const product = products.find(p => p.id === productId);
    addProduct({ ...product, price: updatedPrice });
  };

  // Calculate amounts
  const calculateAmounts = () => {
    let untaxedAmount = 0;
    let totalQuantity = 0;

    products.forEach(product => {
      untaxedAmount += product.price * product.quantity;
      totalQuantity += product.quantity;
    });

    const taxRate = 0.05;
    const taxedAmount = untaxedAmount * taxRate;
    const totalAmount = untaxedAmount + taxedAmount;

    return { untaxedAmount, taxedAmount, totalAmount, totalQuantity };
  };

  const { untaxedAmount, taxedAmount, totalAmount, totalQuantity } = calculateAmounts();
  // console.log("🚀 ~ CustomerDetails ~ totalQuantity:", totalQuantity)

  const renderItem = ({ item }) => (
    <View style={styles.productContainer}>
      <View style={styles.row}>
        <View style={styles.imageWrapper}>
          <Image source={{ uri: item.imageUrl }} style={styles.productImage} />
        </View>
        <View style={styles.productDetails}>
          <Text style={styles.productName}>{item?.name?.trim()}</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, item.quantity - 1)}>
              <AntDesign name="minus" size={20} color="black" />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Quantity"
              value={item.quantity.toString()}
              onChangeText={(text) => handleQuantityChange(item.id, text)}
              keyboardType="numeric"
            />
            <TouchableOpacity onPress={() => handleQuantityChange(item.id, item.quantity + 1)}>
              <AntDesign name="plus" size={20} color="black" />
            </TouchableOpacity>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.label}>Price</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Price"
              value={item.price.toString()}
              onChangeText={(text) => handlePriceChange(item.id, text)}
              keyboardType="numeric"
            />
            <Text style={styles.aedLabel}>{currency}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={24} color={COLORS.black} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const placeOrder = async () => {
    try {
      console.log('Place Order button clicked');
      const date = format(new Date(), 'yyyy-MM-dd');
      const orderItems = products.map((product) => ({
        // product identifiers: include both internal DB id and external/odoo id when available
        product_id: product.id,
        product_internal_id: product._id || null,
        product_odoo_id: (typeof product.id === 'number' || (typeof product.id === 'string' && /^[0-9]+$/.test(product.id))) ? product.id : null,
        product_name: product.name || product.product_name || '',
        product_code: product.product_code || product.code || null,
        tax_type_id: "648d9b54ef9cd868dfbfa37b",
        tax_value: 0.05,
        uom_id: product?.uom?.uom_id || null,
        uom: product?.uom?.uom_name || 'Pcs',
        qty: product.quantity,
        discount_percentage: 0,
        unit_price: product.price,
        // some backends expect price_unit or product_uom_qty — include common aliases
        price_unit: product.price,
        product_uom_qty: product.quantity,
        remarks: '',
        total: product.price * product.quantity,
      }));
      console.log('Order Items:', orderItems);
      // Compute fallbacks for required fields
      const customerId = details?.id || details?._id || details?.customer_id || null;
      let addressVal = details?.address || details?.customer_address || details?.address_line || null;
      // if address is missing, try fetch from Odoo
      if (!addressVal && (details?.id || details?._id)) {
        try {
          const partnerId = details.id || details._id;
          const fetched = await fetchCustomerDetailsOdoo(partnerId);
          console.log('Fetched partner details from Odoo:', fetched);
          if (fetched && fetched.address) {
            addressVal = fetched.address;
            console.log('Using fetched address for order:', addressVal);
          }
        } catch (err) {
          console.warn('Could not fetch partner address:', err);
        }
      }
      // Fallback: use customer name as address if still missing
      if (!addressVal) {
        addressVal = details?.name || null;
        if (addressVal) console.log('Fallback: using customer name as address:', addressVal);
      }
      // Try to get warehouse from user, else from first product in cart
      let warehouseId = currentUser?.warehouse?.warehouse_id || currentUser?.warehouse?.id || currentUser?.warehouse_id || null;
      if (!warehouseId && products.length > 0 && products[0].inventory_ledgers && products[0].inventory_ledgers.length > 0) {
        warehouseId = products[0].inventory_ledgers[0].warehouse_id || null;
      }
      // If still not found, fallback to a sensible default (1) and notify user/dev
      if (!warehouseId) {
        const fallbackWarehouse = 1;
        console.warn('No warehouse found for user or product; falling back to warehouse id', fallbackWarehouse);
        Toast.show({ type: 'info', text1: 'Using default warehouse', text2: `warehouse_id: ${fallbackWarehouse}`, position: 'bottom' });
        warehouseId = fallbackWarehouse;
      }

      // Validate required fields before sending
      const missing = [];
      if (!customerId) missing.push('customer_id');
      if (!warehouseId) missing.push('warehouse_id');
      if (!addressVal) missing.push('address');

      console.log('Computed customerId:', customerId, 'warehouseId:', warehouseId, 'address:', addressVal);
      if (missing.length > 0) {
        console.warn('Place Order aborted — missing fields:', missing);
        Toast.show({
          type: 'error',
          text1: 'Missing required data',
          text2: `Please provide: ${missing.join(', ')}`,
          position: 'bottom',
        });
        return;
      }

      const placeOrderData = {
        date: date,
        quotation_status: "new",
        address: addressVal,
        remarks: null,
        customer_id: customerId,
        warehouse_id: warehouseId,
        pipeline_id: null,
        payment_terms_id: null,
        delivery_method_id: null,
        untaxed_total_amount: untaxedAmount,
        total_amount: totalAmount,
        crm_product_line_ids: orderItems,
        sales_person_id: currentUser?.related_profile?._id ?? null,
        sales_person_name: currentUser?.related_profile?.name ?? '',
      }
      console.log('Place Order Data:', placeOrderData);
      try {
        console.log('Posting to /createQuotation with payload:', JSON.stringify(placeOrderData));
      } catch (e) {
        // ignore
      }

      // Odoo expects product lines as [[0, 0, {...}]]
      const odooProductLines = orderItems.map(item => [0, 0, item]);
      placeOrderData.crm_product_line_ids = odooProductLines;

      const jsonRpcPayload = {
        jsonrpc: "2.0",
        method: "createQuotation",
        params: placeOrderData,
        id: new Date().getTime(),
      };
      console.log('JSON-RPC Payload:', JSON.stringify(jsonRpcPayload));

      console.log('JSON-RPC Payload:', JSON.stringify(jsonRpcPayload));

      // Skip backend /createQuotation and directly create sale.order in Odoo for reliability
      console.log('Skipping /createQuotation and creating sale.order directly in Odoo');
      try {
        const saleLines = orderItems.map(item => ({
          product_id: item.product_odoo_id || item.product_id || item.product_id,
          name: item.product_name || item.product_name,
          quantity: Number(item.qty || item.product_uom_qty || item.qty || 1),
          price_unit: Number(item.price_unit || item.unit_price || item.unit_price || 0),
        }));
        const saleResp = await createSaleOrderOdoo({ partnerId: customerId, lines: saleLines, note: 'Created from mobile app' });
        console.log('createSaleOrderOdoo response:', saleResp);
        const orderId = saleResp?.result || saleResp?.result || saleResp?.id;
        if (orderId) {
          try {
            const conf = await confirmSaleOrderOdoo(orderId);
            console.log('confirmSaleOrderOdoo response:', conf);
          } catch (e) {
            console.warn('confirmSaleOrderOdoo failed, continuing:', e);
          }
          Toast.show({ type: 'success', text1: 'Success', text2: 'Sale order created', position: 'bottom' });
          clearProducts();
          const custId = details?.id || details?._id;
          if (custId) await clearCartFromStorage(custId);
          // Stay on the screen or navigate back if needed
          // navigation.goBack(); // Uncomment if you want to go back
          return;
        } else {
          throw new Error('createSaleOrderOdoo returned no orderId');
        }
      } catch (e) {
        console.error('Direct createSaleOrderOdoo failed', e);
        Toast.show({
          type: 'error',
          text1: 'Order creation failed',
          text2: 'Failed to create sale order',
          position: 'bottom',
        });
      }
    } catch (err) {
      console.error('Place Order error:', err);
      try {
        console.error('Place Order error response data:', err?.response?.data);
      } catch (e) {
        // ignore
      }
      const serverMsg = err?.response?.data?.message || err?.response?.data || err?.message || 'Unexpected error in Place Order';
      Toast.show({
        type: 'error',
        text1: 'ERROR',
        text2: typeof serverMsg === 'string' ? serverMsg : JSON.stringify(serverMsg),
        position: 'bottom',
      });
    }
  }

  const directInvoice = async () => {
    try {
      console.log('Direct Invoice button clicked');
      const customerId = details?.id || details?._id || null;
      if (!customerId) {
        Toast.show({
          type: 'error',
          text1: 'Missing customer',
          text2: 'Customer ID is required for invoice',
          position: 'bottom',
        });
        return;
      }

      const invoiceProducts = products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        quantity: p.quantity
      }));

      const invoiceResp = await createInvoiceOdoo({ partnerId: customerId, products: invoiceProducts });
      if (!invoiceResp || invoiceResp.error) {
        console.error('createInvoiceOdoo failed', invoiceResp?.error || invoiceResp);
        Toast.show({
          type: 'error',
          text1: 'ERROR',
          text2: 'Direct invoice creation failed',
          position: 'bottom',
        });
        return;
      }
      const invoiceId = invoiceResp.id || invoiceResp?.result || invoiceResp?.id;
      if (!invoiceId) {
        Toast.show({
          type: 'error',
          text1: 'ERROR',
          text2: 'Invoice creation returned no id',
          position: 'bottom',
        });
        return;
      }
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Direct invoice created successfully',
        position: 'bottom',
      });
      // Clear current customer's cart
      clearProducts();
      const custId = details?.id || details?._id;
      if (custId) {
        await clearCartFromStorage(custId);
      }
      // Navigate to DirectInvoiceScreen with the invoice ID
      navigation.navigate('DirectInvoiceScreen', { invoice_id: invoiceId });
    } catch (err) {
      console.error('Direct Invoice error:', err);
      Toast.show({
        type: 'error',
        text1: 'ERROR',
        text2: err?.message || 'Unexpected error in Direct Invoice',
        position: 'bottom',
      });
    }
  }

  return (
    <SafeAreaView>
      <NavigationHeader title="Order Summary" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <TouchableOpacity style={styles.itemContainer} activeOpacity={0.7}>
          <DetailField label="Customer Name" value={details.name} multiline={true} />
         <DetailField
  label="MOB"
  value={details.customer_mobile || details.mobile || details.phone || '-'}
/>

        </TouchableOpacity>
        <Button
          title="Add Product(s)"
          width="50%"
          alignSelf="flex-end"
          marginTop={10}
          onPress={() => navigation.navigate('Products', { fromCustomerDetails: details })}
        />
        {products.length === 0 ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty_cart.png')} message="Items are empty" />
        ) : (
          <View style={styles.itemContainer}>
            <Text style={styles.totalItemsText}>Total {products.length} item{products.length !== 1 ? 's' : ''}</Text>
            <FlatList
              data={products}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.flatListContent}
              showsVerticalScrollIndicator={false}
            />
            {products.length > 0 && (
              <View style={styles.footerContainer}>
                <View style={styles.totalPriceContainer}>
                  <View style={styles.footerRow}>
                    <Text style={styles.footerLabel}>Untaxed Amount:</Text>
                    <Text style={styles.footerLabel}>{untaxedAmount.toFixed(2)} {currency}</Text>
                  </View>
                  <View style={styles.footerRow}>
                    <Text style={styles.footerLabel}>Taxed Amount:</Text>
                    <Text style={styles.footerLabel}>{taxedAmount.toFixed(2)} {currency}</Text>
                  </View>
                  <View style={styles.footerRow}>
                    <Text style={styles.totalPriceLabel}>Total Amount:</Text>
                    <Text style={styles.totalPriceLabel}>{totalAmount.toFixed(2)} {currency}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 12 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      console.log('Place Order touch detected');
                      try { placeOrder(); } catch (e) { console.error('placeOrder call failed', e); Toast.show({ type: 'error', text1: 'Error', text2: e?.message || 'Place order failed' }); }
                    }}
                    style={{
                      height: 45,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderRadius: 8,
                      backgroundColor: COLORS.primaryThemeColor,
                      marginVertical: 10,
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Place Order</Text>
                  </TouchableOpacity>

                  <Button
                    title={'Direct Invoice'}
                    onPress={directInvoice}
                    color={COLORS.primaryThemeColor}
                    backgroundColor={'#fff'}
                    borderWidth={1}
                    borderColor={COLORS.primaryThemeColor}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default CustomerDetails;
