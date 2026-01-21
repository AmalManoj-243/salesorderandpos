import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Text,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  TextInput,
  Pressable,
} from "react-native";
import {
  CarouselPagination,
  ListHeader,
  Header,
} from "@components/Home";
import { ListItem } from '@components/Options';
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { fetchCategoriesOdoo } from "@api/services/generalApi";
import { RoundedContainer, SafeAreaView } from "@components/containers";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { showToastMessage } from "@components/Toast";
import { useDataFetching, useLoader } from "@hooks";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useAuthStore } from '@stores/auth';
import { OverlayLoader } from "@components/Loader";

// Search Bar Component
const SearchBar = ({ onPress, isTablet }) => {
  const searchIcon = require('@assets/images/Home/Header/search.png');

  return (
    <Pressable onPress={onPress} style={[
      styles.searchContainer,
      isTablet && styles.searchContainerTablet
    ]}>
      <View style={[
        styles.searchBar,
        isTablet && styles.searchBarTablet
      ]}>
        <Image
          source={searchIcon}
          style={[
            styles.searchIcon,
            isTablet && { width: 22, height: 22 }
          ]}
        />
        <Text style={[
          styles.searchPlaceholder,
          isTablet && { fontSize: 16 }
        ]}>
          What are you looking for?
        </Text>
      </View>
    </Pressable>
  );
};

// Category Item Component with responsive sizing
const CategoryItem = ({ item, onPress, isTablet }) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const categoryIcon = require('@assets/icons/bottom_tabs/category.png');

  const displayName = item?.name || item?.category_name || 'Category';
  const maxLength = isTablet ? 16 : 12;
  const truncatedName = displayName.length > maxLength
    ? displayName.substring(0, maxLength - 1) + '...'
    : displayName;

  const hasValidImage = item?.image_url &&
    item.image_url !== false &&
    item.image_url !== 'false' &&
    !item.image_url.includes('undefined') &&
    !imageError;

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  // Responsive sizes - mobile vs tablet
  const imageSize = isTablet ? 70 : 45;
  const itemMinHeight = isTablet ? 140 : 100;
  const fontSize = isTablet ? 14 : 11;
  const itemMargin = isTablet ? 10 : 5;
  const itemPadding = isTablet ? 18 : 12;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.categoryItem,
        { minHeight: itemMinHeight, margin: itemMargin, padding: itemPadding }
      ]}
    >
      {imageLoading && hasValidImage && (
        <ActivityIndicator 
          size="small" 
          color={COLORS.primaryThemeColor} 
          style={styles.imageLoader} 
        />
      )}
      <View style={[styles.imageContainer, { width: imageSize, height: imageSize }]}>
        {hasValidImage ? (
          <Image
            source={{ uri: item.image_url }}
            style={[styles.categoryImage, { width: imageSize, height: imageSize }]}
            onLoad={() => setImageLoading(false)}
            onError={handleImageError}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={categoryIcon}
            style={[styles.categoryImage, styles.categoryIconFallback, { width: imageSize, height: imageSize }]}
            resizeMode="contain"
          />
        )}
      </View>
      <Text style={[styles.categoryName, { fontSize }]} numberOfLines={2}>{truncatedName}</Text>
    </TouchableOpacity>
  );
};

// Format data for grid display
const formatData = (data, numColumns) => {
  if (!data || !Array.isArray(data)) return [];
  const clonedData = [...data];
  const numberOfFullRows = Math.floor(clonedData.length / numColumns);
  let numberOfElementsLastRow = clonedData.length - numberOfFullRows * numColumns;
  while (numberOfElementsLastRow !== numColumns && numberOfElementsLastRow !== 0) {
    clonedData.push({ id: `blank-${numberOfElementsLastRow}`, empty: true });
    numberOfElementsLastRow++;
  }
  return clonedData;
};

