import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';

const ProductsList = ({ item, onPress, showQuickAdd, onQuickAdd }) => {
    const errorImage = require('@assets/images/error/error.png');
    const [imageLoading, setImageLoading] = useState(true);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setImageLoading(false);
        }, 10000);
        return () => clearTimeout(timeout);
    }, []);

    const truncatedName =
        item?.product_name?.length > 35 ? item?.product_name?.substring(0, 60) + '...' : item?.product_name;

    const currency = useCurrencyStore((state) => state.currency);
    const priceValue = (item?.price ?? item?.list_price ?? 0);

    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.container}
            activeOpacity={0.92}
        >
            <View style={styles.cardShadow}>
                {showQuickAdd && (
                    <TouchableOpacity style={styles.plusBtn} onPress={() => onQuickAdd?.(item)}>
                        <Text style={styles.plusText}>+</Text>
                    </TouchableOpacity>
                )}
                {imageLoading && <ActivityIndicator size="small" color={COLORS.primaryThemeColor} style={styles.activityIndicator} />}
                <Image
                    source={item?.image_url ? { uri: item.image_url } : errorImage}
                    style={styles.image}
                    onLoad={() => setImageLoading(false)}
                    onError={() => setImageLoading(false)}
                />
                <View style={styles.textContainer}>
                    <Text style={styles.name}>{truncatedName?.trim()}</Text>
                    <Text style={styles.price}>{priceValue?.toString ? Number(priceValue).toFixed(3) : priceValue} OMR</Text>
                    <Text style={styles.code}>{item.product_code ?? item.code ?? item.default_code ?? ''}</Text>
                    <Text style={styles.category}>
                        {item?.category?.category_name
                            || (Array.isArray(item?.categ_id) ? item.categ_id[1] : null)
                            || item?.category_name
                            || ''}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );
};

export default ProductsList;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        margin: 8,
        backgroundColor: '#f8f8fa',
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.10,
        shadowRadius: 6,
        elevation: 4,
        width: 160,
        height: 210,
        padding: 0,
    },
    cardShadow: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 6,
    },
    activityIndicator: {
        position: 'absolute',
        top: 38,
        left: 60,
    },
    image: {
        width: 100,
        height: 110,
        resizeMode: 'contain',
        borderRadius: 10,
        alignSelf: 'center',
        marginBottom: 6,
        backgroundColor: '#f2f2f2',
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    name: {
        fontSize: 14,
        textAlign: 'center',
        textTransform: 'capitalize',
        color: '#2E2B2B',
        fontFamily: FONT_FAMILY.urbanistBold,
        marginBottom: 2,
    },
    price: {
        fontSize: 15,
        textAlign: 'center',
        color: COLORS.green,
        marginTop: 2,
        fontFamily: FONT_FAMILY.urbanistBold,
        marginBottom: 2,
    },
    plusBtn: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.orange,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        shadowColor: COLORS.orange,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
        elevation: 6,
    },
    plusText: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
    },
    category: {
        fontSize: 12,
        textAlign: 'center',
        color: COLORS.primaryThemeColor,
        marginTop: 2,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    code: {
        fontSize: 11,
        textAlign: 'center',
        color: COLORS.orange,
        marginTop: 2,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
});
