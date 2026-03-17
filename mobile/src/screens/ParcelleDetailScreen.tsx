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
  SafeAreaView,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Parcelle, Analyse } from '../types';
import api from '../api/client';
import { WebView } from 'react-native-webview';
// Importation des icônes vectorielles
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

type ParcelleDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ParcelleDetail'>;

interface Props {
  navigation: ParcelleDetailScreenNavigationProp;
  route: any;
}

// --- FONCTION : Génère la carte miniature Leaflet ---
const getMiniMapHTML = (parcelle: Parcelle) => {
  const latMin = Number(parcelle.lat_min);
  const latMax = Number(parcelle.lat_max);
  const lonMin = Number(parcelle.long_min);
  const lonMax = Number(parcelle.long_max);
  
  const isValid = Number.isFinite(latMin) && Number.isFinite(latMax) && Number.isFinite(lonMin) && Number.isFinite(lonMax);

  if (!isValid) {
    return `<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;color:red;font-family:sans-serif;">Coordonnées invalides</body></html>`;
  }

  const centerLat = (latMin + latMax) / 2;
  const centerLon = (lonMin + lonMax) / 2;
  const bounds = [[latMin, lonMin], [latMax, lonMax]];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #f0f0f0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // Initialisation sans vue fixe au départ
    var map = L.map('map', {zoomControl: false});
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    var bounds = ${JSON.stringify(bounds)};
    var rectangle = L.rectangle(bounds, { 
        color: '#2E7D32', 
        weight: 3, 
        fillColor: '#2E7D32', 
        fillOpacity: 0.2 
    }).addTo(map);

    // Forcer le focus sur les limites du rectangle avec un délai pour s'assurer que le container est prêt
    setTimeout(function() {
        map.fitBounds(bounds, { padding: [20, 20] });
    }, 100);
  </script>
</body>
</html>`;
};


// --- COMPOSANT : Carte d'une analyse individuelle ---
const AnalyseCard: React.FC<{ analyse: Analyse; onPress: () => void; loading: boolean }> = ({ analyse, onPress, loading }) => {
  const getRiskDetails = (risque: string) => {
    switch (risque) {
      case 'FAIBLE': return { color: '#4CAF50', icon: 'check-circle', label: 'Sain' };
      case 'MODÉRÉ': return { color: '#FF9800', icon: 'alert-circle', label: 'Alerte' };
      case 'ÉLEVÉ': return { color: '#F44336', icon: 'alert-octagon', label: 'Danger' };
      case 'CRITIQUE': return { color: '#9C27B0', icon: 'skull', label: 'Critique' };
      default: return { color: '#999', icon: 'help-circle', label: risque };
    }
  };

  const risk = getRiskDetails(analyse.risque);

  return (
    <TouchableOpacity style={styles.analyseCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.analyseHeader}>
        <View style={styles.dateRow}>
          <Icon name="calendar-clock" size={16} color="#666" />
          <Text style={styles.analyseDate}>{new Date(analyse.date_analyse).toLocaleDateString()}</Text>
        </View>
        <View style={[styles.riskBadge, { backgroundColor: risk.color + '15', borderColor: risk.color }]}>
          <Icon name={risk.icon as any} size={14} color={risk.color} />
          <Text style={[styles.riskText, { color: risk.color }]}>{risk.label}</Text>
        </View>
      </View>
      
      <View style={styles.analyseStats}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{analyse.taux_infection}%</Text>
          <Text style={styles.statLabel}>Infection</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: analyse.evolution_7j > 0 ? '#F44336' : '#4CAF50' }]}>
            {analyse.evolution_7j > 0 ? '↑' : '↓'}{Math.abs(analyse.evolution_7j)}%
          </Text>
          <Text style={styles.statLabel}>Évol. 7j</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{analyse.plants_infectes || '0'}</Text>
          <Text style={styles.statLabel}>Plants</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Icon name="lightbulb-on" size={16} color="#2E7D32" />
        <Text style={styles.analyseAction} numberOfLines={1}>{analyse.action_recommandee}</Text>
      </View>

      {loading && (
        <View style={styles.cardLoaderOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
};

// --- COMPOSANT PRINCIPAL ---
const ParcelleDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { parcelle } = route.params;
  const [analyses, setAnalyses] = useState<Analyse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingAnalyseId, setLoadingAnalyseId] = useState<number | null>(null);
  
  // États pour l'édition
  const [editing, setEditing] = useState(false);
  const [editNom, setEditNom] = useState(parcelle.nom);
  const [editCulture, setEditCulture] = useState(parcelle.culture || 'manioc');
  const [editPlantsPerHa, setEditPlantsPerHa] = useState(String(parcelle.plants_per_ha || 10000));
  const mapKey = `map-${parcelle.lat_min}-${parcelle.long_min}-${parcelle.lat_max}-${parcelle.long_max}`;

  useEffect(() => {
    loadAnalyses();
  }, []);

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
      Alert.alert('Erreur', error.response?.data?.error || 'Impossible de charger l’analyse');
    } finally {
      setLoadingAnalyseId(null);
    }
  };

  const saveParcelleChanges = async () => {
    if (!editNom.trim() || !editCulture.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    const plants = Number(editPlantsPerHa);
    if (!Number.isFinite(plants) || plants <= 0) {
      Alert.alert('Erreur', 'Densité de plants invalide');
      return;
    }

    try {
      await api.put(`/parcelles/${parcelle.id}`, {
        nom: editNom.trim(),
        culture: editCulture.trim(),
        plants_per_ha: plants,
      });
      Alert.alert('Succès', 'Informations mises à jour');
      parcelle.nom = editNom.trim();
      parcelle.culture = editCulture.trim();
      parcelle.plants_per_ha = plants;
      setEditing(false);
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.error || 'Échec de la mise à jour');
    }
  };

  const deleteParcelle = async () => {
    Alert.alert(
      'Suppression',
      'Supprimer définitivement cette parcelle et ses analyses ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/parcelles/${parcelle.id}`);
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Erreur', 'Impossible de supprimer la parcelle');
            }
          }
        }
      ]
    );
  };

  const handleNewAnalyse = async () => {
    Alert.alert(
      'Nouvelle analyse',
      'Lancer une nouvelle analyse satellite ?',
      [
        { text: 'Plus tard', style: 'cancel' },
        {
          text: 'Lancer',
          onPress: async () => {
            setAnalyzing(true);
            try {
              await api.post(`/analyses/parcelle/${parcelle.id}/run`);
              Alert.alert('Succès', 'Analyse en cours. Elle apparaîtra bientôt dans la liste.');
              loadAnalyses();
            } catch (error: any) {
              Alert.alert('Erreur', 'Échec du lancement de l’analyse');
            } finally {
              setAnalyzing(false);
            }
          }
        }
      ]
    );
  };

  // --- FIN DE LA LOGIQUE ---
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 1️⃣ MINI-CARTE INTERACTIVE */}
        <View style={styles.mapContainer}>
          <WebView
            style={styles.map}
            source={{ html: getMiniMapHTML(parcelle) }}
            javaScriptEnabled={true}
            scrollEnabled={false}
          />
          <TouchableOpacity 
            style={styles.expandMapBtn}
            onPress={() => navigation.navigate('EditParcelleMap', { parcelle })}
          >
            <Icon name="arrow-expand-all" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* 2️⃣ CARTE D'INFORMATIONS DE LA PARCELLE */}
        <View style={styles.infoCard}>
          <View style={styles.cardHeader}>
            <View style={styles.titleRow}>
              <Icon name="sprout" size={24} color="#2E7D32" />
              <Text style={styles.parcelleNom}>
                {editing ? 'Modifier la parcelle' : parcelle.nom}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setEditing(!editing)}>
              <Icon 
                name={editing ? "close-circle" : "pencil-circle"} 
                size={30} 
                color={editing ? "#757575" : "#2E7D32"} 
              />
            </TouchableOpacity>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>📐 Surface</Text>
              <Text style={styles.infoValue}>{parcelle.surface_ha} ha</Text>
            </View>
            
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>🌿 Culture</Text>
              {editing ? (
                <TextInput
                  style={styles.inputSmall}
                  value={editCulture}
                  onChangeText={setEditCulture}
                />
              ) : (
                <Text style={styles.infoValue}>{parcelle.culture || 'Manioc'}</Text>
              )}
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>🚜 Densité</Text>
              {editing ? (
                <TextInput
                  style={styles.inputSmall}
                  value={editPlantsPerHa}
                  onChangeText={setEditPlantsPerHa}
                  keyboardType="numeric"
                />
              ) : (
                <Text style={styles.infoValue}>{parcelle.plants_per_ha || 10000} /ha</Text>
              )}
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>📅 Créée le</Text>
              <Text style={styles.infoValue}>
                {new Date(parcelle.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>

          {editing ? (
            <View style={styles.editingActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveParcelleChanges}>
                <Icon name="content-save" size={18} color="#fff" />
                <Text style={styles.btnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.normalActions}>
              <TouchableOpacity style={styles.deleteBtn} onPress={deleteParcelle}>
                <Icon name="trash-can" size={18} color="#eb6363" />
                <Text style={styles.btnText}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 3️⃣ SECTION DES ANALYSES */}
        <View style={styles.analysesSection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Analyses de santé</Text>
              <Text style={styles.sectionSubtitle}>Historique satellite</Text>
            </View>
            <TouchableOpacity
              style={[styles.analyzeBtn, analyzing && styles.btnDisabled]}
              onPress={handleNewAnalyse}
              disabled={analyzing}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="plus-circle" size={20} color="#fff" />
                  <Text style={styles.analyzeBtnText}>Lancer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#2E7D32" style={styles.loader} />
          ) : (
            <View style={styles.analysesList}>
              {analyses.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="satellite-variant" size={60} color="#E0E0E0" />
                  <Text style={styles.emptyText}>Aucune analyse effectuée.</Text>
                </View>
              ) : (
                analyses.map((analyse) => (
                  <AnalyseCard
                    key={analyse.id}
                    analyse={analyse}
                    onPress={() => handleAnalysePress(analyse)}
                    loading={loadingAnalyseId === analyse.id}
                  />
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- STYLES CSS ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9F7',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  mapContainer: {
    height: height * 0.25,
    backgroundColor: '#E0E0E0',
    marginBottom: -20,
    zIndex: 0,
    borderRadius: 0,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    borderRadius: 0,
  },
  expandMapBtn: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: 'rgba(46, 125, 50, 0.9)',
    padding: 10,
    borderRadius: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 15,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  parcelleNom: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 15,
  },
  infoItem: {
    width: '50%',
  },
  infoLabel: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  inputSmall: {
    borderBottomWidth: 2,
    borderBottomColor: '#2E7D32',
    paddingVertical: 2,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  editingActions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 10,
  },
  normalActions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 15,
    gap: 8,
  },
  deleteBtn: {
    backgroundColor: '#FFEBEE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 12,
    gap: 6,
  },
  btnText: {
    color: '#ea5353',
    fontWeight: 'bold',
    fontSize: 13,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  analysesSection: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  analyzeBtn: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 15,
    alignItems: 'center',
    gap: 8,
    elevation: 3,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  btnDisabled: {
    backgroundColor: '#BDBDBD',
  },
  loader: {
    marginTop: 40,
  },
  analysesList: {
    marginTop: 10,
  },
  analyseCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    elevation: 2,
  },
  analyseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  analyseDate: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#424242',
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  riskText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  analyseStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FBF9',
    padding: 12,
    borderRadius: 15,
    marginBottom: 15,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  statLabel: {
    fontSize: 10,
    color: '#9E9E9E',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  analyseAction: {
    fontSize: 13,
    color: '#2E7D32',
    fontStyle: 'italic',
    fontWeight: '500',
  },
  cardLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#9E9E9E',
    marginTop: 10,
    fontSize: 14,
  },
});

export default ParcelleDetailScreen;