const HomeScreen = ({ navigation }) => {
  const [backPressCount, setBackPressCount] = useState(0);
  const isFocused = useIsFocused();
  
  // Get responsive dimensions
  const { width, height } = useWindowDimensions();
  const isSmallMobile = width < 360;
  const isMobile = width >= 360 && width < 600;
  const isTablet = width >= 600;
  const numColumns = isTablet ? 4 : 3;
  
  const { data, loading, fetchData, fetchMoreData } =
    useDataFetching(fetchCategoriesOdoo);

  const handleBackPress = useCallback(() => {
    if (navigation.isFocused()) {
      if (backPressCount === 0) {
        setBackPressCount(1);
        return true;
      } else if (backPressCount === 1) {
        BackHandler.exitApp();
      }
    }
    return false;
  }, [backPressCount, navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );
    return () => backHandler.remove();
  }, [handleBackPress]);

  useEffect(() => {
    const backPressTimer = setTimeout(() => {
      setBackPressCount(0);
    }, 2000);

    return () => clearTimeout(backPressTimer);
  }, [backPressCount]);

  useEffect(() => {
    if (backPressCount === 1) {
      showToastMessage("Press back again to exit");
    }
  }, [backPressCount]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  useEffect(() => {
    if (data && Array.isArray(data)) {
      console.log('[Home] Fetched categories from Odoo (product.category):', data.length);
    }
  }, [data]);

  const handleLoadMore = () => {
    fetchMoreData();
  };

  const authUser = useAuthStore((s) => s.user);

  useEffect(() => {
    if (authUser) {
      const uid = authUser.uid || authUser.id || null;
      const uname = authUser.name || authUser.username || authUser.partner_display_name || null;
      console.log('[AUTH] current user id:', uid, 'name:', uname);
    } else {
      console.log('[AUTH] no authenticated user');
    }
  }, [authUser]);

  const handleCategoryPress = (category) => {
    console.log('[Home] Selected category:', category);
    navigation.navigate('Products', { 
      categoryId: category._id || category.id,
      categoryName: category.name || category.category_name 
    });
  };

  const renderItem = ({ item }) => {
    const itemMargin = isTablet ? 10 : 5;
    if (item.empty) {
      return <View style={[styles.categoryItem, styles.itemInvisible, { margin: itemMargin }]} />;
    }
    return (
      <CategoryItem
        item={item}
        onPress={() => handleCategoryPress(item)}
        isTablet={isTablet}
      />
    );
  };

  const navigateToScreen = (screenName) => {
    navigation.navigate(screenName);
  };

  // Handle search press - navigate to SearchOptions screen
  const handleSearchPress = () => {
    navigation.navigate('SearchOptionsScreen');
  };

  // Responsive snap points for mobile and tablet
  const snapPoints = useMemo(() => {
    if (isTablet) {
      return ["50%", "78%"];
    }
    // Mobile snap points based on screen height
    if (height < 700) {
      return ["44%", "82%"];
    } else if (height < 800) {
      return ["46%", "84%"];
    } else {
      return ["48%", "88%"];
    }
  }, [height, isTablet]);

  const [detailLoading] = useLoader(false);

  // Responsive styles - simplified for mobile vs tablet
  const carouselMargin = isTablet
    ? { marginTop: 5, marginBottom: -12 }
    : { marginTop: 0, marginBottom: -10 };

  const buttonsMargin = isTablet
    ? { marginTop: 28, marginBottom: 16, paddingHorizontal: 40 }
    : { marginTop: 16, marginBottom: 10, paddingHorizontal: 16 };

  const buttonGap = isTablet ? 40 : 20;

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <RoundedContainer>
        <Header />
        
        {/* Search Bar */}
        <SearchBar onPress={handleSearchPress} isTablet={isTablet} />
        
        <View style={carouselMargin}>
          <CarouselPagination />
        </View>

        {/* Action Buttons - Responsive */}
        <View style={[{ flexDirection: 'row', justifyContent: 'center', gap: buttonGap }, buttonsMargin]}>
          <ListItem
            title="Sales Order"
            image={require('@assets/images/Home/section/service.png')}
            onPress={() => navigateToScreen('SalesOrderChoice')}
            style={isTablet ? { width: 140, height: 140 } : { width: 100, height: 100 }}
          />
          <ListItem
            title="POS"
            image={require('@assets/images/Home/section/possss.png')}
            onPress={() => navigateToScreen('POSRegister')}
            style={isTablet ? { width: 140, height: 140 } : { width: 100, height: 100 }}
          />
        </View>

        <BottomSheet snapPoints={snapPoints} style={{ marginTop: isTablet ? 8 : 12 }}>
          <ListHeader title="Categories" />
          <BottomSheetFlatList
            key={numColumns}
            data={formatData(data, numColumns)}
            numColumns={numColumns}
            initialNumToRender={isTablet ? 12 : 9}
            renderItem={renderItem}
            keyExtractor={(item, index) => (item._id || item.id || index).toString()}
            contentContainerStyle={{ 
              paddingBottom: '25%', 
              paddingHorizontal: isTablet ? 16 : 8,
            }}
            onEndReached={handleLoadMore}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.2}
            ListFooterComponent={loading && <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />}
            ListEmptyComponent={
              !loading && (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, isTablet && { fontSize: 16 }]}>No categories available</Text>
                </View>
              )
            }
          />
        </BottomSheet>
        
        <OverlayLoader visible={detailLoading} />

      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  itemInvisible: {
    backgroundColor: "transparent",
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  
  categoryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    minHeight: 110,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  
  imageLoader: {
    position: 'absolute',
    top: 25,
    zIndex: 1,
  },
  
  imageContainer: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 8,
  },
  
  categoryImage: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
    borderRadius: 8,
  },
  
  categoryIconFallback: {
    tintColor: COLORS.primaryThemeColor || '#1316c5',
    opacity: 0.7,
  },
  
  categoryName: {
    fontSize: 12,
    textAlign: 'center',
    color: '#2c3e50',
    fontFamily: FONT_FAMILY?.urbanistBold || 'System',
    fontWeight: '700',
    lineHeight: 16,
  },
  
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  
  emptyText: {
    fontSize: 14,
    color: '#999',
  },

  // Search Bar Styles
  searchContainer: {
    paddingHorizontal: 16,
    marginTop: -85,
    marginBottom: 60,
  },

  searchContainerTablet: {
    paddingHorizontal: 24,
    marginBottom: 15,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 5,
  },

  searchBarTablet: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
  },

  searchIcon: {
    width: 18,
    height: 18,
    marginRight: 10,
    tintColor: '#c9a96e',
  },

  searchPlaceholder: {
    fontSize: 14,
    color: '#c9a96e',
    flex: 1,
    fontFamily: FONT_FAMILY?.urbanistMedium || 'System',
  },
});

export default HomeScreen;