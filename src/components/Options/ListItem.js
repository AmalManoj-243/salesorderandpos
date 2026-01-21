import React from 'react';
import { TouchableOpacity, Image, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const FONT_FAMILY = {
  urbanistBold: 'Urbanist-Bold',
};

const ListItem = ({ title, image, icon, iconFamily = 'Ionicons', onPress, style }) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;

  // Responsive sizes - mobile vs tablet
  const defaultSize = isTablet ? 140 : 100;
  const containerSize = {
    width: defaultSize,
    height: defaultSize,
    borderRadius: defaultSize / 2
  };
  const imageSize = isTablet ? { width: 45, height: 45 } : { width: 35, height: 35 };
  const iconSize = isTablet ? 45 : 35;
  const fontSize = isTablet ? 13 : 11;

  return (
    <TouchableOpacity style={[styles.container, containerSize, style]} onPress={onPress}>
      {image ? (
        <Image source={image} style={[styles.image, imageSize]} />
      ) : icon ? (
        <Ionicons name={icon} size={iconSize} color="black" style={styles.icon} />
      ) : null}
      <Text style={[styles.title, { fontSize }]} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderColor: '#ececec',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
    margin: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    padding: 8,
  },
  image: {
    width: 35,
    height: 35,
    marginBottom: 6,
  },
  icon: {
    marginBottom: 6,
  },
  title: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: 'black',
    textAlign: 'center',
  },
});

export default ListItem;
