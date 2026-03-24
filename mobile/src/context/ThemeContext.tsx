import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export const lightTheme = {
  background: '#F5F5F5',
  surface: '#FFFFFF',
  text: '#333333',
  textSecondary: '#757575',
  border: '#EEEEEE',
  primary: '#2E7D32',
  card: '#FFFFFF',
  danger: '#E53935',
};

export const darkTheme = {
  background: '#121212',
  surface: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  border: '#2C2C2C',
  primary: '#66BB6A',
  card: '#242424',
  danger: '#EF5350',
};

type ThemeColors = typeof lightTheme;

interface ThemeContextData {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: (isDark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    // Load saved theme or use system default
    AsyncStorage.getItem('dark_mode').then((val) => {
      if (val !== null) {
        setIsDark(val === 'true');
      } else {
        setIsDark(systemColorScheme === 'dark');
      }
    });
  }, [systemColorScheme]);

  const toggleTheme = async (value: boolean) => {
    setIsDark(value);
    await AsyncStorage.setItem('dark_mode', value ? 'true' : 'false');
  };

  const colors = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
