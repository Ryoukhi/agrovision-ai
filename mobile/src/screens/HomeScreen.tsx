import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Parcelle, RootStackParamList } from '../types';
import { StackNavigationProp } from '@react-navigation/stack';

// Type pour la navigation
type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();

  useEffect(() => {
    loadParcelles();
    
    // Recharger quand on revient sur l'écran
    const unsubscribe = navigation.addListener('focus', loadParcelles);
    return unsubscribe;
  }, [navigation]);

  const loadParcelles = async () => {
    try {
      const response = await api.get<Parcelle[]>('/parcelles');
      const mapped = response.data.map((p: any) => ({
        ...p,
        lat_min: Number(p.lat_min ?? p.coords?.lat_min),
        lat_max: Number(p.lat_max ?? p.coords?.lat_max),
        long_min: Number(p.long_min ?? p.coords?.long_min),
        long_max: Number(p.long_max ?? p.coords?.long_max),
      }));
      setParcelles(mapped);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les parcelles');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Déconnexion', 
          onPress: async () => {
            await logout();
          },
          style: 'destructive',
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Bienvenue,</Text>
          <Text style={styles.userName}>{user?.username}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>🚪</Text>
        </TouchableOpacity>
      </View>

      {/* Statistiques */}
      <View style={styles.statsCard}>
        <Text style={styles.statsNumber}>{parcelles.length}</Text>
        <Text style={styles.statsLabel}>parcelle(s) enregistrée(s)</Text>
      </View>

      {/* Liste des parcelles */}
      <Text style={styles.sectionTitle}>Mes parcelles</Text>
      
      <FlatList
        data={parcelles}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.parcelleCard}
            onPress={() => navigation.navigate('ParcelleDetail', { parcelle: item })}>
            <View style={styles.parcelleHeader}>
              <Text style={styles.parcelleNom}>{item.nom}</Text>
              <Text style={styles.parcelleSurface}>{item.surface_ha} ha</Text>
            </View>
            <Text style={styles.parcelleCulture}>🌱 {item.culture || 'manioc'}</Text>
            <Text style={styles.parcelleDate}>
              Créée le {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucune parcelle pour le moment</Text>
            <Text style={styles.emptySubText}>Appuyez sur + pour en ajouter une</Text>
          </View>
        }
      />

      {/* Bouton flottant d'ajout - NAVIGUE VERS MAPSCREEN */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('Map')}>
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  welcome: {
    fontSize: 14,
    color: '#666',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  logoutButton: {
    padding: 10,
  },
  logoutText: {
    fontSize: 24,
  },
  statsCard: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  statsLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 20,
    marginBottom: 10,
    color: '#333',
  },
  parcelleCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  parcelleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  parcelleNom: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  parcelleSurface: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  parcelleCulture: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  parcelleDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addButtonText: {
    fontSize: 32,
    color: '#fff',
    marginTop: -2,
  },
});

export default HomeScreen;