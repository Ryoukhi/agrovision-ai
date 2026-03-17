import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ScrollView, ActivityIndicator, Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import api from '../api/client';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Coordinate } from '../types';

type MapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Map'>;
interface Props { navigation: MapScreenNavigationProp; }

const { height } = Dimensions.get('window');

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

const calculatePlantDensity = (spacingMeters: number): number => {
  if (!spacingMeters || spacingMeters <= 0) return 10000;
  const density = 10000 / (spacingMeters * spacingMeters);
  return Math.max(1, Math.round(density));
};

// ✅ HTML amélioré avec géolocalisation
const getLeafletHTML = (points: Coordinate[], userLocation: Coordinate | null, mapCenter: Coordinate) => {
  const polygonCoords = points.map(p => `[${p.latitude}, ${p.longitude}]`).join(',');
  const markersJS = points.map((p, i) => `
    L.circleMarker([${p.latitude}, ${p.longitude}], {
      radius: 7, color: '#2E7D32', fillColor: '#4CAF50', fillOpacity: 1
    }).addTo(map).bindPopup('Point ${i + 1}');
  `).join('\n');

  const polygonJS = points.length >= 3 ? `
    if (window.currentPolygon) map.removeLayer(window.currentPolygon);
    window.currentPolygon = L.polygon([${polygonCoords}], {
      color: '#2E7D32', fillColor: '#4CAF50', fillOpacity: 0.25, weight: 2
    }).addTo(map);
  ` : '';

  // Ajouter le marqueur de position utilisateur si disponible
  const userMarkerJS = userLocation ? `
    L.marker([${userLocation.latitude}, ${userLocation.longitude}], {
      icon: L.divIcon({
        className: 'user-location-marker',
        html: '📍',
        iconSize: [20, 20]
      })
    }).addTo(map).bindPopup('Vous êtes ici');
    
    // Cercle de précision (10m)
    L.circle([${userLocation.latitude}, ${userLocation.longitude}], {
      color: '#2196F3',
      fillColor: '#2196F3',
      fillOpacity: 0.1,
      radius: 10
    }).addTo(map);
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    #map { width: 100vw; height: 100vh; }
    .user-location-marker {
      font-size: 24px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // Initialise la carte centrée sur la position utilisateur ou défaut
    var map = L.map('map').setView([${mapCenter.latitude}, ${mapCenter.longitude}], 17);

    // Tuiles OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    window.currentPolygon = null;

    // Affiche les marqueurs
    ${markersJS}
    ${userMarkerJS}
    ${polygonJS}

    // Gère le clic sur la carte
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

const MapScreen: React.FC<Props> = ({ navigation }) => {
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [nom, setNom] = useState('');
  const [culture, setCulture] = useState('manioc');
  const [spacing, setSpacing] = useState('1');
  const [surface, setSurface] = useState('0.1');
  const [manualSurface, setManualSurface] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<Coordinate>({
    latitude: 4.5649999999999995,
    longitude: 12.565000000000001
  });
  const webViewRef = useRef<WebView>(null);

  // Obtenir la position GPS au chargement
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationError('Permission de localisation refusée');
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High
        });
        
        const userCoord = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        };
        
        setUserLocation(userCoord);
        setMapCenter(userCoord); // Centrer la carte sur l'utilisateur
        
      } catch (error) {
        setLocationError('Impossible d\'obtenir votre position');
      }
    })();
  }, []);

  const handleWebViewMessage = (event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'MAP_PRESS') {
      const newPoint: Coordinate = {
        latitude: data.latitude,
        longitude: data.longitude
      };
      const newPoints = [...points, newPoint];
      setPoints(newPoints);
      if (!manualSurface && newPoints.length >= 3) {
        setSurface(calculateApproximateArea(newPoints).toString());
      }
    }
  };

  const clearPoints = () => {
    setPoints([]);
    if (!manualSurface) setSurface('0.1');
  };

  const removeLastPoint = () => {
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    if (!manualSurface && newPoints.length >= 3) {
      setSurface(calculateApproximateArea(newPoints).toString());
    }
  };

  const centerOnUser = () => {
    if (userLocation) {
      setMapCenter(userLocation);
      // Recharger la WebView avec le nouveau centre
    }
  };

  const saveParcelle = async () => {
    if (!nom) { Alert.alert('Erreur', 'Donnez un nom à la parcelle'); return; }
    if (!culture) { Alert.alert('Erreur', 'Donnez une culture'); return; }
    const spacingValue = Number(spacing);
    if (isNaN(spacingValue) || spacingValue <= 0) {
      Alert.alert('Erreur', 'Indiquez une distance entre plantes valide');
      return;
    }
    if (points.length < 3) { Alert.alert('Erreur', 'Placez au moins 3 points'); return; }
    setSaving(true);
    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    const plantsPerHa = calculatePlantDensity(spacingValue);
    try {
      await api.post('/parcelles', {
        nom,
        long_min: Math.min(...lngs), lat_min: Math.min(...lats),
        long_max: Math.max(...lngs), lat_max: Math.max(...lats),
        surface_ha: parseFloat(surface) || 0.1,
        culture,
        plants_per_ha: plantsPerHa,
      });
      Alert.alert('Succès', 'Parcelle créée !', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (error: any) {
      Alert.alert('Erreur', error.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Barre d'outils pour la carte */}
      <View style={styles.mapToolbar}>
        {userLocation && (
          <TouchableOpacity style={styles.toolbarButton} onPress={centerOnUser}>
            <Text style={styles.toolbarButtonText}>📍 Me localiser</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.toolbarInfo}>
          {points.length} point{points.length > 1 ? 's' : ''}
        </Text>
      </View>

      {/* Carte OSM via WebView */}
      <WebView
        ref={webViewRef}
        style={styles.map}
        source={{ html: getLeafletHTML(points, userLocation, mapCenter) }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        originWhitelist={['*']}
      />

      {/* Message si pas de GPS */}
      {locationError && (
        <View style={styles.locationError}>
          <Text style={styles.locationErrorText}>{locationError}</Text>
        </View>
      )}

      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Nom de la parcelle</Text>
        <TextInput
          style={styles.input}
          value={nom}
          onChangeText={setNom}
          placeholder="Ex: Champ Nord"
        />

        <Text style={styles.label}>Culture</Text>
        <TextInput
          style={styles.input}
          value={culture}
          onChangeText={setCulture}
          placeholder="Ex: Manioc, Maïs, Riz"
        />

        <Text style={styles.label}>Distance entre plantes (m)</Text>
        <TextInput
          style={styles.input}
          value={spacing}
          onChangeText={(t) => setSpacing(t)}
          placeholder="1.0"
          keyboardType="numeric"
        />
        <Text style={styles.info}>Densité calculée : {calculatePlantDensity(Number(spacing))} plants/ha</Text>

        <View style={styles.surfaceContainer}>
          <Text style={styles.label}>Surface (hectares)</Text>
          <TouchableOpacity onPress={() => setManualSurface(!manualSurface)} style={styles.autoButton}>
            <Text style={styles.autoButtonText}>{manualSurface ? '🔒 Manuel' : '🔄 Auto'}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.input, !manualSurface && styles.inputDisabled]}
          value={surface}
          onChangeText={(t) => { setManualSurface(true); setSurface(t); }}
          keyboardType="numeric"
          placeholder="0.00"
          editable={manualSurface}
        />

        <View style={styles.pointsInfo}>
          <Text style={styles.info}>Points placés : {points.length}</Text>
          {points.length >= 3 && <Text style={styles.infoSuccess}>✓ Polygone valide</Text>}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.clearButton} onPress={clearPoints}>
            <Text style={styles.buttonText}>Tout effacer</Text>
          </TouchableOpacity>
          {points.length > 0 && (
            <TouchableOpacity style={styles.undoButton} onPress={removeLastPoint}>
              <Text style={styles.buttonText}>Annuler dernier</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, (points.length < 3 || !nom || saving) && styles.buttonDisabled]}
          onPress={saveParcelle}
          disabled={points.length < 3 || !nom || saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enregistrer la parcelle</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { height: height * 0.5, width: '100%' },
  mapToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  toolbarButton: {
    backgroundColor: '#2E7D32',
    padding: 8,
    borderRadius: 5,
  },
  toolbarButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  toolbarInfo: {
    fontSize: 14,
    color: '#666',
  },
  locationError: {
    backgroundColor: '#ffebee',
    padding: 10,
    alignItems: 'center',
  },
  locationErrorText: {
    color: '#c62828',
    fontSize: 14,
  },
  form: { backgroundColor: '#fff', padding: 20, maxHeight: height * 0.4 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 10, marginBottom: 15, fontSize: 16 },
  inputDisabled: { backgroundColor: '#f5f5f5', color: '#666' },
  surfaceContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  autoButton: { padding: 5 },
  autoButtonText: { color: '#2E7D32', fontSize: 12 },
  pointsInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  info: { fontSize: 14, color: '#666' },
  infoSuccess: { fontSize: 14, color: '#2E7D32', fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  clearButton: { flex: 1, backgroundColor: '#f44336', padding: 12, borderRadius: 5, marginRight: 5, alignItems: 'center' },
  undoButton: { flex: 1, backgroundColor: '#FF9800', padding: 12, borderRadius: 5, marginLeft: 5, alignItems: 'center' },
  saveButton: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 5, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#cccccc' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});

export default MapScreen;