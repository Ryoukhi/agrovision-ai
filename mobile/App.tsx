import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackParamList } from './src/types';
import AppLockWrapper from './src/components/AppLockWrapper';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import './src/i18n';

// Importer tous les écrans
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import LoadingScreen from './src/screens/LoadingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import ParcelleDetailScreen from './src/screens/ParcelleDetailScreen';
import AnalyseDetailScreen from './src/screens/AnalyseDetailScreen'; // ← AJOUT IMPORTANT
import EditParcelleMapScreen from './src/screens/EditParcelleMapScreen';

const Stack = createStackNavigator<RootStackParamList>();

// Navigateur principal
function AppNavigator() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('has_seen_onboarding').then((value: string | null) => {
      // Si la clé n'existe pas, c'est le premier lancement
      setIsFirstLaunch(value === null);
    });
  }, []);

  if (loading || isFirstLaunch === null) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator>
      {user ? (
        // Écrans pour utilisateur connecté
        <>
          <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
            options={({ navigation }) => {
              const { colors } = useTheme();
              return { 
                title: 'AgroVision',
                headerLeft: () => null,
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
                headerRight: () => (
                  <TouchableOpacity 
                    onPress={() => navigation.navigate('Settings')}
                    style={{ marginRight: 15, padding: 5 }}
                  >
                    <MaterialCommunityIcons name="cog-outline" size={24} color={colors.primary} />
                  </TouchableOpacity>
                )
              };
            }}
          />
          <Stack.Screen 
            name="Map" 
            component={MapScreen} 
            options={{ 
              title: 'Ajouter une parcelle',
              headerBackTitle: t('cancel')
            }}
          />
          <Stack.Screen 
            name="ParcelleDetail" 
            component={ParcelleDetailScreen} 
            options={{ title: 'Détail parcelle' }}
          />
          <Stack.Screen 
            name="AnalyseDetail" 
            component={AnalyseDetailScreen} 
            options={{ title: t('view_diagnostic') }}
          />
          <Stack.Screen
            name="EditParcelleMap"
            component={EditParcelleMapScreen}
            options={{ title: 'Modifier coordonnées parcelle' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: t('settings_title'), headerBackTitle: t('cancel') }}
          />
        </>
      ) : (
        // Écrans pour non connecté
        <>
          {isFirstLaunch && (
            <Stack.Screen 
              name="Onboarding" 
              component={OnboardingScreen} 
              options={{ headerShown: false }}
            />
          )}
          <Stack.Screen 
            name="Login" 
            component={LoginScreen} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Register" 
            component={RegisterScreen} 
            options={{ title: 'Inscription' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

function RootApp() {
  const { isDark } = useTheme();
  
  const MyTheme = isDark ? {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: '#121212', card: '#1E1E1E', text: '#FFFFFF', border: '#2C2C2C' }
  } : {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: '#F5F5F5', card: '#FFFFFF', text: '#333333', border: '#EEEEEE' }
  };

  return (
    <AppLockWrapper>
      <NavigationContainer theme={MyTheme}>
        <AppNavigator />
      </NavigationContainer>
    </AppLockWrapper>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootApp />
      </AuthProvider>
    </ThemeProvider>
  );
}