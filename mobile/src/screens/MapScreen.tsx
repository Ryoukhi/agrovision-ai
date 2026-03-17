import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ScrollView, ActivityIndicator, Dimensions, SafeAreaView
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../api/client';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Coordinate } from '../types';

type MapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Map'>;
interface Props { navigation: MapScreenNavigationProp; }

const { height, width } = Dimensions.get('window');

// --- HELPERS DE CALCUL ---
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
  // Conversion approximative en Hectares
  return Math.round(area * (111000 * metersPerLon) / 10000 * 100) / 100;
};

const calculatePlantDensity = (spacingMeters: number): number => {
  if (!spacingMeters || spacingMeters <= 0) return 10000;
  return Math.max(1, Math.round(10000 / (spacingMeters * spacingMeters)));
};

// --- HTML LEAFLET AMÉLIORÉ ---
const getLeafletHTML = (points: Coordinate[], userLocation: Coordinate | null, mapCenter: Coordinate) => {
  const polygonCoords = points.map(p => `[${p.latitude}, ${p.longitude}]`).join(',');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    #map { width: 100vw; height: 100vh; background: #f8f9fa; }
    .pulse {
      width: 15px; height: 15px; background: #2196F3;
      border: 3px solid white; border-radius: 50%;
      box-shadow: 0 0 10px rgba(33,150,243,0.5);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([${mapCenter.latitude}, ${mapCenter.longitude}], 17);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    var points = [${polygonCoords}];
    
    // Marqueurs des sommets
    points.forEach((p, i) => {
      L.circleMarker(p, {
        radius: 6, color: '#fff', weight: 2, fillColor: '#2E7D32', fillOpacity: 1
      }).addTo(map);
    });

    // Polygone
    if (points.length >= 3) {
      L.polygon(points, {
        color: '#2E7D32', weight: 3, fillColor: '#4CAF50', fillOpacity: 0.3
      }).addTo(map);
    }

    // Position utilisateur
    ${userLocation ? `
      L.marker([${userLocation.latitude}, ${userLocation.longitude}], {
        icon: L.divIcon({ className: 'pulse' })
      }).addTo(map);
    ` : ''}

    map.on('click', function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'MAP_PRESS',
        latitude: e.latlng.lat,
        longitude: e.latlng.lng
      }));
    });
  </script>
