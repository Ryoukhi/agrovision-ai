import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  SafeAreaView,
} from 'react-native';
// Importation de l'icône
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/client';
import { Parcelle, RootStackParamList } from '../types';
import { StackNavigationProp } from '@react-navigation/stack';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { isDark, colors } = useTheme();

  useEffect(() => {
    loadParcelles();
    const unsubscribe = navigation.addListener('focus', loadParcelles);
    return unsubscribe;
  }, [navigation]);

  const loadParcelles = async () => {
    try {
      const response = await api.get<Parcelle[]>('/parcelles');
      setParcelles(response.data);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les parcelles');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('quit'), onPress: async () => await logout(), style: 'destructive' },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('loading_lands')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* 1️⃣ EN-TÊTE PREMIUM */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.avatarBox, { backgroundColor: isDark ? '#2E7D32' : '#E8F5E9', borderColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: isDark ? '#fff' : colors.primary }]}>{user?.username?.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>{t('hello')}</Text>
            <Text style={[styles.userNameText, { color: colors.text }]}>{user?.username}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
          <Icon name="logout-variant" size={24} color="#E53935" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={parcelles}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* 2️⃣ CARTE DE RÉSUMÉ (STATISTIQUES) */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryNumber}>{parcelles.length}</Text>
                <Text style={styles.summaryLabel}>{t('active_plots')}</Text>
              </View>
              <View style={styles.summaryIconCircle}>
                <Icon name="map-marker-path" size={32} color="#fff" />
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('my_farms')}</Text>
              <Icon name="leaf" size={20} color={colors.primary} />
            </View>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.parcelleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('ParcelleDetail', { parcelle: item })}>
            
            <View style={styles.cardTop}>
              <View style={styles.titleContainer}>
                <Icon name="land-plots" size={20} color="#2E7D32" style={{marginRight: 8}} />
                <Text style={styles.parcelleName}>{item.nom}</Text>
              </View>
              <View style={styles.surfaceBadge}>
                <Text style={styles.surfaceText}>{item.surface_ha} ha</Text>
              </View>
            </View>

            <View style={styles.cardDetails}>
              <View style={styles.detailItem}>
                <Icon name="sprout" size={16} color={colors.textSecondary} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>{t('crop')} <Text style={[styles.boldText, { color: colors.text }]}>{item.culture || 'Manioc'}</Text></Text>
              </View>
              <View style={styles.detailItem}>
                <Icon name="calendar-clock" size={16} color={colors.textSecondary} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                  {t('since')} {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>

            <View style={[styles.cardFooter, { backgroundColor: isDark ? colors.card : '#F9FBE7' }]}>
                <Text style={[styles.actionLink, { color: colors.primary }]}>{t('view_diagnostic')}</Text>
                <Icon name="chevron-right" size={20} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="image-filter-hdr" size={80} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{t('no_land_title')}</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('no_land_desc')}</Text>
          </View>
        }
      />

      {/* 3️⃣ BOUTON D'ACTION FLOTTANT (FAB) */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate('Map')}>
        <Icon name="plus" size={30} color="#fff" />
        <Text style={styles.fabText}>{t('new_btn')}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFBFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    color: '#2E7D32',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  welcomeText: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  userNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  iconButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
  },
  listContent: {
    paddingBottom: 100,
  },
  summaryCard: {
    margin: 20,
    padding: 24,
    backgroundColor: '#2E7D32',
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#C8E6C9',
    fontWeight: '500',
  },
  summaryIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    marginBottom: 10,
    marginTop: 5,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#333',
    marginRight: 8,
  },
  parcelleCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  parcelleName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#263238',
  },
  surfaceBadge: {
    backgroundColor: '#F1F8E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  surfaceText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  cardDetails: {
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    paddingBottom: 12,
    marginBottom: 10,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#616161',
    marginLeft: 8,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#424242',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2E7D32',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#424242',
    marginTop: 15,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 25,
    right: 20,
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    elevation: 6,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  fabText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
});

export default HomeScreen;