import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, Dimensions, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';

const { width, height } = Dimensions.get('window');

type OnboardingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Onboarding'>;

interface Props {
  navigation: OnboardingScreenNavigationProp;
}

const slides = [
  {
    id: '1',
    image: require('../assets/slide 1.jpg'),
    title: '🛰 SURVEILLANCE PAR SATELLITE',
    subtitle: "Visualisez l'état de santé de vos parcelles",
    description: "Des images satellite Sentinel-2 analysent votre parcelle entière.\nDétectez les zones à risque sur l'ensemble de votre exploitation,\nquelle que soit la culture (manioc, maïs, banane, etc.).\n\n→ Une vision globale, parcelle par parcelle",
  },
  {
    id: '2',
    image: require('../assets/slide 2.jpg'),
    title: '🗺 CARTE INTERACTIVE DES INFECTIONS',
    subtitle: "Visualisez l'étendue des zones touchées",
    description: "Dessinez vos parcelles directement sur la carte. L'IA analyse chaque zone et\nvous montre précisément où la végétation est en stress.\n\n→ Superficie exacte infectée en hectares",
  },
  {
    id: '3',
    image: require('../assets/slide 3.jpg'),
    title: '📈 PRÉDICTION DE PROPAGATION',
    subtitle: 'Anticipez l\'évolution de la maladie',
    description: 'Notre modèle intègre la météo (température, humidité, vent)\npour prédire comment la maladie va se propager dans les 7 jours.\n\n→ Planifiez vos interventions avant la prochaine épidémie\n✨ Le tout avec des modèles IA',
  }
];

const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = async () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      await AsyncStorage.setItem('has_seen_onboarding', 'true');
      navigation.replace('Login');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('has_seen_onboarding', 'true');
    navigation.replace('Login');
  };

  const updateCurrentIndex = (e: any) => {
    const contentOffsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / width);
    setCurrentIndex(index);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={[styles.slide, { width }]}>
      <Image source={item.image} style={styles.image} resizeMode="cover" />
      <View style={[styles.textContainer, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.primary }]}>{item.title}</Text>
        <Text style={[styles.subtitle, { color: colors.text }]}>{item.subtitle}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>{item.description}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        bounces={false}
        onMomentumScrollEnd={updateCurrentIndex}
      />
      <View style={[styles.footer, { backgroundColor: colors.surface }]}>
        <View style={styles.indicatorContainer}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.indicator,
                currentIndex === index ? [styles.indicatorActive, { backgroundColor: colors.primary }] : [styles.indicatorInactive, { backgroundColor: colors.border }],
              ]}
            />
          ))}
        </View>
        <View style={styles.buttonContainer}>
          {currentIndex < slides.length - 1 ? (
            <>
              <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                <Text style={[styles.skipText, { color: colors.textSecondary }]}>Passer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNext} style={[styles.nextButton, { backgroundColor: colors.primary }]}>
                <Text style={styles.nextText}>Suivant</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={handleNext} style={[styles.getStartedButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.getStartedText}>Commencer !</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: { flex: 1, alignItems: 'center' },
  image: { width: '100%', height: height * 0.55 },
  textContainer: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30, 
  },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 16, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  footer: { paddingBottom: 40, paddingHorizontal: 20, paddingTop: 10, width: '100%' },
  indicatorContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  indicator: { height: 8, borderRadius: 4, marginHorizontal: 4 },
  indicatorActive: { width: 24 },
  indicatorInactive: { width: 8 },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipButton: { padding: 15 },
  skipText: { fontSize: 16, fontWeight: 'bold' },
  nextButton: { paddingVertical: 15, paddingHorizontal: 30, borderRadius: 25 },
  nextText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  getStartedButton: { flex: 1, paddingVertical: 15, borderRadius: 25, alignItems: 'center' },
  getStartedText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

export default OnboardingScreen;
