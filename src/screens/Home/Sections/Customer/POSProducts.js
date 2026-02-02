import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, FlatList } from 'react-native';
import { NavigationHeader } from '@components/Header';
import ProductsList from '@components/Product/ProductsList';
import { fetchProductsOdoo } from '@api/services/generalApi';
import { useFocusEffect } from '@react-navigation/native';
import { useProductStore } from '@stores/product';
import { memGet } from '@api/services/memoryCache';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ITEM_HEIGHT = 246;

const POSProducts = ({ navigation, route }) => {
  // SYNCHRONOUS memory cache read — products appear on the very first frame
  const initialData = memGet('products_null');
  const [data, setData] = useState(initialData || []);
  const hasData = useRef(!!(initialData && initialData.length > 0));
  const isFetching = useRef(false);
  const { addProduct, setCurrentCustomer } = useProductStore();

  // Fallback: if no memory cache, try AsyncStorage
  useEffect(() => {
    if (!hasData.current) {
      AsyncStorage.getItem('cached_products_null').then(cached => {
        if (cached && !hasData.current) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.length > 0) {
              setData(parsed);
              hasData.current = true;
            }
          } catch (e) {}
        }
      }).catch(() => {});
    }
  }, []);

  // Background refresh — never blocks UI
  useFocusEffect(
    useCallback(() => {
      setCurrentCustomer('pos_guest');
      if (isFetching.current) return;
      isFetching.current = true;
      fetchProductsOdoo({ searchText: '', limit: 50 })
        .then(list => {
          if (list && list.length > 0) {
            setData(list);
            hasData.current = true;
          }
        })
        .catch(() => {})
        .finally(() => { isFetching.current = false; });
    }, [])
  );

  const mapToStoreProduct = useCallback((p) => ({
    id: `prod_${p.id}`,
    remoteId: p.id,
    name: p.name || p.product_name || p.display_name || 'Product',
    price: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
    price_unit: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
    quantity: 1,
    qty: 1,
    image_url: p.image_url || p.image_1920 || null,
    product_code: p.default_code || p.product_code || p.code || null,
    category: { category_name: p.categ_id && Array.isArray(p.categ_id) ? p.categ_id[1] : (p.category_name || '') }
  }), []);

  const handlePress = useCallback((item) => {
    addProduct(mapToStoreProduct(item));
    navigation.goBack();
  }, [addProduct, mapToStoreProduct, navigation]);

  const renderItem = useCallback(({ item }) => (
    <ProductsList item={item} onPress={() => handlePress(item)} showQuickAdd={false} />
  ), [handlePress]);

  const keyExtractor = useCallback((i) => String(i.id), []);

  const getItemLayout = useCallback((_, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * Math.floor(index / 2),
    index,
  }), []);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={{ padding: 8 }}
        getItemLayout={getItemLayout}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={3}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={30}
      />
    </View>
  );
};

export default POSProducts;
