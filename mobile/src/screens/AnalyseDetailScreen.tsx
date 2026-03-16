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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { WebView } from 'react-native-webview';
import api from '../api/client';

const { width } = Dimensions.get('window');

type AnalyseDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AnalyseDetail'>;
interface Props {
  navigation: AnalyseDetailScreenNavigationProp;
  route: any;
}

// ─── GRAPHIQUE NDVI ──────────────────────────────────────────────────────────
const getNDVIChartHTML = (ndviDates: string[], ndviValues: number[]) => {
  const safeDates  = ndviDates.length  > 0 ? ndviDates  : ['J-6','J-5','J-4','J-3','J-2','J-1','Auj.'];
  const safeValues = ndviValues.length > 0 ? ndviValues : [20, 35, 42, 38, 45, 52, 48];
  const lastVal    = safeValues[safeValues.length - 1];
  const lineColor  = lastVal >= 50 ? '#2E7D32' : lastVal >= 30 ? '#F57C00' : '#C62828';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#fff; padding:12px 8px; height:100vh; display:flex; align-items:center; }
    canvas { width:100% !important; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    new Chart(document.getElementById('c'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(safeDates)},
        datasets: [{
          data: ${JSON.stringify(safeValues)},
          borderColor: '${lineColor}',
          backgroundColor: '${lineColor}18',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '${lineColor}',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y + '% santé' } }
        },
        scales: {
          y: {
            beginAtZero: true, max: 100,
            ticks: { callback: v => v + '%', font: { size: 11 } },
            grid: { color: '#f0f0f0' }
          },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  </script>
</body>
</html>`;
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const safeNum = (v: any, digits = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '0';
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

type RiskLevel = 'FAIBLE' | 'MODÉRÉ' | 'ÉLEVÉ' | 'CRITIQUE';

const RISK_CONFIG: Record<RiskLevel, {
  color: string; bg: string;
  iconName: string; iconLib: 'Ionicons' | 'MaterialCommunityIcons';
  label: string;
}> = {
  'FAIBLE':   { color: '#1B5E20', bg: '#E8F5E9', iconName: 'checkmark-circle',  iconLib: 'Ionicons',                 label: 'Faible risque' },
  'MODÉRÉ':   { color: '#E65100', bg: '#FFF3E0', iconName: 'alert-circle',       iconLib: 'Ionicons',                 label: 'Risque modéré' },
  'ÉLEVÉ':    { color: '#B71C1C', bg: '#FFEBEE', iconName: 'warning',            iconLib: 'Ionicons',                 label: 'Risque élevé'  },
  'CRITIQUE': { color: '#4A148C', bg: '#F3E5F5', iconName: 'alert-octagon',      iconLib: 'MaterialCommunityIcons',   label: 'CRITIQUE'      },
};

const getRisk = (risque: string) =>
  RISK_CONFIG[risque as RiskLevel] ?? {
    color: '#555', bg: '#F5F5F5',
    iconName: 'help-circle', iconLib: 'Ionicons' as const, label: risque,
  };

// Wrapper icône générique
const VIcon: React.FC<{ lib: 'Ionicons' | 'MaterialCommunityIcons'; name: string; size: number; color: string }> =
  ({ lib, name, size, color }) =>
    lib === 'MaterialCommunityIcons'
      ? <MaterialCommunityIcons name={name as any} size={size} color={color} />
      : <Ionicons name={name as any} size={size} color={color} />;

// ─── COMPOSANT MÉTRIQUE ───────────────────────────────────────────────────────
interface MetricProps {
  iconName: string;
  iconLib?: 'Ionicons' | 'MaterialCommunityIcons';
  label: string;
  sublabel?: string;
  value: string;
  unit?: string;
  color: string;
  bg: string;
}

const BigMetricCard: React.FC<MetricProps> = ({
  iconName, iconLib = 'Ionicons', label, sublabel, value, unit, color, bg,
}) => (
  <View style={[mStyles.card, { backgroundColor: bg, borderLeftColor: color }]}>
    <View style={[mStyles.iconBox, { backgroundColor: color + '20' }]}>
      <VIcon lib={iconLib} name={iconName} size={26} color={color} />
    </View>
    <View style={mStyles.body}>
      <Text style={mStyles.label}>{label}</Text>
      {sublabel ? <Text style={mStyles.sublabel}>{sublabel}</Text> : null}
    </View>
    <View style={mStyles.valueBox}>
      <Text style={[mStyles.value, { color }]}>{value}</Text>
      {unit ? <Text style={[mStyles.unit, { color }]}>{unit}</Text> : null}
    </View>
  </View>
);

const mStyles = StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderLeftWidth: 5, padding: 14, marginBottom: 10 },
  iconBox:  { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  body:     { flex: 1 },
  label:    { fontSize: 15, fontWeight: '600', color: '#222' },
  sublabel: { fontSize: 11, color: '#888', marginTop: 2, lineHeight: 16 },
  valueBox: { alignItems: 'flex-end' },
  value:    { fontSize: 28, fontWeight: '800' },
  unit:     { fontSize: 13, fontWeight: '600', marginTop: 1 },
});

// ─── COMPOSANT IMAGE SATELLITE ────────────────────────────────────────────────
const ImageCard: React.FC<{
  title: string; subtitle: string;
  uri?: string;
}> = ({ title, subtitle, uri }) => {
  return (
    <View style={iStyles.card}>
      <Text style={iStyles.title}>{title}</Text>
      <Text style={iStyles.subtitle}>{subtitle}</Text>
      <View style={iStyles.frame}>
        {uri ? (
          <Image source={{ uri }} style={iStyles.img} resizeMode="cover" />
        ) : (
          <View style={iStyles.placeholder}>
            <MaterialCommunityIcons name="satellite-variant" size={40} color="#bbb" />
            <Text style={iStyles.placeholderText}>En attente{'\n'}du serveur</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const iStyles = StyleSheet.create({
  card:            { width: width * 0.62, marginRight: 14, backgroundColor: '#fff', borderRadius: 14, padding: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  title:           { fontSize: 14, fontWeight: '700', color: '#222' },
  subtitle:        { fontSize: 11, color: '#888', marginBottom: 8 },
  frame:           { height: 160, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f0f0f0' },
  img:             { width: '100%', height: '100%' },
  placeholder:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  placeholderText: { fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 18 },
});

// ─── ÉCRAN PRINCIPAL ──────────────────────────────────────────────────────────
const AnalyseDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { analyse } = route.params;
  const [sharing, setSharing] = useState(false);
  const [ndviImageUri, setNdviImageUri] = useState<string | null>(null);
  const [multiImageUri, setMultiImageUri] = useState<string | null>(null);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        // Fetch NDVI image
        if (analyse.image_ndvi_path) {
          const ndviResponse = await api.get(`/analyses/${analyse.id}/image/ndvi`, {
            responseType: 'arraybuffer',
          });
          const ndviBase64 = `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(ndviResponse.data)))}`;
          setNdviImageUri(ndviBase64);
        }

        // Fetch Multi image
        if (analyse.image_multi_path) {
          const multiResponse = await api.get(`/analyses/${analyse.id}/image/multi`, {
            responseType: 'arraybuffer',
          });
          const multiBase64 = `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(multiResponse.data)))}`;
          setMultiImageUri(multiBase64);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des images:', error);
      }
    };

    fetchImages();
  }, [analyse.id, analyse.image_ndvi_path, analyse.image_multi_path]);

  const risk          = getRisk(analyse.risque);
  const ndviDates     = analyse.ndvi_dates  || [];
  const ndviValues    = analyse.ndvi_values || [];
  const hasRealNdvi   = ndviDates.length > 0 && ndviValues.length > 0;
  const tauxInfection = Number(analyse.taux_infection) || 0;
  const evolution     = Number(analyse.evolution_7j)   || 0;

  const infectionLabel =
    tauxInfection < 10 ? 'Faible infection' :
    tauxInfection < 30 ? 'Infection modérée' :
    tauxInfection < 60 ? 'Infection importante' : 'Infection sévère';

  const evolutionLabel = evolution > 0
    ? `+${evolution}% — intervenez rapidement`
    : evolution < 0
    ? `${evolution}% — situation en amélioration`
    : 'Stable dans 7 jours';

  const handleShare = async () => {
    try {
      setSharing(true);
      await Share.share({
        title: 'Rapport AgroVision AI',
        message:
`AgroVision AI — Rapport du ${formatDate(analyse.date_analyse)}

