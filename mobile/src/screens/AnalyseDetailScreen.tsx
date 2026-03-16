import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Share,
  Image, 
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Analyse } from '../types';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const { height, width } = Dimensions.get('window');

type AnalyseDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AnalyseDetail'>;

interface Props {
  navigation: AnalyseDetailScreenNavigationProp;
  route: any;
}

// Génère le graphique NDVI (simulé pour l'instant - à remplacer par de vraies images)
const getNDVIChartHTML = (ndviDates: string[], ndviValues: number[], hasRealData: boolean) => {
  const safeDates = ndviDates.length > 0 ? ndviDates : ['J-7', 'J-6', 'J-5', 'J-4', 'J-3', 'J-2', 'Hier'];
  const safeValues = ndviValues.length > 0 ? ndviValues : [20, 35, 42, 38, 45, 52, 48];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: white;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 10px;
    }
    .chart-container {
      width: 100%;
      max-width: 600px;
      height: 300px;
      position: relative;
    }
  </style>
</head>
<body>
  <div class="chart-container">
    <canvas id="ndviChart"></canvas>
  </div>
  <script>
    const ctx = document.getElementById('ndviChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(safeDates)},
        datasets: [{
          label: 'NDVI (%)',
          data: ${JSON.stringify(safeValues)},
          borderColor: '#2E7D32',
          backgroundColor: 'rgba(46,125,50,0.1)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#2E7D32',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: 'NDVI (%)' }
          }
        }
      }
    });
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: 'NDVI (%)' }
          }
        }
      }
    });
  </script>
</body>
</html>`;
};

// Composant pour afficher une métrique
const MetricCard: React.FC<{ 
  title: string; 
  value: string; 
  unit?: string;
  color?: string;
  icon?: string;
}> = ({ title, value, unit, color = '#333', icon }) => (
  <View style={[styles.metricCard, { borderLeftColor: color }]}>
    <View style={styles.metricHeader}>
      {icon && <Text style={styles.metricIcon}>{icon}</Text>}
      <Text style={styles.metricTitle}>{title}</Text>
    </View>
    <View style={styles.metricValueContainer}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {unit && <Text style={styles.metricUnit}>{unit}</Text>}
    </View>
  </View>
);

// Composant pour afficher une image
const ImageCard: React.FC<{ title: string; imageUrl?: string; analyseId?: number }> = 
  ({ title, imageUrl, analyseId }) => {
    const type = title.toLowerCase().includes('ndvi') ? 'ndvi' : title.toLowerCase().includes('multi') ? 'multi' : null;
    const downloadUrl = analyseId && type ? `http://10.183.241.242:5000/api/analyses/${analyseId}/image/${type}` : null;
    const uri = imageUrl && imageUrl.startsWith('http') ? imageUrl : (downloadUrl || undefined);

    return (
      <View style={styles.imageCard}>
        <Text style={styles.imageCardTitle}>{title}</Text>
        <View style={styles.imagePlaceholder}>
          {uri ? (
            <Image 
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <>
              <Text style={styles.placeholderIcon}>🖼️</Text>
              <Text style={styles.placeholderText}>Image non disponible</Text>
              <Text style={styles.placeholderSubText}>Attendez la génération ou vérifiez le serveur</Text>
            </>
          )}
        </View>
      </View>
    );
  };

const AnalyseDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { analyse } = route.params;
  const [loading, setLoading] = useState(false);
  const ndviDates = analyse.ndvi_dates || [];
  const ndviValues = analyse.ndvi_values || [];
  const hasRealNdvi = ndviDates.length > 0 && ndviValues.length > 0;
  const [sharing, setSharing] = useState(false);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRiskColor = (risque: string) => {
    switch (risque) {
      case 'FAIBLE': return '#4CAF50';
      case 'MODÉRÉ': return '#FF9800';
      case 'ÉLEVÉ': return '#f44336';
      case 'CRITIQUE': return '#9C27B0';
      default: return '#999';
    }
  };

  const getRiskEmoji = (risque: string) => {
    switch (risque) {
      case 'FAIBLE': return '🟢';
      case 'MODÉRÉ': return '🟡';
      case 'ÉLEVÉ': return '🟠';
      case 'CRITIQUE': return '🔴';
      default: return '⚪';
    }
  };

  const safeNumber = (value: any, digits = 2) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return num.toFixed(digits);
  };

  const safeNumberStr = (value: any) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return num.toString();
  };

  const handleShare = async () => {
    try {
      setSharing(true);
      
      // Créer un texte de rapport
      const reportText = `
🌱 AgroVision AI - Rapport d'analyse
📅 Date: ${formatDate(analyse.date_analyse)}
📍 Parcelle #${analyse.parcelle_id}

📊 RÉSULTATS:
• Taux d'infection: ${analyse.taux_infection}%
• Surface infectée: ${analyse.surface_infectee_ha} ha
• Plants infectés: ${analyse.plants_infectes}

🌤️ CONDITIONS MÉTÉO:
• Température: ${analyse.temperature_moyenne}°C
• Humidité: ${analyse.humidite_moyenne}%
• Vent: ${analyse.vent_moyen} m/s

⚠️ PRÉDICTION:
• Risque: ${analyse.risque}
• Évolution 7j: ${analyse.evolution_7j > 0 ? '+' : ''}${analyse.evolution_7j}%
• Plants dans 7j: ${analyse.plants_infectes_7j}

💡 RECOMMANDATION:
${analyse.action_recommandee}
      `;

      await Share.share({
        message: reportText,
        title: `Analyse AgroVision - ${formatDate(analyse.date_analyse)}`
      });
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de partager le rapport');
    } finally {
      setSharing(false);
    }
  };

  const handleDownloadImages = async () => {
    Alert.alert(
      'Téléchargement',
      'Les images seront disponibles dans votre galerie',
      [{ text: 'OK' }]
    );
    // Implémentation à venir avec FileSystem
  };

  return (
    <ScrollView style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.date}>{formatDate(analyse.date_analyse)}</Text>
          <View style={[styles.riskBadge, { backgroundColor: getRiskColor(analyse.risque) }]}>
            <Text style={styles.riskBadgeText}>
              {getRiskEmoji(analyse.risque)} {analyse.risque}
            </Text>
          </View>
        </View>
        <Text style={styles.recommendation}>{analyse.action_recommandee}</Text>
      </View>

      {/* Graphique NDVI */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>📈 Évolution NDVI</Text>
        <View style={styles.chartContainer}>
          <WebView
            style={styles.chart}
            source={{ html: getNDVIChartHTML(ndviDates, ndviValues, hasRealNdvi) }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scrollEnabled={false}
          />
          {!hasRealNdvi && (
            <Text style={styles.chartNotice}>Données NDVI réelles non disponibles, affichage de données de référence.</Text>
          )}
        </View>
      </View>

      {/* Images satellite */}
      <View style={styles.imagesContainer}>
        <Text style={styles.sectionTitle}>🛰️ Images satellite</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagesScroll}>
          <ImageCard title="NDVI" imageUrl={analyse.image_ndvi_path} analyseId={analyse.id} />
          <ImageCard title="Multi-spectral" imageUrl={analyse.image_multi_path} analyseId={analyse.id} />
        </ScrollView>
      </View>

      {/* Statistiques principales */}
      <View style={styles.statsGrid}>
        <MetricCard
          title="Taux d'infection"
          value={safeNumberStr(analyse.taux_infection)}
          unit="%"
          color="#f44336"
          icon="🦠"
        />
        <MetricCard
          title="Surface infectée"
          value={safeNumber(analyse.surface_infectee_ha, 2)}
          unit="ha"
          color="#FF9800"
          icon="📏"
        />
        <MetricCard
          title="Plants infectés"
          value={safeNumberStr(analyse.plants_infectes)}
          color="#9C27B0"
          icon="🌱"
        />
        <MetricCard
          title="Plants total"
          value={safeNumber(
            Number(analyse.plants_infectes) / (Number(analyse.taux_infection) / 100 || 1),
            0
          )}
          color="#2196F3"
          icon="🌿"
        />
      </View>

      {/* Conditions météo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌤️ Conditions météo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.meteoScroll}>
          <View style={styles.meteoGrid}>
            <MetricCard
              title="Température"
              value={safeNumberStr(analyse.temperature_moyenne)}
              unit="°C"
              color="#FF5722"
              icon="🌡️"
            />
            <MetricCard
              title="Humidité"
              value={safeNumberStr(analyse.humidite_moyenne)}
              unit="%"
              color="#03A9F4"
              icon="💧"
            />
            <MetricCard
              title="Vent"
              value={safeNumberStr(analyse.vent_moyen)}
              unit="m/s"
              color="#607D8B"
              icon="💨"
            />
          </View>
        </ScrollView>
      </View>

      {/* Prédiction */}
      <View style={styles.predictionCard}>
        <Text style={styles.cardTitle}>📊 Prédiction à 7 jours</Text>
        <View style={styles.predictionGrid}>
          <View style={styles.predictionItem}>
            <Text style={styles.predictionLabel}>Évolution</Text>
            <Text style={[
              styles.predictionValue,
              { color: analyse.evolution_7j > 0 ? '#f44336' : '#4CAF50' }
            ]}>
              {analyse.evolution_7j > 0 ? '+' : ''}{analyse.evolution_7j}%
            </Text>
          </View>
          <View style={styles.predictionItem}>
            <Text style={styles.predictionLabel}>Plants infectés</Text>
            <Text style={styles.predictionValue}>{analyse.plants_infectes_7j}</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.shareButton]}
          onPress={handleShare}
          disabled={sharing}>
          {sharing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.actionIcon}>📤</Text>
              <Text style={styles.actionText}>Partager le rapport</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.downloadButton]}
          onPress={handleDownloadImages}>
          <Text style={styles.actionIcon}>📥</Text>
          <Text style={styles.actionText}>Télécharger les images</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
  riskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
  },
  riskBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  recommendation: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: '500',
  },
  chartCard: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  chartContainer: {
    height: 250,
    width: '100%',
  },
  chart: {
    flex: 1,
  },
  chartNotice: {
    marginTop: 5,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  meteoScroll: {
    marginTop: 10,
  },
  meteoGrid: {
    flexDirection: 'row',
    paddingBottom: 5,
  },
  imagesContainer: {
    margin: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  imageCard: {
    backgroundColor: '#fff',
    width: 230,
    marginRight: 12,
    padding: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imagesScroll: {
    paddingHorizontal: 5,
  },
  imageCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  imagePlaceholder: {
    height: 150,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 5,
  },
  imageWebView: {
    width: '100%',
    height: '100%',
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: 5,
  },
  placeholderText: {
    fontSize: 12,
    color: '#666',
  },
  placeholderSubText: {
    fontSize: 10,
    color: '#999',
    marginTop: 5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 5,
    margin: 10,
  },
  metricCard: {
    backgroundColor: '#fff',
    width: '48%',
    margin: '1%',
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricIcon: {
    fontSize: 18,
    marginRight: 5,
  },
  metricTitle: {
    fontSize: 12,
    color: '#666',
  },
  metricValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 5,
  },
  metricUnit: {
    fontSize: 12,
    color: '#999',
  },
  section: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  predictionCard: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  predictionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  predictionItem: {
    alignItems: 'center',
  },
  predictionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  predictionValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 10,
    marginBottom: 30,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    marginHorizontal: 5,
  },
  shareButton: {
    backgroundColor: '#2196F3',
  },
  downloadButton: {
    backgroundColor: '#4CAF50',
  },
  actionIcon: {
    fontSize: 18,
    marginRight: 5,
    color: '#fff',
  },
  actionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default AnalyseDetailScreen;