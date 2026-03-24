import React, { useEffect, useState, useRef } from 'react';
import { AppState, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface Props {
  children: React.ReactNode;
}

const AppLockWrapper: React.FC<Props> = ({ children }) => {
  const { user } = useAuth();
  const { isDark, colors } = useTheme();
  const [isLocked, setIsLocked] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    checkInitialLockStatus();
    
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        checkLockOnResume();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user]);

  const checkInitialLockStatus = async () => {
    if (!user) {
      setIsLocked(false);
      return;
    }
    const enabled = await AsyncStorage.getItem('app_locked');
    if (enabled === 'true') {
      setIsLocked(true);
      authenticate();
    }
  };

  const checkLockOnResume = async () => {
    if (!user) return;
    const enabled = await AsyncStorage.getItem('app_locked');
    if (enabled === 'true') {
      setIsLocked(true);
      authenticate();
    }
  };

  const authenticate = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        setIsLocked(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Déverrouiller AgroVision AI',
        fallbackLabel: 'Utiliser le code secret',
        cancelLabel: 'Annuler',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
      }
    } catch (error) {
      console.warn('Erreur authentification:', error);
    }
  };

  if (isLocked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Icon name="shield-lock-outline" size={80} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>Application Verrouillée</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Authentifiez-vous pour accéder à vos données agricoles</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={authenticate}>
          <Icon name="fingerprint" size={24} color="#fff" />
          <Text style={styles.buttonText}>Déverrouiller</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});

export default AppLockWrapper;
