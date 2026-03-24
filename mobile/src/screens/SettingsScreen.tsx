import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { isDark, colors, toggleTheme } = useTheme();
  const [appLocked, setAppLocked] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('app_locked').then(val => setAppLocked(val === 'true'));
  }, []);

  const toggleLanguage = async () => {
    const newLang = i18n.language === 'fr' ? 'en' : 'fr';
    await i18n.changeLanguage(newLang);
    await AsyncStorage.setItem('language', newLang);
  };

  const toggleAppLock = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert(t('unsupported'), t('unsupported_desc'));
        return;
      }
    }
    setAppLocked(value);
    await AsyncStorage.setItem('app_locked', value ? 'true' : 'false');
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('quit'), onPress: async () => await logout(), style: 'destructive' },
    ]);
  };

  const renderOption = (iconName: string, title: string, subtitle?: string, onPress?: () => void, rightElement?: React.ReactNode) => (
    <TouchableOpacity style={[styles.optionContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]} onPress={onPress} disabled={!onPress}>
      <View style={styles.optionIconContainer}>
        <Icon name={iconName as any} size={24} color={colors.primary} />
      </View>
      <View style={styles.optionTextContainer}>
        <Text style={[styles.optionTitle, { color: colors.text }]}>{title}</Text>
        {subtitle && <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
      </View>
      <View style={styles.optionRight}>
        {rightElement ? rightElement : <Icon name="chevron-right" size={20} color={colors.textSecondary} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Profil Rapide */}
      <View style={[styles.profileSection, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: isDark ? '#2E7D32' : '#E8F5E9', borderColor: colors.primary }]}>
          <Text style={[styles.avatarText, { color: isDark ? '#fff' : colors.primary }]}>{user?.username?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={[styles.userName, { color: colors.text }]}>{user?.username || 'Utilisateur'}</Text>
        <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email || 'email@exemple.com'}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t('mode_settings')}</Text>
      
      {renderOption('account-edit-outline', t('edit_info'), t('edit_info_sub'), () => Alert.alert('Info', 'Écran de modification à venir'))}
      {renderOption('lock-outline', t('change_pwd'), t('change_pwd_sub'), () => Alert.alert('Info', 'Écran de mot de passe à venir'))}
      
      {renderOption(
        'shield-key-outline', 
        t('app_lock'), 
        t('app_lock_sub'),
        undefined,
        <Switch 
          value={appLocked} 
          onValueChange={toggleAppLock} 
          trackColor={{ false: "#E0E0E0", true: "#A5D6A7" }}
          thumbColor={appLocked ? "#2E7D32" : "#f4f3f4"}
        />
      )}

      <Text style={styles.sectionTitle}>{t('app_prefs')}</Text>
      
      {renderOption(
        'translate', 
        t('language'), 
        i18n.language === 'fr' ? 'Français' : 'English', 
        toggleLanguage
      )}
      
      {renderOption(
        'theme-light-dark', 
        t('dark_theme'), 
        t('dark_theme_sub'),
        undefined,
        <Switch 
          value={isDark} 
          onValueChange={toggleTheme} 
          trackColor={{ false: "#E0E0E0", true: "#A5D6A7" }}
          thumbColor={isDark ? colors.primary : "#f4f3f4"}
        />
      )}

      <Text style={styles.sectionTitle}>{t('others')}</Text>
      
      {renderOption('help-circle-outline', t('help_support'), t('help_support_sub'), () => Alert.alert('Info', 'Support à venir'))}
      
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Icon name="logout" size={20} color="#E53935" />
        <Text style={styles.logoutText}>{t('logout_btn')}</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>AgroVision AI v1.0.0</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  profileSection: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#C8E6C9',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#757575',
    marginLeft: 20,
    marginBottom: 10,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  optionIconContainer: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 4,
  },
  optionRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginTop: 20,
    marginBottom: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EEEEEE',
  },
  logoutText: {
    fontSize: 16,
    color: '#E53935',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  versionText: {
    textAlign: 'center',
    color: '#BDBDBD',
    fontSize: 12,
    marginBottom: 40,
  },
});

export default SettingsScreen;
