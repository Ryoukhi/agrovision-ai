import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const LoadingScreen: React.FC = () => {
  const { colors } = useTheme();
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in l'écran
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Animation de pulsation du logo (en boucle)
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();

  }, [pulseAnim, fadeAnim]);

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background, opacity: fadeAnim }]}>
      <Animated.Image 
        source={require('../assets/mylogo.png')} 
        style={[styles.logo, { transform: [{ scale: pulseAnim }] }]} 
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 40,
  },
  loader: {
    marginTop: 20,
  }
});

export default LoadingScreen;