</body>
</html>`;
};

// --- COMPOSANT PRINCIPAL ---
const MapScreen: React.FC<Props> = ({ navigation }) => {
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [nom, setNom] = useState('');
  const [culture, setCulture] = useState('Manioc');
  const [spacing, setSpacing] = useState('1');
  const [surface, setSurface] = useState('0.1');
  const [manualSurface, setManualSurface] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<Coordinate>({
    latitude: 4.5649, longitude: 12.5650 // Centre par défaut (Cameroun)
  });
  
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Accès GPS refusé');
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      const coord = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setUserLocation(coord);
      setMapCenter(coord);
    })();
  }, []);

  const handleWebViewMessage = (event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'MAP_PRESS') {
      const newPoint = { latitude: data.latitude, longitude: data.longitude };
      const newPoints = [...points, newPoint];
      setPoints(newPoints);
      if (!manualSurface && newPoints.length >= 3) {
        setSurface(calculateApproximateArea(newPoints).toString());
      }
    }
  };

  const removeLastPoint = () => {
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    if (!manualSurface && newPoints.length >= 3) {
        setSurface(calculateApproximateArea(newPoints).toString());
    } else if (newPoints.length < 3 && !manualSurface) {
        setSurface('0.1');
    }
  };

  const saveParcelle = async () => {
    if (!nom || points.length < 3) {
      Alert.alert('Incomplet', 'Veuillez nommer la parcelle et placer au moins 3 points.');
      return;
    }
    setSaving(true);
    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    try {
      await api.post('/parcelles', {
        nom,
        long_min: Math.min(...lngs), lat_min: Math.min(...lats),
        long_max: Math.max(...lngs), lat_max: Math.max(...lats),
        surface_ha: parseFloat(surface),
        culture,
        plants_per_ha: calculatePlantDensity(Number(spacing)),
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder la parcelle');
    } finally {
      setSaving(false);
    }
  };

  // ... (Suite dans la partie 2)
return (
    <SafeAreaView style={styles.container}>
      {/* 1️⃣ ZONE CARTE + BOUTONS FLOTTANTS */}
      <View style={styles.mapWrapper}>
        <WebView
          ref={webViewRef}
          style={styles.map}
          source={{ html: getLeafletHTML(points, userLocation, mapCenter) }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled={true}
        />

        {/* Boutons sur la carte */}
        <View style={styles.mapControls}>
          <TouchableOpacity 
            style={styles.mapBtn} 
            onPress={() => setUserLocation({...userLocation!})} // Force le recentrage
          >
            <Icon name="crosshairs-gps" size={24} color="#2E7D32" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.mapBtn, points.length === 0 && styles.btnDisabled]} 
            onPress={removeLastPoint}
            disabled={points.length === 0}
          >
            <Icon name="undo-variant" size={24} color="#FF9800" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.mapBtn, points.length === 0 && styles.btnDisabled]} 
            onPress={() => setPoints([])}
            disabled={points.length === 0}
          >
            <Icon name="layers-remove" size={24} color="#F44336" />
          </TouchableOpacity>
        </View>

        {/* Badge de statut des points */}
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsBadgeText}>
            {points.length} {points.length > 1 ? 'points' : 'point'}
          </Text>
          {points.length >= 3 && <Icon name="check-decagram" size={16} color="#4CAF50" />}
        </View>
      </View>

      {/* 2️⃣ FORMULAIRE DE SAISIE */}
      <ScrollView 
        style={styles.formScroll} 
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inputGroup}>
          <View style={styles.inputHeader}>
            <Icon name="tag-outline" size={18} color="#2E7D32" />
            <Text style={styles.inputLabel}>Nom de la parcelle</Text>
          </View>
          <TextInput
            style={styles.textInput}
            value={nom}
            onChangeText={setNom}
            placeholder="Ex: Champ de l'Est"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.gridInputs}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <View style={styles.inputHeader}>
              <Icon name="leaf" size={18} color="#2E7D32" />
              <Text style={styles.inputLabel}>Culture</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={culture}
              onChangeText={setCulture}
              placeholder="Ex: Manioc"
            />
          </View>

          <View style={[styles.inputGroup, { flex: 1, marginLeft: 15 }]}>
            <View style={styles.inputHeader}>
              <Icon name="arrow-expand-horizontal" size={18} color="#2E7D32" />
              <Text style={styles.inputLabel}>Espacement (m)</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={spacing}
              onChangeText={setSpacing}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Info Densité */}
        <View style={styles.densityInfo}>
          <Icon name="calculator" size={16} color="#666" />
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.densityText}>Densité estimée :</Text>
            <Text style={[styles.densityText, styles.boldText, { marginLeft: 4 }]}>{calculatePlantDensity(Number(spacing))} plants/ha</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.surfaceHeader}>
            <View style={styles.inputHeader}>
              <Icon name="texture-box" size={18} color="#2E7D32" />
              <Text style={styles.inputLabel}>Surface (Hectares)</Text>
            </View>
            <TouchableOpacity 
              onPress={() => setManualSurface(!manualSurface)}
              style={[styles.toggleBtn, manualSurface && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, manualSurface && styles.toggleTextActive]}>
                {manualSurface ? 'MANUEL' : 'AUTO'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.textInput, !manualSurface && styles.inputLocked]}
            value={surface}
            onChangeText={setSurface}
            keyboardType="numeric"
            editable={manualSurface}
          />
        </View>

        {/* 3️⃣ BOUTON DE SAUVEGARDE */}
        <TouchableOpacity
          style={[styles.saveBtn, (points.length < 3 || !nom || saving) && styles.saveBtnDisabled]}
          onPress={saveParcelle}
          disabled={points.length < 3 || !nom || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="content-save-check" size={22} color="#fff" />
              <Text style={styles.saveBtnText}>Créer la parcelle</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// --- STYLES CSS ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  mapWrapper: { height: height * 0.45, width: '100%', position: 'relative' },
  map: { flex: 1 },
  
  // Boutons sur la carte
  mapControls: {
    position: 'absolute',
    right: 15,
    top: 15,
    gap: 10,
  },
  mapBtn: {
    width: 45,
    height: 45,
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  btnDisabled: { opacity: 0.5 },
  
  pointsBadge: {
    position: 'absolute',
    left: 15,
    bottom: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pointsBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#333' },

  // Formulaire
  formScroll: { flex: 1, backgroundColor: '#fff' },
  formContent: { padding: 20, paddingBottom: 40 },
  inputGroup: { marginBottom: 20 },
  inputHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  inputLabel: { fontSize: 13, fontWeight: 'bold', color: '#666', textTransform: 'uppercase' },
  textInput: {
    backgroundColor: '#F5F7F5',
    borderWidth: 1,
    borderColor: '#E8EDE8',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  inputLocked: { backgroundColor: '#F0F0F0', color: '#999' },
  
  gridInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  
  densityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 10,
    marginBottom: 20,
  },
  densityText: { fontSize: 12, color: '#2E7D32' },
  boldText: { fontWeight: 'bold' },

  surfaceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleBtn: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  toggleBtnActive: { backgroundColor: '#E8F5E9', borderColor: '#2E7D32' },
  toggleText: { fontSize: 10, fontWeight: 'bold', color: '#999' },
  toggleTextActive: { color: '#2E7D32' },

  saveBtn: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 20,
    gap: 10,
    elevation: 4,
    marginTop: 10,
  },
  saveBtnDisabled: { backgroundColor: '#CCC', elevation: 0 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default MapScreen;