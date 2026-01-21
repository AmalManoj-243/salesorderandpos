import { View, StyleSheet, Image, useWindowDimensions } from 'react-native'
import React, { useState } from 'react'
import Carousel, { Pagination } from 'react-native-snap-carousel';

const CarouselPagination = () => {
    const [activeSlide, setActiveSlide] = useState(0);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isTablet = screenWidth >= 600;
    
    const data = [
        { image: require('@assets/images/Home/Banner/sildeshow 1.png') },
        { image: require('@assets/images/Home/Banner/sildeshow 2.png') },
        { image: require('@assets/images/Home/Banner/sildeshow 3.png') },
        { image: require('@assets/images/Home/Banner/sildeshow 4.png') },
        { image: require('@assets/images/Home/Banner/sildeshow 5.png') }
    ];
    
    // Responsive margins and sizes
    const carouselMargin = isTablet ? 20 : 8;
    const imageHeight = isTablet ? screenHeight * 0.22 : screenHeight * 0.25;
    const paginationTop = isTablet ? screenHeight * 0.14 : screenHeight * 0.16;
    const dotSize = isTablet ? 10 : 8;

    return (
        <View>
            <Carousel
                data={data}
                renderItem={({ item }) => (
                    <View style={styles.item}>
                        <Image 
                            source={item.image} 
                            style={[
                                styles.image, 
                                { 
                                    height: imageHeight,
                                    borderRadius: isTablet ? 16 : 12,
                                }
                            ]} 
                        />
                    </View>
                )}
                sliderWidth={screenWidth - 2 * carouselMargin}
                itemWidth={screenWidth - 2 * carouselMargin}
                autoplay={true}
                loop={true}
                loopClonesPerSide={data.length}
                autoplayDelay={500}
                enableMomentum={false}
                lockScrollWhileSnapping={true}
                containerCustomStyle={[
                    styles.carouselContainer,
                    { marginHorizontal: carouselMargin }
                ]}
                autoplayInterval={3000}
                onSnapToItem={(index) => setActiveSlide(index)}
            />
            <View style={[styles.paginationContainer, { top: paginationTop }]}>
                <Pagination
                    dotsLength={data.length}
                    activeDotIndex={activeSlide}
                    containerStyle={styles.paginationDotsContainer}
                    dotStyle={[styles.paginationDot, { height: dotSize, borderRadius: dotSize / 2 }]}
                    inactiveDotOpacity={0.4}
                    inactiveDotScale={0.6}
                />
            </View>
        </View>
    )
}

export default CarouselPagination

const styles = StyleSheet.create({
    image: {
        width: '100%',
        borderWidth: 0,
        marginTop: -10,
    },
    carouselContainer: {
        marginVertical: 0,
        marginTop: -12,
    },
    paginationContainer: {
        position: 'absolute',
        width: '100%',
        alignItems: 'center',
    },
    paginationDotsContainer: {
        backgroundColor: 'transparent',
        paddingHorizontal: 10,
    },
    paginationDot: {
        marginHorizontal: 6,
        backgroundColor: '#5D5FEE',
    },
});