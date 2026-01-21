import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const SearchOptionsScreen = ({ navigation }) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;

  const handleSearchProducts = () => {
    navigation.navigate('Products', {
      searchMode: true,
      autoFocus: true
    });
  };

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <NavigationHeader
        title="Choose an option"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
        <View style={styles.container}>
          <Text style={[styles.headerText, isTablet && { fontSize: 20 }]}>
            What are you looking for?
          </Text>

          <View style={[styles.optionsContainer, isTablet && styles.optionsContainerTablet]}>
            {/* Search Products Option */}
            <TouchableOpacity
              style={[styles.optionCard, isTablet && styles.optionCardTablet]}
              onPress={handleSearchProducts}
            >
              <View style={[styles.iconContainer, isTablet && styles.iconContainerTablet]}>
                <Image
                  source={require('@assets/images/Home/options/search_product.png')}
                  style={[styles.icon, isTablet && styles.iconTablet]}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.optionText, isTablet && { fontSize: 18 }]}>
                Search Products
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </RoundedContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingLeft: 10,
    alignItems: 'flex-start',
  },
  headerText: {
    fontSize: 18,
    fontFamily: FONT_FAMILY?.urbanistBold || 'System',
    color: '#1a1a2e',
    marginTop: 20,
    marginBottom: 40,
    textAlign: 'center',
    alignSelf: 'center',
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 20,
    flexWrap: 'wrap',
    marginTop: 20,
  },
  optionsContainerTablet: {
    gap: 30,
    marginTop: 40,
  },
  optionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    minHeight: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  optionCardTablet: {
    minWidth: 150,
    minHeight: 160,
    padding: 20,
    borderRadius: 18,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  iconContainerTablet: {
    width: 60,
    height: 60,
    borderRadius: 14,
    marginBottom: 12,
  },
  icon: {
    width: 26,
    height: 26,
    tintColor: COLORS.primaryThemeColor || '#1316c5',
  },
  iconTablet: {
    width: 32,
    height: 32,
  },
  optionText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY?.urbanistBold || 'System',
    color: '#333333',
    textAlign: 'center',
    fontWeight: '700',
  },
});

export default SearchOptionsScreen;
