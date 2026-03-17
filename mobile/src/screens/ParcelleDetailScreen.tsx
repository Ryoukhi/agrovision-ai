import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  TextInput,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Parcelle, Analyse } from '../types';
import api from '../api/client';
import { WebView } from 'react-native-webview';

const { height } = Dimensions.get('window');

type ParcelleDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ParcelleDetail'>;

interface Props {
  navigation: ParcelleDetailScreenNavigationProp;
  route: any;
}

// Génère la carte miniature pour afficher la parcelle
const getMiniMapHTML = (parcelle: Parcelle) => {
  const latMin = Number(parcelle.lat_min);
  const latMax = Number(parcelle.lat_max);
  const lonMin = Number(parcelle.long_min);
  const lonMax = Number(parcelle.long_max);
  const isValid = Number.isFinite(latMin) && Number.isFinite(latMax) && Number.isFinite(lonMin) && Number.isFinite(lonMax);

  if (!isValid) {
    return `
<!DOCTYPE html>
<html><body><div style="padding:20px;font-family:sans-serif;color:#f00;">Coordonnées invalides pour la parcelle.</div></body></html>`;
  }

  const centerLat = (latMin + latMax) / 2;
  const centerLon = (lonMin + lonMax) / 2;
  const bounds = [
    [latMin, lonMin],
    [latMax, lonMax]
  ];
  const boundsJson = JSON.stringify(bounds);
  const safeName = (parcelle.nom || 'Parcelle').replace(/'/g, "\\'").replace(/\n/g, ' ');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    try {
      const map = L.map('map').setView([${centerLat}, ${centerLon}], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      const bounds = ${boundsJson};
      L.rectangle(bounds, {
        color: '#2E7D32',
        weight: 3,
        fillColor: '#4CAF50',
        fillOpacity: 0.2
      }).addTo(map).bindPopup('${safeName}');

      L.marker([${centerLat}, ${centerLon}]).addTo(map).bindPopup('${safeName}');
      map.fitBounds(bounds);
      console.log('Leaflet OK', {center: [${centerLat}, ${centerLon}], bounds});
    } catch (e) {
      console.error('MiniMap JavaScript error', e);
      document.body.innerHTML = '<div style="color:red;padding:20px;font-family:sans-serif;">Erreur Leaflet: ' + e.message + '</div>';
    }
  </script>
</body>
</html>`;
};

// Composant pour afficher une analyse dans la liste
const AnalyseCard: React.FC<{ analyse: Analyse; onPress: () => void }> = ({ analyse, onPress }) => {
  const getRiskColor = (risque: string) => {
    switch (risque) {
      case 'FAIBLE': return '#4CAF50';
      case 'MODÉRÉ': return '#FF9800';
      case 'ÉLEVÉ': return '#f44336';
      case 'CRITIQUE': return '#9C27B0';
      default: return '#999';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <TouchableOpacity style={styles.analyseCard} onPress={onPress}>
      <View style={styles.analyseHeader}>
        <Text style={styles.analyseDate}>{formatDate(analyse.date_analyse)}</Text>
        <View style={[styles.riskBadge, { backgroundColor: getRiskColor(analyse.risque) }]}>
          <Text style={styles.riskText}>{analyse.risque}</Text>
        </View>
      </View>
      
      <View style={styles.analyseStats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{analyse.taux_infection}%</Text>
          <Text style={styles.statLabel}>Infection</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{Number.isFinite(Number(analyse.evolution_7j)) ? `${analyse.evolution_7j > 0 ? '+' : ''}${analyse.evolution_7j}%` : 'N/A'}</Text>
          <Text style={styles.statLabel}>Évolution 7j</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{Number.isFinite(Number(analyse.plants_infectes)) ? analyse.plants_infectes : 'N/A'}</Text>
          <Text style={styles.statLabel}>Plants</Text>
        </View>
      </View>

      <Text style={styles.analyseAction} numberOfLines={1}>
        {analyse.action_recommandee}
      </Text>
    </TouchableOpacity>
  );
};

const ParcelleDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { parcelle } = route.params;
  const [analyses, setAnalyses] = useState<Analyse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingAnalyseId, setLoadingAnalyseId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editNom, setEditNom] = useState(parcelle.nom);
  const [editCulture, setEditCulture] = useState(parcelle.culture || 'manioc');
  const [editPlantsPerHa, setEditPlantsPerHa] = useState(String(parcelle.plants_per_ha || 10000));

  const loadAnalyses = async () => {
    try {
      const response = await api.get(`/analyses/parcelle/${parcelle.id}`);
      setAnalyses(response.data);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les analyses');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalyses();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadAnalyses();
  };

  const handleAnalysePress = async (analyse: Analyse) => {
    setLoadingAnalyseId(analyse.id);
    try {
      const response = await api.get(`/analyses/${analyse.id}`);
      navigation.navigate('AnalyseDetail', { analyse: response.data });
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.error || 'Impossible de charger les détails de l’analyse');
    } finally {
      setLoadingAnalyseId(null);
    }
  };

  const saveParcelleChanges = async () => {
    if (!editNom.trim()) { Alert.alert('Erreur', 'Le nom est requis'); return; }
    if (!editCulture.trim()) { Alert.alert('Erreur', 'La culture est requise'); return; }
    const plants = Number(editPlantsPerHa);
    if (!Number.isFinite(plants) || plants <= 0) { Alert.alert('Erreur', 'Densité invalide'); return; }

    try {
      await api.put(`/parcelles/${parcelle.id}`, {
        nom: editNom.trim(),
        culture: editCulture.trim(),
        plants_per_ha: plants,
      });
      Alert.alert('Succès', 'Parcelle mise à jour');
      parcelle.nom = editNom.trim();
      parcelle.culture = editCulture.trim();
      parcelle.plants_per_ha = plants;
      setEditing(false);
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.error || 'Impossible de modifier la parcelle');
    }
  };

  const deleteParcelle = async () => {
    Alert.alert(
      'Confirmer suppression',
      'Voulez-vous vraiment supprimer cette parcelle ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/parcelles/${parcelle.id}`);
              Alert.alert('Supprimé', 'La parcelle a été supprimée.');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Erreur', error.response?.data?.error || 'Impossible de supprimer');
            }
          }
        }
      ]
    );
  };

  const handleNewAnalyse = async () => {
    Alert.alert(
      'Nouvelle analyse',
      'Lancer une analyse satellite pour cette parcelle ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Lancer',
          onPress: async () => {
            setAnalyzing(true);
            try {
              const response = await api.post(`/analyses/parcelle/${parcelle.id}/run`);
              Alert.alert('Succès', 'Analyse lancée ! Elle sera disponible dans quelques instants.');
              loadAnalyses(); // Recharger la liste
            } catch (error: any) {
              Alert.alert('Erreur', error.response?.data?.error || 'Erreur lors du lancement');
            } finally {
              setAnalyzing(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Mini-carte */}
      <View style={styles.mapContainer}>
        <WebView
          style={styles.map}
          source={{ html: getMiniMapHTML(parcelle) }}
          javaScriptEnabled={true}
          originWhitelist={['*']}
          scrollEnabled={false}
          onError={(syntheticEvent) => {
            console.log('WebView error', syntheticEvent.nativeEvent);
          }}
          onLoadEnd={() => {
            console.log('WebView loaded mini-map');
          }}
        />
      </View>

      {/* Informations de la parcelle */}
      <View style={styles.infoCard}>
        <Text style={styles.parcelleNom}>{editing ? 'Modifier la parcelle' : parcelle.nom}</Text>
        
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Surface</Text>
            <Text style={styles.infoValue}>{parcelle.surface_ha} ha</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Culture</Text>
            {editing ? (
              <TextInput
                style={styles.inputSmall}
                value={editCulture}
                onChangeText={setEditCulture}
                placeholder="Culture"
              />
            ) : (
              <Text style={styles.infoValue}>{parcelle.culture || 'manioc'}</Text>
            )}
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Densité</Text>
            {editing ? (
              <TextInput
                style={styles.inputSmall}
                value={editPlantsPerHa}
                onChangeText={setEditPlantsPerHa}
                keyboardType="numeric"
              />
            ) : (
              <Text style={styles.infoValue}>{parcelle.plants_per_ha !== undefined ? parcelle.plants_per_ha : 10000}/ha</Text>
            )}
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Créée le</Text>
            <Text style={styles.infoValue}>
              {new Date(parcelle.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.parcelleActions}>
          {editing ? (
            <>
              <TouchableOpacity style={styles.saveButtonSmall} onPress={saveParcelleChanges}>
                <Text style={styles.saveButtonText}>Enregistrer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButtonSmall} onPress={() => setEditing(false)}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}>
                <Text style={styles.editButtonText}>Modifier infos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editButton} onPress={() => navigation.navigate('EditParcelleMap', { parcelle })}>
                <Text style={styles.editButtonText}>Modifier coords</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={deleteParcelle}>
                <Text style={styles.deleteButtonText}>Supprimer</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Section des analyses */}
      <View style={styles.analysesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Analyses</Text>
          <TouchableOpacity
            style={[styles.analyzeButton, analyzing && styles.buttonDisabled]}
            onPress={handleNewAnalyse}
            disabled={analyzing}>
            {analyzing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.analyzeButtonText}>+ Nouvelle analyse</Text>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2E7D32" style={styles.loader} />
        ) : (
          <ScrollView
            style={styles.analysesList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }>
            {analyses.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucune analyse pour le moment.{'\n'}
                Lancez votre première analyse !
              </Text>
            ) : (
              analyses.map((analyse) => (
                <View key={analyse.id} style={styles.analyseContainer}>
                  <AnalyseCard
                    analyse={analyse}
                    onPress={() => handleAnalysePress(analyse)}
                  />
                  {loadingAnalyseId === analyse.id && (
                    <View style={styles.loadingAnalyseOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  mapContainer: {
    height: height * 0.25,
    backgroundColor: '#e0e0e0',
  },
  map: {
    flex: 1,
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 20,
    margin: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  parcelleNom: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 15,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  inputSmall: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  parcelleActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#1976d2',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 5,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 5,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  saveButtonSmall: {
    backgroundColor: '#2E7D32',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 5,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  cancelButtonSmall: {
    backgroundColor: '#757575',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  analysesSection: {
    flex: 1,
    backgroundColor: '#fff',
    margin: 10,
    marginTop: 0,
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  analyzeButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
  },
  loader: {
    marginTop: 20,
  },
  analysesList: {
    flex: 1,
  },
  analyseCard: {
    backgroundColor: '#f8f8f8',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  analyseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  analyseDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  riskText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  analyseStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
  },
  analyseAction: {
    fontSize: 12,
    color: '#2E7D32',
    fontStyle: 'italic',
  },
  analyseContainer: {
    position: 'relative',
  },
  loadingAnalyseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
    lineHeight: 20,
  },
});

export default ParcelleDetailScreen;