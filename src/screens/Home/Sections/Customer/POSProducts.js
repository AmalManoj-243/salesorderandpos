import React, { useEffect, useCallback } from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { NavigationHeader } from '@components/Header';
import ProductsList from '@components/Product/ProductsList';
import useDataFetching from '@hooks/useDataFetching';
import { fetchProductsOdoo } from '@api/services/generalApi';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { useProductStore } from '@stores/product';

const POSProducts = ({ navigation, route }) => {
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);
  const isFocused = useIsFocused();
  const { addProduct, setCurrentCustomer } = useProductStore();

  useFocusEffect(
    useCallback(() => {
      setCurrentCustomer('pos_guest');
      fetchData({ searchText: '', limit: 50 });
    }, [])
  );

  useEffect(() => {
    if (isFocused) fetchData({ searchText: '', limit: 50 });
  }, [isFocused]);

  useEffect(() => {
    if (data && data.length > 0) {
      console.log('[POSProducts] Fetched products count:', data.length);
      console.log('[POSProducts] Product details:', data.map(p => ({
        id: p.id,
        name: p.name || p.product_name || p.display_name,
        price: p.lst_price ?? p.price ?? p.list_price ?? p.price_unit,
        code: p.default_code || p.product_code,
        category: Array.isArray(p.categ_id) ? p.categ_id[1] : p.category_name,
        image_url: p.image_url || p.image_1920
      })));
    }
  }, [data]);

  const mapToStoreProduct = (p) => {
    return {
      id: `prod_${p.id}`,
      remoteId: p.id,
      name: p.name || p.product_name || p.display_name || p.product_name || 'Product',
      price: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
      price_unit: Number(p.lst_price ?? p.price ?? p.list_price ?? p.price_unit ?? 0),
      quantity: 1,
      qty: 1,
      image_url: p.image_url || p.image_1920 || null,
      product_code: p.default_code || p.product_code || p.code || null,
      category: { category_name: p.categ_id && Array.isArray(p.categ_id) ? p.categ_id[1] : (p.category_name || '') }
    };
  };

  const handlePress = (item) => {
    console.log('[POSProducts] Product clicked:', {
      id: item.id,
      name: item.name || item.product_name || item.display_name,
      price: item.lst_price ?? item.price ?? item.list_price ?? item.price_unit,
      code: item.default_code || item.product_code,
      category: Array.isArray(item.categ_id) ? item.categ_id[1] : item.category_name,
      raw_item: item
    });
    const prod = mapToStoreProduct(item);
    console.log('[POSProducts] Mapped product for store:', prod);
    addProduct(prod);
    navigation.goBack();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handlePress(item)}>
      <ProductsList item={item} onPress={() => handlePress(item)} showQuickAdd={false} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />
      <FlatList
        data={data}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        numColumns={2}
        onEndReached={() => fetchMoreData({})}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ padding: 8 }}
      />
    </View>
  );
};

export default POSProducts;
