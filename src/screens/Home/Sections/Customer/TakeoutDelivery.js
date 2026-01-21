import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, TextInput, Pressable } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { useProductStore } from '@stores/product';
import { COLORS } from '@constants/theme';
import { createPosOrderOdoo, fetchDiscountsOdoo } from '@api/services/generalApi';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from '@components/containers';

const TakeoutDelivery = ({ navigation, route }) => {
  const cart = useProductStore((s) => s.getCurrentCart()) || [];
  const { addProduct, removeProduct, clearProducts, setProductDiscount } = useProductStore();
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [customDiscountInput, setCustomDiscountInput] = useState('');
  const [discountPresets, setDiscountPresets] = useState([]);
  const STORAGE_KEY = 'local_discount_presets_v1';
  const [lineDiscountModalVisible, setLineDiscountModalVisible] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [addName, setAddName] = useState('');
  const [addAmount, setAddAmount] = useState('');
  
  // map cart to items with qty and price
  const items = useMemo(() => cart.map(it => {
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const unitPrice = Number(it.price_unit ?? it.price ?? 0);
    // If price_subtotal_incl or price_subtotal exists, use it directly (already includes qty)
    // Otherwise calculate: unit_price * qty
    const subtotal = (typeof it.price_subtotal_incl === 'number') 
      ? it.price_subtotal_incl 
      : (typeof it.price_subtotal === 'number') 
        ? it.price_subtotal 
        : (unitPrice * qty);
    
    return {
      id: String(it.id),
      qty,
      discount_percent: Number(it.discount_percent || it.discount || 0),
      name: it.name || (it.product_id && it.product_id[1]) || 'Product',
      unit: unitPrice,
      subtotal,
      rawItem: it
    };
  }), [cart]);

  const total = useMemo(() => items.reduce((s, it) => s + (it.subtotal || (it.unit * it.qty)), 0), [items]);
  const discountApplied = Number(discountAmount) || 0;
  const finalTotal = Math.max(0, total - discountApplied);

  // Persisted discount presets: load local first, fallback to Odoo fetch
  React.useEffect(() => {
    let mounted = true;
    const loadLocal = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (mounted && Array.isArray(parsed) && parsed.length > 0) {
            setDiscountPresets(parsed);
            return true;
          }
        }
      } catch (e) {
        console.warn('Failed to read local discount presets', e);
      }
      return false;
    };

    const loadDiscounts = async () => {
      try {
        const hasLocal = await loadLocal();
        if (hasLocal) return; // prefer local-managed presets
        const presets = await fetchDiscountsOdoo();
        if (mounted && Array.isArray(presets) && presets.length > 0) {
          setDiscountPresets(presets);
          try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch(e){/* ignore */}
        }
      } catch (e) {
        console.warn('Failed to load discount presets', e);
      }
    };
    loadDiscounts();
    return () => { mounted = false; };
  }, []);

  const refreshDiscounts = async () => {
    try {
      // Only refresh from Odoo when no local presets exist
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        console.log('Local presets present, skipping remote refresh');
        return;
      }
      const presets = await fetchDiscountsOdoo();
      if (Array.isArray(presets)) {
        setDiscountPresets(presets);
        try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch(e){}
      }
    } catch (e) {
      console.warn('refreshDiscounts failed', e);
    }
  };

  const persistPresets = async (presets) => {
    try {
      setDiscountPresets(presets);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets || []));
    } catch (e) {
      console.warn('Failed to persist presets', e);
      setDiscountPresets(presets);
    }
  };

  const handleIncrement = (item) => {
    const newQty = item.qty + 1;
    addProduct({ ...item.rawItem, quantity: newQty, qty: newQty });
  };

  const handleDecrement = (item) => {
    if (item.qty <= 1) {
      // Use the actual product id from rawItem to ensure correct removal
      const productId = item.rawItem?.id || item.id;
      removeProduct(productId);
    } else {
      const newQty = item.qty - 1;
      addProduct({ ...item.rawItem, quantity: newQty, qty: newQty });
    }
  };

  const handleNewOrder = () => {
    clearProducts();
    navigation.navigate('POSProducts');
  };

  const handlePlaceOrder = async () => {
    if (!cart || cart.length === 0) {
      Toast.show({ type: 'error', text1: 'Cart Empty', text2: 'Add products before placing order', position: 'bottom' });
      return;
    }

    setCreatingOrder(true);
    try {
      const lines = cart.map(item => ({
        product_id: item.remoteId || item.id,
        qty: item.quantity || item.qty || 1,
        price_unit: item.price_unit || item.price || 0,
        name: item.name || 'Product',
        discount: Number(item.discount_percent || item.discount || 0),
        price_subtotal: typeof item.price_subtotal !== 'undefined' ? Number(item.price_subtotal) : undefined
      }));

      const sessionId = route?.params?.sessionId;
      const posConfigId = route?.params?.registerId;
      const partnerId = null; // or get from route params if customer is selected

      console.log('[Place Order] Creating order with:', { lines, sessionId, posConfigId, partnerId });

      // Don't pass preset_id - let Odoo use default or omit if optional
      const resp = await createPosOrderOdoo({ 
        partnerId, 
        lines, 
        sessionId, 
        posConfigId,
        discount: discountApplied,
        amount_total: finalTotal
      });

      console.log('[Place Order] Response:', resp);

      if (resp && resp.error) {
        Toast.show({ 
          type: 'error', 
          text1: 'Order Error', 
          text2: resp.error.message || JSON.stringify(resp.error) || 'Failed to create order', 
          position: 'bottom' 
        });
        return;
      }

      const orderId = resp && resp.result ? resp.result : null;
      if (!orderId) {
        Toast.show({ type: 'error', text1: 'Order Error', text2: 'No order ID returned', position: 'bottom' });
        return;
      }

      Toast.show({ 
        type: 'success', 
        text1: 'Order Created', 
        text2: `Order ID: ${orderId}`, 
        position: 'bottom' 
      });

      // Navigate to payment or clear cart
      navigation.navigate('POSPayment', { 
        orderId, 
        sessionId, 
        registerId: posConfigId,
        totalAmount: finalTotal,
        products: cart,
        discountAmount: discountApplied
      });
    } catch (error) {
      console.error('[Place Order] Error:', error);
      Toast.show({ 
        type: 'error', 
        text1: 'Order Error', 
        text2: error?.message || 'Failed to create order', 
        position: 'bottom' 
      });
    } finally {
      setCreatingOrder(false);
    }
  };

  const renderLine = ({ item }) => {
    const isSelected = selectedLine && String(selectedLine.id) === String(item.id);
    return (
      <TouchableOpacity onPress={() => { setSelectedLine(prev => (prev && String(prev.id) === String(item.id) ? null : item)); }} style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: isSelected ? '#eef6ff' : '#fff', borderLeftWidth: isSelected ? 4 : 0, borderLeftColor: isSelected ? '#2563eb' : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <Image
          source={{ uri: item.rawItem?.imageUrl || item.rawItem?.image_url || item.rawItem?.image_128 || 'https://via.placeholder.com/60' }}
          style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: '#f5f5f5' }}
          resizeMode="cover"
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>{item.name}</Text>
          <Text style={{ fontSize: 14, color: '#666' }}>OMR {item.unit.toFixed(3)} each</Text>
          {item.discount_percent > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Text style={{ fontSize:12, color:'#ff5722', fontWeight:'700' }}>{item.discount_percent}% discount applied</Text>
              <TouchableOpacity onPress={() => setProductDiscount(item.rawItem?.id ?? item.id, 0)} style={{ marginLeft: 8, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fecaca' }}>
                <Text style={{ fontSize:12, color:'#b91c1c', fontWeight:'700' }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8 }}>
          <TouchableOpacity onPress={() => handleDecrement(item)} style={{ padding: 8, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>-</Text>
          </TouchableOpacity>
          <Text style={{ fontWeight: '700', paddingHorizontal: 8 }}>{item.qty}</Text>
          <TouchableOpacity onPress={() => handleIncrement(item)} style={{ padding: 8, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: 140 }}>
        <Text style={{ fontWeight: '800', marginLeft: 12 }}>OMR {(item.subtotal || item.price_subtotal || (item.unit * item.qty)).toFixed(3)}</Text>
      </View>
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView backgroundColor={'#fff'}>
      <NavigationHeader title="Register" onBackPress={() => navigation.goBack()} />
      <View style={{ flex: 1 }}>
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderLine}
          ListEmptyComponent={<View style={{ padding: 24 }}><Text style={{ color: '#666' }}>No items</Text></View>}
          contentContainerStyle={{ paddingBottom: 200 }}
        />

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>Total</Text>
              {discountApplied > 0 ? (
                <Text style={{ fontSize: 12, color: '#666' }}>Discount: OMR {discountApplied.toFixed(3)}</Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 20, fontWeight: '900' }}>OMR {finalTotal.toFixed(3)}</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
            <TouchableOpacity style={{ backgroundColor: '#f3f4f6', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginRight: 8, marginBottom: 8 }}>
              <Text style={{ fontWeight: '800', color: '#6b21a8' }}>{route?.params?.userName || 'John Doe'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#f3f4f6', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginRight: 8, marginBottom: 8 }}>
              <Text style={{ fontWeight: '800', color: '#111' }}>Note</Text>
            </TouchableOpacity>
            <View style={{ marginRight: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                {selectedLine ? (
                  <TouchableOpacity onPress={() => setLineDiscountModalVisible(true)} style={{ backgroundColor: '#fef3c7', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#f59e0b' }}>
                    <Text style={{ fontWeight: '800', color: '#92400e' }}>Select Discount</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setManageModalVisible(true)} style={{ marginTop: 8, backgroundColor: '#06b6d4', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Manage</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity 
              onPress={() => navigation.navigate('POSProducts', { sessionId: route?.params?.sessionId, registerId: route?.params?.registerId })} 
              style={{ 
                backgroundColor: '#10b981', 
                paddingVertical: 12, 
                paddingHorizontal: 20, 
                borderRadius: 10, 
                marginRight: 8, 
                marginBottom: 8,
                shadowColor: '#10b981',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 6
              }}>
              <Text style={{ fontWeight: '900', color: '#fff', fontSize: 16 }}>➕ Add Products</Text>
            </TouchableOpacity>
            {/* preset button removed for ice cream shop (no Takeaway preset) */}
            {/* Course button removed for ice cream shop */}
            <TouchableOpacity style={{ backgroundColor: '#f3f4f6', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginRight: 8, marginBottom: 8 }}>
              <Text style={{ fontWeight: '800' }}>⋮</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={handleNewOrder} style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 18, borderRadius: 8, marginRight: 8, alignItems: 'center' }}>
              <Text style={{ fontWeight: '800', fontSize: 18 }}>New</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, flexDirection: 'column' }}>
              <TouchableOpacity 
                onPress={handlePlaceOrder} 
                disabled={creatingOrder}
                style={{ backgroundColor: '#10b981', paddingVertical: 18, borderRadius: 8, alignItems: 'center', opacity: creatingOrder ? 0.6 : 1 }}>
                {creatingOrder ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontWeight: '800', fontSize: 18, color: '#fff' }}>Place Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Discount Modal (simple percentage grid) */}
      <Modal visible={discountModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDiscountModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width: '80%', backgroundColor:'#fff', borderRadius:12, padding:20, alignItems:'center' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:10 }}>Select Discount</Text>
            <Text style={{ color:'#666', marginBottom:14 }}>Tap a percentage to apply</Text>

            <View style={{ width:'100%', minHeight:120, justifyContent:'center', alignItems:'center' }}>
              {discountPresets && discountPresets.length > 0 ? (
                <View style={{ width:'100%', flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                  {discountPresets.slice(0,6).map(p => ({ id: p.id, label: p.is_percentage ? `${p.amount}%` : `${Number(p.amount).toFixed(3)}`, value: p })).map(btn => (
                    <Pressable key={btn.id} onPress={() => {
                      const p = btn.value;
                      const amt = p.is_percentage ? Number((total * (p.amount || 0) / 100).toFixed(3)) : Number(p.amount || 0);
                      setDiscountAmount(amt);
                      setDiscountModalVisible(false);
                    }} style={{ width:'30%', aspectRatio:1, marginBottom:12, borderRadius:10, backgroundColor:'#f3f4f6', justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#e6e6e6' }}>
                      <Text style={{ fontWeight:'800', fontSize:16 }}>{btn.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems:'center' }}>
                  <Text style={{ color:'#666', marginBottom:12 }}>No discounts defined. Add discounts from Manage.</Text>
                  <TouchableOpacity onPress={() => { setManageModalVisible(true); setDiscountModalVisible(false); }} style={{ paddingVertical:10, paddingHorizontal:16, backgroundColor:'#06b6d4', borderRadius:8 }}>
                    <Text style={{ color:'#fff', fontWeight:'700' }}>Open Manage</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <TouchableOpacity onPress={() => setDiscountModalVisible(false)} style={{ marginTop:8, width:'100%', paddingVertical:12, borderRadius:8, backgroundColor:'#f3f4f6', alignItems:'center' }}>
              <Text style={{ color:'#6b7280', fontWeight:'700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Per-line Discount Modal */}
      <Modal visible={lineDiscountModalVisible} animationType="slide" transparent={true} onRequestClose={() => { setLineDiscountModalVisible(false); setSelectedLine(null); }}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width: '80%', backgroundColor:'#fff', borderRadius:12, padding:20, alignItems:'center' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:10 }}>Apply Discount to</Text>
            <Text style={{ fontSize:16, fontWeight:'700', marginBottom:12 }}>{selectedLine ? selectedLine.name : ''}</Text>
            <Text style={{ color:'#666', marginBottom:10 }}>Select percentage</Text>
            <View style={{ width:'100%', flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
              {(discountPresets && discountPresets.length > 0 ? discountPresets.slice(0,6).map(p => ({ id: p.id, label: p.is_percentage ? `${p.amount}%` : `${Number(p.amount).toFixed(3)}`, value: p })) : [10,20,30,40,45,50].map(v => ({ id: `def_${v}`, label: `${v}%`, value: { amount: v, is_percentage: true } }))).map(btn => (
                <Pressable key={btn.id} onPress={() => {
                  const p = btn.value;
                  if (!selectedLine) return;
                  const unit = Number(selectedLine.unit || selectedLine.price_unit || selectedLine.price || 0);
                  const qty = Number(selectedLine.qty || selectedLine.quantity || 1);
                  const rawSubtotal = unit * qty;
                  let percent = 0;
                  if (p.is_percentage) percent = Number(p.amount) || 0;
                  else percent = rawSubtotal > 0 ? Number(((Number(p.amount) || 0) / rawSubtotal * 100).toFixed(3)) : 0;
                  setProductDiscount(selectedLine.rawItem?.id ?? selectedLine.id, percent);
                  setLineDiscountModalVisible(false);
                  setSelectedLine(null);
                }} style={{ width:'30%', aspectRatio:1, marginBottom:12, borderRadius:10, backgroundColor:'#f3f4f6', justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#e6e6e6' }}>
                  <Text style={{ fontWeight:'800', fontSize:16 }}>{btn.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection:'row', marginTop:8, width:'100%', justifyContent:'space-between' }}>
              <TouchableOpacity onPress={() => { if (selectedLine) { setProductDiscount(selectedLine.rawItem?.id ?? selectedLine.id, 0); } setLineDiscountModalVisible(false); setSelectedLine(null); }} style={{ paddingVertical:10, paddingHorizontal:12, borderRadius:8, backgroundColor:'#f3f4f6' }}>
                <Text style={{ color:'#6b7280', fontWeight:'700' }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setLineDiscountModalVisible(false); setSelectedLine(null); }} style={{ paddingVertical:10, paddingHorizontal:12, borderRadius:8, backgroundColor:'#f3f4f6' }}>
                <Text style={{ color:'#6b7280', fontWeight:'700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Manage Discounts Modal (triggered from footer Manage button) */}

      <Modal visible={manageModalVisible} animationType="slide" transparent={true} onRequestClose={() => setManageModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16 }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Manage Discounts</Text>
            <TouchableOpacity onPress={() => { setAddModalVisible(true); setManageModalVisible(false); }} style={{ padding:12, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:10 }}>
              <Text style={{ fontWeight:'700' }}>➕ Add Discount</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditModalVisible(true); setManageModalVisible(false); }} style={{ padding:12, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:10 }}>
              <Text style={{ fontWeight:'700' }}>✏️ Edit Discount</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setDeleteModalVisible(true); setManageModalVisible(false); }} style={{ padding:12, borderWidth:1, borderColor:'#eee', borderRadius:8, marginBottom:10 }}>
              <Text style={{ fontWeight:'700' }}>🗑️ Delete Discount</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setManageModalVisible(false)} style={{ padding:12, marginTop:8 }}>
              <Text style={{ color:'#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Discount Modal (simple percentage only) */}
      <Modal visible={addModalVisible} animationType="slide" transparent={true} onRequestClose={() => setAddModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16 }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Add New Discount</Text>
            <Text style={{ fontSize:13, color:'#666', marginBottom:10 }}>Enter discount percentage</Text>
            <View style={{ flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, paddingHorizontal:8, paddingVertical:6, marginBottom:12 }}>
              <TextInput placeholder="15" value={addAmount} onChangeText={(t) => setAddAmount(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" style={{ flex:1, fontSize:22, textAlign:'center', padding:8 }} />
              <Text style={{ fontSize:20, fontWeight:'800', color:'#10b981', marginLeft:8 }}>%</Text>
            </View>
            <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
              <TouchableOpacity onPress={() => { setAddModalVisible(false); setAddAmount(''); }} style={{ padding:12 }}>
                <Text style={{ color:'#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                const amt = parseFloat(addAmount) || 0;
                const name = `${amt}%`;
                const newPreset = { id: `local_${Date.now()}`, name, amount: amt, is_percentage: true };
                const updated = Array.isArray(discountPresets) ? [...discountPresets, newPreset] : [newPreset];
                await persistPresets(updated);
                Toast.show({ type:'success', text1:'Created', text2:`${name} discount added` });
                setAddModalVisible(false);
                setAddAmount('');
              }} style={{ backgroundColor:'#10b981', paddingVertical:12, paddingHorizontal:16, borderRadius:8 }}>
                <Text style={{ color:'#fff', fontWeight:'800' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Discount Modal (list then edit) */}
      <Modal visible={editModalVisible} animationType="slide" transparent={true} onRequestClose={() => setEditModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16, maxHeight:'80%' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Edit Discount</Text>
            <FlatList data={discountPresets} keyExtractor={d => String(d.id)} renderItem={({item}) => (
              <TouchableOpacity onPress={() => setEditingPreset(item)} style={{ padding:12, borderBottomWidth:1, borderColor:'#f3f4f6' }}>
                <Text style={{ fontWeight:'700' }}>{item.name} {item.is_percentage ? `(${item.amount}%)` : `(${Number(item.amount).toFixed(3)})`}</Text>
              </TouchableOpacity>
            )} />
            {editingPreset ? (
              <View style={{ marginTop:12 }}>
                <Text style={{ marginBottom:8, color:'#444' }}>Edit percentage for <Text style={{ fontWeight:'800' }}>{editingPreset.name}</Text></Text>
                <View style={{ flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#e5e7eb', borderRadius:8, paddingHorizontal:8, paddingVertical:6, marginBottom:12 }}>
                  <TextInput placeholder="15" value={String(editingPreset.amount)} onChangeText={(t) => setEditingPreset(prev => ({...prev, amount: Number(t.replace(/[^0-9.]/g, '')) || 0}))} keyboardType="numeric" style={{ flex:1, fontSize:20, textAlign:'center', padding:8 }} />
                  <Text style={{ fontSize:20, fontWeight:'800', color:'#10b981', marginLeft:8 }}>%</Text>
                </View>
                <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
                  <TouchableOpacity onPress={() => { setEditingPreset(null); }} style={{ padding:12 }}>
                    <Text style={{ color:'#6b7280' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={async () => {
                    const vals = { name: `${editingPreset.amount}%`, amount: editingPreset.amount, is_percentage: true };
                    const updated = (Array.isArray(discountPresets) ? discountPresets.map(d => d.id === editingPreset.id ? { ...d, ...vals } : d) : [{ ...editingPreset, ...vals }]);
                    await persistPresets(updated);
                    Toast.show({ type:'success', text1:'Updated' });
                    setEditingPreset(null);
                    setEditModalVisible(false);
                  }} style={{ backgroundColor:'#2563eb', paddingVertical:12, paddingHorizontal:16, borderRadius:8 }}>
                    <Text style={{ color:'#fff', fontWeight:'800' }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Delete Discount Modal */}
      <Modal visible={deleteModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:'90%', backgroundColor:'#fff', borderRadius:8, padding:16, maxHeight:'80%' }}>
            <Text style={{ fontWeight:'800', fontSize:18, marginBottom:12 }}>Delete Discount</Text>
                <FlatList data={discountPresets} keyExtractor={d => String(d.id)} renderItem={({item}) => (
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderColor:'#f3f4f6' }}>
                <Text>{item.name} {item.is_percentage ? `(${item.amount}%)` : `(${Number(item.amount).toFixed(3)})`}</Text>
                <TouchableOpacity onPress={async () => {
                  const updated = (Array.isArray(discountPresets) ? discountPresets.filter(d => d.id !== item.id) : []);
                  await persistPresets(updated);
                  Toast.show({ type:'success', text1:'Deleted' });
                }} style={{ padding:8, backgroundColor:'#f97316', borderRadius:6 }}>
                  <Text style={{ color:'#fff' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            )} />
            <TouchableOpacity onPress={() => setDeleteModalVisible(false)} style={{ padding:12, marginTop:8 }}>
              <Text style={{ color:'#6b7280' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default TakeoutDelivery;
