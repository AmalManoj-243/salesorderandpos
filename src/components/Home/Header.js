import React from 'react';
import { View, Image, StyleSheet, useWindowDimensions } from 'react-native';

const Header = () => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;

  // Responsive logo sizing
  const logoWidth = isTablet ? width * 0.50 : width * 0.45;

  return (
    <View style={styles.container}>
      <Image
        source={require('@assets/images/Home/Header/header_transparent_bg.png')}
        style={[
          styles.backgroundImage,
          { width: logoWidth }
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 20,
    marginTop: -25,
  },
  backgroundImage: {
    aspectRatio: 2.2,
    resizeMode: 'contain',
    opacity: 0.92,
  },
});

export default Header;
