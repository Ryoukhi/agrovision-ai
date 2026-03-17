import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Dimensions, SafeAreaView, StatusBar
} from 'react-native';
import { WebView } from 'react-native-webview';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Parcelle, Coordinate } from '../types';
import api from '../api/client';

type EditParcelleMapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditParcelleMap'>;

interface Props {
  navigation: EditParcelleMapScreenNavigationProp;
  route: any;
}

const { height, width } = Dimensions.get('window');

// --- FONCTION DE CALCUL DE SURFACE (Identique mais isolée) ---
const calculateApproximateArea = (points: Coordinate[]): number => {
  if (points.length < 3) return 0;
  const latCenter = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const metersPerLon = 111000 * Math.cos(latCenter * Math.PI / 180);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += (points[i].longitude * points[j].latitude - points[j].longitude * points[i].latitude);
  }
  area = Math.abs(area / 2);
  return Math.round(area * (111000 * metersPerLon) / 10000 * 100) / 100;
};

// --- GÉNÉRATEUR HTML LEAFLET (Amélioré avec Style Pro) ---
const getLeafletHTML = (points: Coordinate[], mapCenter: Coordinate) => {
  const polygonCoords = points.map(p => `[${p.latitude}, ${p.longitude}]`).join(',');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body, html, #map { margin:0; height:100%; width:100%; background: #f0f0f0; }
    .marker-pin { background: #2E7D32; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([${mapCenter.latitude}, ${mapCenter.longitude}], 17);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    var points = [${polygonCoords}];
    
    // Affichage des sommets
    points.forEach((p, i) => {
      L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: '#2E7D32', fillOpacity: 1 }).addTo(map);
    });

    // Affichage du polygone
    if (points.length >= 3) {
      L.polygon(points, { color: '#2E7D32', weight: 3, fillColor: '#4CAF50', fillOpacity: 0.3 }).addTo(map);
      map.fitBounds(L.polygon(points).getBounds(), { padding: [20, 20] });
    }

    map.on('click', function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_PRESS', latitude: e.latlng.lat, longitude: e.latlng.lng }));
    });
  </script>
</body>
</html>`;
};

// ... (Gardez tous vos imports et fonctions de calcul en haut identiques)

const EditParcelleMapScreen: React.FC<Props> = ({ navigation, route }) => {
  const parcelle: Parcelle = route.params.parcelle;
  
  const [points, setPoints] = useState<Coordinate[]>([
    { latitude: parcelle.lat_min, longitude: parcelle.long_min },
    { latitude: parcelle.lat_min, longitude: parcelle.long_max },
    { latitude: parcelle.lat_max, longitude: parcelle.long_max },
    { latitude: parcelle.lat_max, longitude: parcelle.long_min },
  ]);
  
  const [surface, setSurface] = useState(String(parcelle.surface_ha));
  const [saving, setSaving] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const handleWebViewMessage = (event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'MAP_PRESS') {
      const newPoints = [...points, { latitude: data.latitude, longitude: data.longitude }];
      setPoints(newPoints);
      if (newPoints.length >= 3) setSurface(String(calculateApproximateArea(newPoints)));
    }
  };

  const undoLastPoint = () => {
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    setSurface(String(calculateApproximateArea(newPoints)));
  };

  const clearPoints = () => {
    setPoints([]);
    setSurface('0');
  };

  const save = async () => {
    if (points.length < 3) {
      Alert.alert('Attention', 'Veuillez définir au moins 3 points pour former une zone.');
      return;
    }
    setSaving(true);
    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    try {
      const updatedData = {
        lat_min: Math.min(...lats),
        long_min: Math.min(...lngs),
        lat_max: Math.max(...lats),
        long_max: Math.max(...lngs),
        surface_ha: Number(surface),
      };
      await api.put(`/parcelles/${parcelle.id}`, updatedData);
      Alert.alert('Succès', 'Limites de la parcelle mises à jour.');
      navigation.replace('ParcelleDetail', {
        parcelle: { ...parcelle, ...updatedData },
      });
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de mettre à jour les coordonnées.');
    } finally {
      setSaving(false);
    }
  };

  const mapCenter = {
    latitude: points.length > 0 ? points.reduce((acc, p) => acc + p.latitude, 0) / points.length : (parcelle.lat_min + parcelle.lat_max) / 2,
    longitude: points.length > 0 ? points.reduce((acc, p) => acc + p.longitude, 0) / points.length : (parcelle.long_min + parcelle.long_max) / 2,
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* 1️⃣ HEADER (Ajouté pour corriger l'UI) */}

      <View style={styles.mapWrapper}>
        <WebView
          ref={webViewRef}
          source={{ html: getLeafletHTML(points, mapCenter) }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          originWhitelist={['*']}
          style={styles.map}
        />

        <View style={styles.floatingControls}>
          <TouchableOpacity 
            style={styles.fab} 
            onPress={() => setPoints([...points])} 
            activeOpacity={0.7}
          >
            <Icon name="crosshairs-gps" size={22} color="#2E7D32" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.fab, points.length === 0 && styles.fabDisabled]} 
            onPress={undoLastPoint}
            disabled={points.length === 0}
          >
            <Icon name="undo-variant" size={22} color="#FF9800" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.fab, points.length === 0 && styles.fabDisabled]} 
            onPress={clearPoints}
            disabled={points.length === 0}
          >
            <Icon name="trash-can-outline" size={22} color="#F44336" />
          </TouchableOpacity>
        </View>

        <View style={styles.mapHelp}>
          <Icon name="gesture-tap" size={16} color="#fff" />
          <Text style={styles.mapHelpText}>Touchez la carte pour ajouter un point</Text>
        </View>
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Points placés</Text>
            <View style={styles.statValueRow}>
              <Icon name="vector-point" size={18} color="#2E7D32" />
              <Text style={styles.statValue}>{points.length}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Nouvelle Surface</Text>
            <View style={styles.statValueRow}>
              <Icon name="texture-box" size={18} color="#2E7D32" />
              {/* Correction de l'erreur Text strings ici */}
              <Text style={styles.statValue}>
                {surface}
                <Text style={styles.unit}> ha</Text>
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, (points.length < 3 || saving) && styles.saveDisabled]}
          onPress={save}
          disabled={points.length < 3 || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="check-circle-outline" size={24} color="#fff" />
              <Text style={styles.saveBtnText}> Valider les nouvelles limites</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
// ... (Gardez vos styles en bas identiques)

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { padding: 5 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  headerSubtitle: { fontSize: 12, color: '#2E7D32', textAlign: 'center', fontWeight: '600' },

  // Map
  mapWrapper: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  floatingControls: {
    position: 'absolute',
    right: 15,
    top: 15,
    gap: 12,
  },
  fab: {
    width: 48,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  fabDisabled: { backgroundColor: '#F5F5F5', opacity: 0.6 },
  mapHelp: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    bottom: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapHelpText: { color: '#fff', fontSize: 11, fontWeight: '500' },

  // Bottom Panel
  bottomPanel: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
  },
  statItem: { alignItems: 'center' },
  statLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 5, fontWeight: '600' },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  unit: { fontSize: 12, color: '#999' },
  divider: { width: 1, height: 30, backgroundColor: '#EEE' },

  // Buttons
  saveButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  saveDisabled: { backgroundColor: '#BDBDBD', elevation: 0 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default EditParcelleMapScreen;