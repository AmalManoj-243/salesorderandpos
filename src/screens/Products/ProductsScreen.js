import React, { useEffect, useCallback } from 'react';
import { View } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { ProductsList } from '@components/Product';
// ⬇️ CHANGE: use Odoo version instead of old backend
import { fetchProductsOdoo } from '@api/services/generalApi';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { formatData } from '@utils/formatters';
import { OverlayLoader } from '@components/Loader';
import { RoundedContainer, SafeAreaView, SearchContainer } from '@components/containers';
import styles from './styles';
import { EmptyState } from '@components/common/empty';
import useDataFetching from '@hooks/useDataFetching';
import useDebouncedSearch from '@hooks/useDebouncedSearch';
import Toast from 'react-native-toast-message';
import { useProductStore } from '@stores/product';

const ProductsScreen = ({ navigation, route }) => {
  const categoryId = route?.params?.categoryId || '';
  const autoFocus = route?.params?.autoFocus || false;
  useEffect(() => {
    console.log('ProductsScreen: categoryId:', categoryId);
  }, [categoryId]);
  const { fromCustomerDetails } = route.params || {};

  const isFocused = useIsFocused();
  const { addProduct, setCurrentCustomer } = useProductStore();

  // ⬇️ CHANGE: hook now uses fetchProductsOdoo
  const { data, loading, fetchData, fetchMoreData } = useDataFetching(fetchProductsOdoo);

  const { searchText, handleSearchTextChange } = useDebouncedSearch(
    (text) => fetchData({ searchText: text, categoryId }),
    500
  );

  useFocusEffect(
    useCallback(() => {
      fetchData({ searchText, categoryId });
    }, [categoryId, searchText])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData({ searchText, categoryId });
    }
  }, [isFocused, categoryId, searchText]);

  // If opened from POS, ensure cart owner is the POS guest so quick-add works
  useEffect(() => {
    if (fromCustomerDetails || route?.params?.fromPOS) {
      try { setCurrentCustomer('pos_guest'); } catch (e) { /* ignore */ }
    }
  }, [route?.params?.fromPOS, fromCustomerDetails]);

  const handleLoadMore = () => {
    fetchMoreData({ searchText, categoryId });
  };

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <View style={[styles.itemStyle, styles.itemInvisible]} />;
    }
    const handleQuickAdd = () => {
      try {
        const product = {
          id: item.id,
          name: item.product_name || item.name,
          price: item.price || item.list_price || 0,
          quantity: 1,
        };
        addProduct(product);
        Toast.show({ type: 'success', text1: 'Added', text2: product.name });
      } catch (e) {
        console.warn('Quick add failed', e);
      }
    };

    return (
      <ProductsList
        item={item}
        onPress={() => navigation.navigate('ProductDetail', { detail: item, fromCustomerDetails, fromPOS: route?.params?.fromPOS })}
        showQuickAdd={!!route?.params?.fromPOS}
        onQuickAdd={handleQuickAdd}
      />
    );
  };

  const renderEmptyState = () => (
    <EmptyState imageSource={require('@assets/images/EmptyData/empty_data.png')} message={''} />
  );

  const renderContent = () => (
    <FlashList
      data={formatData(data, 3)}
      numColumns={3}
      renderItem={renderItem}
      keyExtractor={(item, index) => index.toString()}
      contentContainerStyle={{ padding: 10, paddingBottom: 50 }}
      onEndReached={handleLoadMore}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.2}
      estimatedItemSize={100}
    />
  );

  const renderProducts = () => {
    console.log('ProductsScreen: products returned:', data.length);
    if (data.length === 0 && !loading) {
      return renderEmptyState();
    }
    return renderContent();
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Products" onBackPress={() => navigation.goBack()} />
      <SearchContainer
        placeholder="Search Products"
        onChangeText={handleSearchTextChange}
        value={searchText}
        autoFocus={autoFocus}
      />
      <RoundedContainer>
        {renderProducts()}
      </RoundedContainer>
      <OverlayLoader visible={loading} />
    </SafeAreaView>
  );
};

export default ProductsScreen;
