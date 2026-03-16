import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { RootStackParamList } from './src/types';

// Importer tous les écrans
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
// import ParcelleDetailScreen from './src/screens/ParcelleDetailScreen'; // À créer plus tard

const Stack = createStackNavigator<RootStackParamList>();

// Écran de chargement
const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" color="#2E7D32" />
  </View>
);

// Navigateur principal
function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
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
            options={{ 
              title: 'Mes parcelles',
              headerLeft: () => null // Empêche de revenir en arrière
            }}
          />
          <Stack.Screen 
            name="Map" 
            component={MapScreen} 
            options={{ 
              title: 'Ajouter une parcelle',
              headerBackTitle: 'Retour'
            }}
          />
          {/* À décommenter plus tard
          <Stack.Screen 
            name="ParcelleDetail" 
            component={ParcelleDetailScreen} 
            options={{ title: 'Détail parcelle' }}
          />
          */}
        </>
      ) : (
        // Écrans pour non connecté
        <>
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

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}