RISQUE : ${analyse.risque}

ETAT DU CHAMP :
- Infection : ${analyse.taux_infection}% (${infectionLabel})
- Surface touchee : ${safeNum(analyse.surface_infectee_ha, 2)} ha
- Plants infectes : ${analyse.plants_infectes}

METEO :
- Temperature : ${analyse.temperature_moyenne}C
- Humidite : ${analyse.humidite_moyenne}%
- Vent : ${analyse.vent_moyen} m/s

PREVISION 7 JOURS : ${evolutionLabel}
Plants infectes estimes : ${analyse.plants_infectes_7j}

A FAIRE : ${analyse.action_recommandee}`,
      });
    } catch {
      Alert.alert('Erreur', 'Impossible de partager le rapport');
    } finally {
      setSharing(false);
    }
  };

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>

      {/* ── BANDEAU RISQUE ── */}
      <View style={[styles.riskBanner, { backgroundColor: risk.bg, borderColor: risk.color }]}>
        <View style={[styles.riskIconBox, { backgroundColor: risk.color + '22' }]}>
          <VIcon lib={risk.iconLib} name={risk.iconName} size={36} color={risk.color} />
        </View>
        <View style={styles.riskTextBlock}>
          <Text style={[styles.riskTitle, { color: risk.color }]}>{risk.label}</Text>
          <Text style={styles.riskDate}>{formatDate(analyse.date_analyse)}</Text>
        </View>
      </View>

      {/* ── RECOMMANDATION ── */}
      <View style={[styles.recoCard, { borderColor: risk.color }]}>
        <View style={styles.recoHeader}>
          <Ionicons name="bulb-outline" size={18} color={risk.color} />
          <Text style={[styles.recoHeading, { color: risk.color }]}>  Que faire ?</Text>
        </View>
        <Text style={styles.recoText}>{analyse.action_recommandee}</Text>
      </View>

      {/* ── ÉTAT DU CHAMP ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="chart-bar" size={20} color="#333" />
          <Text style={styles.sectionTitle}>  État du champ</Text>
        </View>
        <BigMetricCard
          iconName="bug-outline" iconLib="Ionicons"
          label="Taux d'infection" sublabel={infectionLabel}
          value={safeNum(analyse.taux_infection)} unit="%"
          color="#B71C1C" bg="#FFEBEE"
        />
        <BigMetricCard
          iconName="ruler-square" iconLib="MaterialCommunityIcons"
          label="Surface touchée" sublabel="hectares affectés"
          value={safeNum(analyse.surface_infectee_ha, 2)} unit="ha"
          color="#E65100" bg="#FFF3E0"
        />
        <BigMetricCard
          iconName="sprout-outline" iconLib="MaterialCommunityIcons"
          label="Plants infectés"
          sublabel={`sur ${safeNum(tauxInfection > 0 ? Number(analyse.plants_infectes) / (tauxInfection / 100) : 0)} plants au total`}
          value={String(analyse.plants_infectes)}
          color="#6A1B9A" bg="#F3E5F5"
        />
      </View>

      {/* ── GRAPHIQUE NDVI ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="trending-up-outline" size={20} color="#333" />
          <Text style={styles.sectionTitle}>  Santé de la végétation</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Mesure satellite · 0 % = plante morte  ·  100 % = très sain
        </Text>
        {!hasRealNdvi && (
          <View style={styles.noticeBand}>
            <Ionicons name="information-circle-outline" size={16} color="#795548" />
            <Text style={styles.noticeText}>  Données réelles non disponibles — affichage indicatif</Text>
          </View>
        )}
        <View style={styles.chartBox}>
          <WebView
            style={{ flex: 1 }}
            source={{ html: getNDVIChartHTML(ndviDates, ndviValues) }}
            javaScriptEnabled domStorageEnabled scrollEnabled={false}
          />
        </View>
      </View>

      {/* ── PRÉVISION 7 JOURS ── */}
      <View style={[styles.predCard, {
        backgroundColor: evolution > 0 ? '#FFEBEE' : '#E8F5E9',
        borderColor:     evolution > 0 ? '#C62828' : '#2E7D32',
      }]}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name={evolution > 0 ? 'trending-up' : 'trending-down'}
            size={20}
            color={evolution > 0 ? '#C62828' : '#2E7D32'}
          />
          <Text style={styles.sectionTitle}>  Dans 7 jours</Text>
        </View>
        <Text style={[styles.predEvolution, { color: evolution > 0 ? '#C62828' : '#2E7D32' }]}>
          {evolutionLabel}
        </Text>
        <View style={styles.predRow}>
          <View style={styles.predItem}>
            <Text style={styles.predLabel}>Plants infectés estimés</Text>
            <Text style={styles.predValue}>{analyse.plants_infectes_7j}</Text>
          </View>
          <View style={styles.predDivider} />
          <View style={styles.predItem}>
            <Text style={styles.predLabel}>Évolution</Text>
            <Text style={[styles.predValue, { color: evolution > 0 ? '#C62828' : '#2E7D32' }]}>
              {evolution > 0 ? '+' : ''}{evolution}%
            </Text>
          </View>
        </View>
      </View>

      {/* ── MÉTÉO ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="partly-sunny-outline" size={20} color="#333" />
          <Text style={styles.sectionTitle}>  Conditions météo</Text>
        </View>
        <BigMetricCard
          iconName="thermometer" iconLib="MaterialCommunityIcons"
          label="Température" sublabel="au moment de l'analyse"
          value={safeNum(analyse.temperature_moyenne, 1)} unit="°C"
          color="#BF360C" bg="#FBE9E7"
        />
        <BigMetricCard
          iconName="water-outline" iconLib="Ionicons"
          label="Humidité de l'air" sublabel="favorise la propagation si > 80 %"
          value={safeNum(analyse.humidite_moyenne)} unit="%"
          color="#01579B" bg="#E1F5FE"
        />
        <BigMetricCard
          iconName="weather-windy" iconLib="MaterialCommunityIcons"
          label="Vent" sublabel="disperse les spores de maladie"
          value={safeNum(analyse.vent_moyen, 1)} unit="m/s"
          color="#37474F" bg="#ECEFF1"
        />
      </View>

      {/* ── IMAGES SATELLITE ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="satellite-variant" size={20} color="#333" />
          <Text style={styles.sectionTitle}>  Images satellite</Text>
        </View>
        <Text style={styles.sectionSubtitle}>Glissez pour voir les différentes vues</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagesRow}>
          <ImageCard title="NDVI"           subtitle="Santé générale de la végétation" uri={ndviImageUri} />
          <ImageCard title="Multi-spectral" subtitle="Vue combinée des bandes"         uri={multiImageUri} />
        </ScrollView>
      </View>

      {/* ── ACTIONS ── */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare} disabled={sharing}>
          {sharing
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="share-social-outline" size={20} color="#fff" />
                <Text style={styles.actionLabel}>  Partager</Text>
              </>
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.downloadBtn]}
          onPress={() => Alert.alert('Bientôt disponible', 'Le téléchargement des images sera activé prochainement.')}>
          <Ionicons name="download-outline" size={20} color="#fff" />
          <Text style={styles.actionLabel}>  Télécharger</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6F4' },

  riskBanner: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, marginBottom: 10, padding: 18,
    borderRadius: 16, borderWidth: 2,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.1,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  riskIconBox:   { width: 60, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  riskTextBlock: { flex: 1 },
  riskTitle:     { fontSize: 22, fontWeight: '900', letterSpacing: 0.3 },
  riskDate:      { fontSize: 12, color: '#888', marginTop: 3 },

  recoCard: {
    marginHorizontal: 16, marginBottom: 16, padding: 18,
    backgroundColor: '#fff', borderRadius: 16, borderLeftWidth: 5,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  recoHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  recoHeading: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  recoText:    { fontSize: 17, color: '#222', lineHeight: 26, fontWeight: '500' },

  section:         { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sectionTitle:    { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  sectionSubtitle: { fontSize: 12, color: '#888', marginBottom: 12 },

  noticeBand: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: '#FFC107',
  },
  noticeText: { fontSize: 12, color: '#795548' },

  chartBox: {
    height: 220, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },

  predCard:      { marginHorizontal: 16, marginBottom: 16, padding: 18, borderRadius: 16, borderWidth: 1.5 },
  predEvolution: { fontSize: 15, fontWeight: '600', marginBottom: 16, lineHeight: 22 },
  predRow:       { flexDirection: 'row', alignItems: 'center' },
  predItem:      { flex: 1, alignItems: 'center' },
  predLabel:     { fontSize: 12, color: '#777', textAlign: 'center', marginBottom: 4 },
  predValue:     { fontSize: 26, fontWeight: '800', color: '#333' },
  predDivider:   { width: 1, height: 50, backgroundColor: '#ddd' },

  imagesRow: { paddingRight: 16 },

  actionsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 4, gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.1,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  shareBtn:    { backgroundColor: '#1565C0' },
  downloadBtn: { backgroundColor: '#2E7D32' },
  actionLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default AnalyseDetailScreen;