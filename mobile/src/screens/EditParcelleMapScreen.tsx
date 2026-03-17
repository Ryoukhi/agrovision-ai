import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Parcelle, Coordinate } from '../types';
import api from '../api/client';

type EditParcelleMapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditParcelleMap'>;

interface Props {
  navigation: EditParcelleMapScreenNavigationProp;
  route: any;
}

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

const getLeafletHTML = (points: Coordinate[], mapCenter: Coordinate) => {
  const polygonCoords = points.map(p => `[${p.latitude}, ${p.longitude}]`).join(',');
  const markersJS = points.map((p, i) => `
    L.circleMarker([${p.latitude}, ${p.longitude}], { radius: 7, color: '#2E7D32', fillColor: '#4CAF50', fillOpacity: 1 }).addTo(map).bindPopup('Point ${i + 1}');
  `).join('\n');
  const polygonJS = points.length >= 3 ? `
    if (window.currentPolygon) map.removeLayer(window.currentPolygon);
    window.currentPolygon = L.polygon([${polygonCoords}], { color: '#2E7D32', fillColor: '#4CAF50', fillOpacity: 0.25, weight: 2 }).addTo(map);
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style> body, html, #map { margin:0; height:100%; width:100%; } </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map').setView([${mapCenter.latitude}, ${mapCenter.longitude}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    ${markersJS}
    ${polygonJS}
    map.on('click', function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_PRESS', latitude: e.latlng.lat, longitude: e.latlng.lng }));
    });
  </script>
</body>
</html>`;
};

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
  const [error, setError] = useState<string | null>(null);

  const handleWebViewMessage = (event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'MAP_PRESS') {
      const newPoint: Coordinate = { latitude: data.latitude, longitude: data.longitude };
      const newPoints = [...points, newPoint];
      setPoints(newPoints);
      if (newPoints.length >= 3) setSurface(String(calculateApproximateArea(newPoints)));
    }
  };

  const clearPoints = () => {
    setPoints([]);
    setSurface('0.1');
  };

  const save = async () => {
    if (points.length < 3) { Alert.alert('Erreur', 'Créez un polygone avec au moins 3 points'); return; }
    const lats = points.map(p => p.latitude);
    const lngs = points.map(p => p.longitude);
    const long_min = Math.min(...lngs);
    const lat_min = Math.min(...lats);
    const long_max = Math.max(...lngs);
    const lat_max = Math.max(...lats);
    if (long_min >= long_max || lat_min >= lat_max) {
      setError('Coordonnées incohérentes. Assurez-vous d’avoir une zone valide.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/parcelles/${parcelle.id}`, {
        long_min, lat_min, long_max, lat_max,
        surface_ha: Number(surface),
      });
      Alert.alert('Succès', 'Coordonnées mises à jour');
      navigation.navigate('ParcelleDetail', {
        parcelle: {
          ...parcelle,
          long_min,
          lat_min,
          long_max,
          lat_max,
          surface_ha: Number(surface),
        }
      });
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const mapCenter = {
    latitude: (parcelle.lat_min + parcelle.lat_max) / 2,
    longitude: (parcelle.long_min + parcelle.long_max) / 2,
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <WebView
          source={{ html: getLeafletHTML(points, mapCenter) }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          originWhitelist={['*']}
          style={styles.map}
        />
      </View>
      <View style={styles.form}>
        <Text style={styles.label}>Points: {points.length}</Text>
        <Text style={styles.label}>Surface calculée: {surface} ha</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.buttonsRow}>
          <TouchableOpacity style={styles.clearButton} onPress={clearPoints}><Text style={styles.btnText}>Effacer</Text></TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}><Text style={styles.btnText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text></TouchableOpacity>
        </View>
        <Text style={styles.help}>Tap sur la carte pour ajouter un point, puis enregistrez.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  mapContainer: { height: height * 0.54 },
  map: { flex: 1 },
  form: { padding: 12 },
  label: { color: '#333', marginBottom: 6 },
  error: { color: '#d32f2f', marginBottom: 8 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  clearButton: { backgroundColor: '#f44336', borderRadius: 6, padding: 10, flex: 1, marginRight: 4 },
  saveButton: { backgroundColor: '#2E7D32', borderRadius: 6, padding: 10, flex: 1, marginLeft: 4 },
  btnText: { textAlign: 'center', color: '#fff', fontWeight: '700' },
  help: { marginTop: 10, fontSize: 12, color: '#666' },
});

export default EditParcelleMapScreen;
