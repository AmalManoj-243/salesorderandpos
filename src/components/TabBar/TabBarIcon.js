// components/TabBarIcon.js
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY, SIZE, FONT_SIZE, ICON_SIZE, BORDER_RADIUS } from '@constants/theme';
const TabBarIcon = ({ iconComponent, label, focused }) => (
  <View style={styles.container}>
    <View style={[styles.iconContainer, { backgroundColor: focused ? COLORS.white : COLORS.primaryThemeColor }]}>
      <Image source={iconComponent} style={styles.icon} tintColor={focused ? COLORS.lightBlack : COLORS.white} />
    </View>
    <Text style={styles.label}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: SIZE.widthMedium,
    height: SIZE.tabIconHeight,
    borderRadius: BORDER_RADIUS.iconRadius,
  },
  icon: {
    width: ICON_SIZE.small,
    height: ICON_SIZE.small,
  },
  label: {
    color: COLORS.white,
    fontSize: FONT_SIZE.small,
    fontFamily: FONT_FAMILY.urbanistMedium,
  },
});

export default TabBarIcon;
