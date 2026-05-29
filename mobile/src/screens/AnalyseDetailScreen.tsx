import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Dimensions, Share, Image, Modal,
  Pressable, Platform, ToastAndroid, Animated,
} from 'react-native';
// @ts-ignore
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { WebView } from 'react-native-webview';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import api from '../api/client';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
// @ts-ignore
const base64Encode = require('base-64').encode;

const { width } = Dimensions.get('window');

type AnalyseDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AnalyseDetail'>;
interface Props {
  navigation: AnalyseDetailScreenNavigationProp;
  route: any;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const safeNum = (v: any, digits = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '0';
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const formatSatelliteDate = (dateStr?: string) => {
  if (!dateStr) return 'Date image non disponible';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
};

// Une parcelle de foot = ~0.7 ha
const FOOTBALL_FIELD_HA = 0.7;

const haToFootballFields = (ha: number): number => ha / FOOTBALL_FIELD_HA;

// ─── CONFIGS ──────────────────────────────────────────────────────────────────
type RiskLevel = 'FAIBLE' | 'MODÉRÉ' | 'ÉLEVÉ' | 'CRITIQUE' | 'INFO';

const RISK_CONFIG: Record<RiskLevel, {
  color: string; bg: string;
  iconName: string; iconLib: 'Ionicons' | 'MaterialCommunityIcons';
  label: string;
}> = {
  'FAIBLE':   { color: '#1B5E20', bg: '#E8F5E9', iconName: 'checkmark-circle',  iconLib: 'Ionicons',                 label: 'Faible risque' },
  'MODÉRÉ':   { color: '#E65100', bg: '#FFF3E0', iconName: 'alert-circle',       iconLib: 'Ionicons',                 label: 'Risque modéré' },
  'ÉLEVÉ':    { color: '#B71C1C', bg: '#FFEBEE', iconName: 'warning',            iconLib: 'Ionicons',                 label: 'Risque élevé'  },
  'CRITIQUE': { color: '#4A148C', bg: '#F3E5F5', iconName: 'alert-octagon',      iconLib: 'MaterialCommunityIcons',   label: 'CRITIQUE'      },
  'INFO':     { color: '#546E7A', bg: '#ECEFF1', iconName: 'information-circle', iconLib: 'Ionicons',                 label: 'Information'   },
};

const ZONE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  'vegetation_dense':       { label: 'Forêt / Végétation dense',       icon: 'forest',             color: '#1B5E20', bg: '#E8F5E9' },
  'vegetation_moderee':     { label: 'Cultures / Végétation modérée',  icon: 'sprout',             color: '#2E7D32', bg: '#E8F5E9' },
  'vegetation_clairsemee':  { label: 'Zone rurale / Végétation clairsemée', icon: 'grass',         color: '#827717', bg: '#F9FBE7' },
  'urbain_sol_nu':          { label: 'Urbain / Sol nu',                icon: 'city-variant-outline', color: '#616161', bg: '#F5F5F5' },
  'eau':                    { label: "Plan d'eau / Rivière",            icon: 'water',              color: '#1565C0', bg: '#E3F2FD' },
  'desert':                 { label: 'Zone désertique / Aride',         icon: 'weather-sunny',      color: '#E65100', bg: '#FFF3E0' },
  'zone_humide':            { label: 'Zone humide / Marais',            icon: 'nature',             color: '#00695C', bg: '#E0F2F1' },
  'inconnu':                { label: 'Non classifié',                   icon: 'help-circle',        color: '#888',   bg: '#F5F5F5' },
};

const getRisk = (risque: string) =>
  RISK_CONFIG[risque as RiskLevel] ?? {
    color: '#555', bg: '#F5F5F5',
    iconName: 'help-circle', iconLib: 'Ionicons' as const, label: risque,
  };

// ─── COMPOSANT ICÔNE ──────────────────────────────────────────────────────────
const VIcon: React.FC<{ lib: 'Ionicons' | 'MaterialCommunityIcons'; name: string; size: number; color: string }> =
  ({ lib, name, size, color }) =>
    lib === 'MaterialCommunityIcons'
      ? <MaterialCommunityIcons name={name as any} size={size} color={color} />
      : <Ionicons name={name as any} size={size} color={color} />;

// ─── JAUGE DE SANTÉ CIRCULAIRE ────────────────────────────────────────────────
const HealthGauge: React.FC<{ score: number }> = ({ score }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 80 ? '#2E7D32' : clamped >= 50 ? '#E65100' : '#C62828';
  const bgColor = clamped >= 80 ? '#E8F5E9' : clamped >= 50 ? '#FFF3E0' : '#FFEBEE';
  const size = 140;
  const strokeWidth = 14;

  // Segments pour simuler un cercle de progression (approche sans SVG)
  const segments = [
    { pct: 25, color: '#C62828' },   // rouge: 0-25%
    { pct: 25, color: '#E65100' },   // orange: 25-50%
    { pct: 25, color: '#FDD835' },   // jaune: 50-75%
    { pct: 25, color: '#2E7D32' },   // vert: 75-100%
  ];

  // Déterminer la rotation du marqueur
  const rotation = (clamped / 100) * 360 - 90; // -90 pour démarrer en haut

  return (
    <View style={{ alignItems: 'center', marginBottom: 4 }}>
      <View style={[gStyles.outerRing, { width: size, height: size, borderRadius: size / 2 }]}>
        {/* Cadrans de fond (4 quarts) */}
        {segments.map((seg, i) => (
          <View
            key={i}
            style={[gStyles.quadrant, {
              width: size / 2, height: size / 2,
              top: i < 2 ? 0 : size / 2,
              left: i % 2 === 0 ? 0 : size / 2,
              backgroundColor: seg.color,
              borderTopLeftRadius: i === 0 ? size / 2 : 0,
              borderTopRightRadius: i === 1 ? size / 2 : 0,
              borderBottomLeftRadius: i === 2 ? size / 2 : 0,
              borderBottomRightRadius: i === 3 ? size / 2 : 0,
              opacity: (i + 1) * 25 <= clamped ? 0.85 : 0.12,
            }]} />
        ))}

        {/* Cercle intérieur blanc */}
        <View style={[gStyles.innerCircle, {
          width: size - strokeWidth * 2,
          height: size - strokeWidth * 2,
          borderRadius: (size - strokeWidth * 2) / 2,
        }]}>
          <Text style={[gStyles.scoreText, { color }]}>{Math.round(clamped)}%</Text>
          <Text style={gStyles.scoreLabel}>Santé</Text>
        </View>
      </View>

      {/* Légende */}
      <Text style={[gStyles.caption, { color }]}>
        {clamped >= 80 ? '🌱 Bon état sanitaire' :
         clamped >= 50 ? '⚕️ Surveillance nécessaire' :
         '🔴 Intervention urgente'}
      </Text>
    </View>
  );
};

const gStyles = StyleSheet.create({
  outerRing: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.12,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  quadrant: { position: 'absolute' },
  innerCircle: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    elevation: 2,
  },
  scoreText: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  scoreLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: -2 },
  caption: { fontSize: 14, fontWeight: '700', marginTop: 8 },
});

// ─── BANDEAU STATS SUPERPOSÉ ──────────────────────────────────────────────────
const OverlayStat: React.FC<{ icon: string; lib?: 'Ionicons' | 'MaterialCommunityIcons'; label: string; value: string; color: string }> =
  ({ icon, lib = 'Ionicons', label, value, color }) => (
    <View style={oStyles.row}>
      <VIcon lib={lib} name={icon} size={16} color={color} />
      <Text style={oStyles.label}>{label}</Text>
      <Text style={[oStyles.value, { color }]}>{value}</Text>
    </View>
  );

const oStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  label: { fontSize: 13, color: '#fff', marginLeft: 6, flex: 1, fontWeight: '500' },
  value: { fontSize: 15, fontWeight: '800' },
});

// ─── INDICATEUR SIMPLIFIÉ ─────────────────────────────────────────────────────
const SimpleIndicator: React.FC<{
  icon: string; iconLib?: 'Ionicons' | 'MaterialCommunityIcons';
  text: string; color: string;
}> = ({ icon, iconLib = 'Ionicons', text, color }) => (
  <View style={[simStyles.card, { borderLeftColor: color }]}>
    <View style={[simStyles.iconBox, { backgroundColor: color + '18' }]}>
      <VIcon lib={iconLib} name={icon} size={22} color={color} />
    </View>
    <Text style={[simStyles.text, { color }]}>{text}</Text>
  </View>
);

const simStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    borderLeftWidth: 5,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  text: { fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 20 },
});

// ─── MÉTRIQUE CLASSIQUE ───────────────────────────────────────────────────────
interface MetricProps {
  iconName: string; iconLib?: 'Ionicons' | 'MaterialCommunityIcons';
  label: string; sublabel?: string; value: string; unit?: string;
  color: string; bg: string;
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

// ─── CARTE IMAGE ──────────────────────────────────────────────────────────────
const ImageCard: React.FC<{
  title: string; subtitle: string;
  uri?: string | null;
  onPress?: () => void;
  onDownload?: () => void;
}> = ({ title, subtitle, uri, onPress, onDownload }) => (
  <View style={iStyles.card}>
    <View style={iStyles.cardHeader}>
      <Text style={iStyles.title}>{title}</Text>
      <TouchableOpacity onPress={onDownload} disabled={!uri} style={iStyles.downloadIcon}>
        <Ionicons name="download-outline" size={18} color={uri ? '#1e88e5' : '#ccc'} />
      </TouchableOpacity>
    </View>
    <Text style={iStyles.subtitle}>{subtitle}</Text>
    <Pressable onPress={onPress} disabled={!uri} style={iStyles.frame}>
      {uri ? (
        <Image source={{ uri }} style={iStyles.img} resizeMode="cover" />
      ) : (
        <View style={iStyles.placeholder}>
          <MaterialCommunityIcons name="satellite-variant" size={40} color="#bbb" />
          <Text style={iStyles.placeholderText}>En attente{'\n'}du serveur</Text>
        </View>
      )}
    </Pressable>
  </View>
);

const iStyles = StyleSheet.create({
  card:            { width: width * 0.62, marginRight: 14, backgroundColor: '#fff', borderRadius: 14, padding: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  cardHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title:           { fontSize: 14, fontWeight: '700', color: '#222' },
  subtitle:        { fontSize: 11, color: '#888', marginBottom: 8 },
  frame:           { height: 160, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f0f0f0' },
  img:             { width: '100%', height: '100%' },
  placeholder:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  placeholderText: { fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 18 },
  downloadIcon:    { padding: 4 },
});

// ─── TIMELINE VISUELLE ──────────────────────────────────────────────────────
const getTimelineChartHTML = (ndviDates: string[], ndviValues: number[]) => {
  const safeDates  = ndviDates.length  > 0 ? ndviDates  : ['J-6','J-5','J-4','J-3','J-2','J-1','Auj.'];
  const safeValues = ndviValues.length > 0 ? ndviValues : [20, 35, 42, 38, 45, 52, 48];
  const lastVal    = safeValues[safeValues.length - 1];
  const firstVal   = safeValues[0];
  const trend      = lastVal - firstVal;
  const lineColor  = lastVal >= 50 ? '#2E7D32' : lastVal >= 30 ? '#F57C00' : '#C62828';
  const trendIcon  = trend > 5 ? '&#x1f4c8;' : trend < -5 ? '&#x1f4c9;' : '&#x27a1;';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      background:#fff; padding:12px; height:100vh;
      display:flex; flex-direction:column;
      font-family:-apple-system,system-ui,sans-serif;
    }
    .tl-header {
      display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;
    }
    .tl-title { font-size:13px; font-weight:700; color:#555; }
    .tl-badge {
      background:${lineColor}; color:#fff;
      padding:3px 14px; border-radius:16px;
      font-weight:800; font-size:17px;
    }
    .tl-trend { font-size:12px; color:#888; margin-bottom:6px; }
    .tl-chart { flex:1; position:relative; min-height:130px; }
    canvas { width:100% !important; height:100% !important; }
  </style>
</head>
<body>
  <div class="tl-header">
    <span class="tl-title">&#x1f331; Sant&eacute; v&eacute;g&eacute;tale</span>
    <span class="tl-badge">${lastVal}%</span>
  </div>
  <div class="tl-trend">${trendIcon} Tendance&nbsp;: ${trend > 0 ? '+' : ''}${trend} pts</div>
  <div class="tl-chart">
    <canvas id="c"></canvas>
  </div>
  <script>
    (function() {
      var ctx = document.getElementById('c');
      var gradient = ctx.getContext('2d').createLinearGradient(0,0,0,180);
      gradient.addColorStop(0, '${lineColor}55');
      gradient.addColorStop(1, '${lineColor}05');

      var todayPlugin = {
        id: 'todayLine',
        afterDraw: function(chart) {
          var ctx = chart.ctx, ca = chart.chartArea, sc = chart.scales;
          var lastIdx = chart.data.labels.length - 1;
          if (lastIdx < 0) return;
          var x = sc.x.getPixelForValue(lastIdx);
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = '${lineColor}';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.moveTo(x, ca.top);
          ctx.lineTo(x, ca.bottom);
          ctx.stroke();
          ctx.fillStyle = '${lineColor}';
          ctx.font = 'bold 9px -apple-system,sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('AUJOURD\'HUI', x, ca.top - 6);
          ctx.restore();
        }
      };

      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ${JSON.stringify(safeDates)},
          datasets: [{
            data: ${JSON.stringify(safeValues)},
            borderColor: '${lineColor}',
            backgroundColor: gradient,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: function(ctx) {
              return ctx.dataIndex === ctx.dataset.data.length - 1 ? '#fff' : '${lineColor}';
            },
            pointBorderColor: function(ctx) {
              return ctx.dataIndex === ctx.dataset.data.length - 1 ? '${lineColor}' : '${lineColor}';
            },
            pointBorderWidth: function(ctx) {
              return ctx.dataIndex === ctx.dataset.data.length - 1 ? 4 : 2;
            },
            pointRadius: function(ctx) {
              return ctx.dataIndex === ctx.dataset.data.length - 1 ? 8 : 4;
            },
            pointHoverRadius: 10,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: function(ctx) { return ' ' + ctx.parsed.y + '% sant\u00e9'; } }
            }
          },
          scales: {
            y: {
              beginAtZero: true, max: 100,
              ticks: { callback: function(v) { return v + '%'; }, font: { size: 11, weight:'600' }, color:'#888' },
              grid: { color:'#e8e8e8', drawBorder:false }
            },
            x: {
              ticks: { font: { size: 10 }, color:'#888', maxTicksLimit: 7 },
              grid: { display:false }
            }
          },
          interaction: { intersect: false, mode: 'index' }
        },
        plugins: [todayPlugin]
      });
    })();
  </script>
</body>
</html>`;
};

// ─── ÉTAPES CONCRÈTES ────────────────────────────────────────────────────────
const getActionSteps = (tauxInfection: number): { icon: string; title: string; desc: string }[] => {
  if (tauxInfection < 10) return [
    { icon: 'eye-outline',              title: 'Surveillance visuelle',                desc: 'Inspectez le champ une fois par semaine.' },
    { icon: 'checkmark-circle-outline', title: 'Aucun traitement requis',             desc: "Le niveau d'infection est négligeable." },
    { icon: 'leaf-outline',             title: 'Bonnes pratiques',                     desc: 'Maintenez l\'irrigation et la fertilisation habituelles.' },
  ];
  if (tauxInfection < 30) return [
    { icon: 'eye-outline',              title: 'Surveillance renforcée',        desc: 'Inspectez le champ tous les 3 jours.' },
    { icon: 'flask-outline',            title: 'Traitement localisé',           desc: 'Appliquez un traitement sur les zones touchées.' },
    { icon: 'calendar-outline',         title: 'Revoir dans 7 jours',                  desc: 'Planifiez une nouvelle analyse satellite.' },
  ];
  if (tauxInfection < 60) return [
    { icon: 'alert-circle-outline',     title: 'Intervention rapide',                  desc: 'Agissez dans les 48 heures.' },
    { icon: 'flask-outline',            title: 'Traitement large',                     desc: 'Appliquez un traitement sur toute la parcelle.' },
    { icon: 'calendar-outline',         title: 'Suivi rapproché',               desc: 'Analyse de contrôle dans 3 à 5 jours.' },
  ];
  return [
    { icon: 'warning-outline',          title: 'URGENCE — Traitement immédiat', desc: 'Plus de 60 % touchés. Traitez sans délai.' },
    { icon: 'call-outline',             title: 'Contacter un expert',                  desc: 'Consultez un technicien agricole.' },
    { icon: 'trash-outline',            title: 'Mesures radicales',                    desc: 'Envisagez l\'arrachage des zones les plus atteintes.' },
  ];
};

// ─── MODAL RECOS ──────────────────────────────────────────────────────────────
const RecoModal: React.FC<{
  visible: boolean; onClose: () => void;
  risk: ReturnType<typeof getRisk>;
  tauxInfection: number; actionRecommandee: string;
}> = ({ visible, onClose, risk, tauxInfection, actionRecommandee }) => {
  const steps = getActionSteps(tauxInfection);
  const urgencyColor = tauxInfection >= 60 ? '#C62828' : tauxInfection >= 30 ? '#E65100' : '#2E7D32';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={rmStyles.overlay}>
        <View style={rmStyles.card}>
          {/* Header */}
          <View style={rmStyles.header}>
            <View style={[rmStyles.riskBadge, { backgroundColor: risk.bg }]}>
              <VIcon lib={risk.iconLib} name={risk.iconName} size={26} color={risk.color} />
            </View>
            <View style={rmStyles.headerText}>
              <Text style={[rmStyles.riskLabel, { color: risk.color }]}>{risk.label}</Text>
              <Text style={rmStyles.riskSub}>
                {tauxInfection.toFixed(0)}% de la parcelle touch&eacute;e
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={rmStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Steps */}
          <ScrollView style={rmStyles.body} showsVerticalScrollIndicator={false}>
            {steps.map((step, i) => (
              <View key={i} style={[rmStyles.stepCard, { borderLeftColor: urgencyColor }]}>
                <View style={[rmStyles.stepIconBox, { backgroundColor: urgencyColor + '18' }]}>
                  <Ionicons name={step.icon as any} size={20} color={urgencyColor} />
                </View>
                <View style={rmStyles.stepText}>
                  <Text style={rmStyles.stepTitle}>{step.title}</Text>
                  <Text style={rmStyles.stepDesc}>{step.desc}</Text>
                </View>
                <View style={rmStyles.stepNum}>
                  <Text style={[rmStyles.stepNumText, { color: urgencyColor }]}>{i + 1}</Text>
                </View>
              </View>
            ))}

            {/* Personalized recommendation */}
            {actionRecommandee && (
              <View style={rmStyles.recoBox}>
                <View style={rmStyles.recoBoxHeader}>
                  <Ionicons name="bulb-outline" size={18} color="#1B5E20" />
                  <Text style={rmStyles.recoBoxTitle}>  Recommandation personnalis&eacute;e</Text>
                </View>
                <Text style={rmStyles.recoBoxText}>{actionRecommandee}</Text>
              </View>
            )}

            {/* Prevention tips */}
            <View style={rmStyles.tipsBox}>
              <Text style={rmStyles.tipsTitle}>Conseils de pr&eacute;vention</Text>
              {tauxInfection < 30 ? (
                <Text style={rmStyles.tipsText}>
                  Maintenez une surveillance r&eacute;guli&egrave;re et des pratiques culturales optimales.
                  Une rotation des cultures et un drainage adapt&eacute; limitent les risques.
                </Text>
              ) : (
                <Text style={rmStyles.tipsText}>
                  Apr&egrave;s traitement, &eacute;vitez de travailler dans les zones humides pour ne pas
                  propager les spores. Nettoyez le mat&eacute;riel agricole entre les parcelles.
                </Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const rmStyles = StyleSheet.create({
  overlay: {
    flex:1, backgroundColor:'rgba(0,0,0,0.45)',
    justifyContent:'flex-end', alignItems:'stretch',
  },
  card: {
    backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24,
    maxHeight:'85%', paddingTop:20, paddingHorizontal:20, paddingBottom:30,
    elevation:12, shadowColor:'#000', shadowOpacity:0.15, shadowRadius:24,
  },
  header: {
    flexDirection:'row', alignItems:'center', marginBottom:16,
  },
  riskBadge: {
    width:48, height:48, borderRadius:14,
    justifyContent:'center', alignItems:'center', marginRight:14,
  },
  headerText: { flex:1 },
  riskLabel: { fontSize:18, fontWeight:'800' },
  riskSub: { fontSize:13, color:'#888', marginTop:2 },
  closeBtn: { padding:8 },
  body: { flexGrow:0 },
  stepCard: {
    flexDirection:'row', alignItems:'center',
    backgroundColor:'#FAFAFA', borderRadius:12,
    borderLeftWidth:4, padding:14, marginBottom:10,
  },
  stepIconBox: {
    width:38, height:38, borderRadius:10,
    justifyContent:'center', alignItems:'center',
  },
  stepText: { flex:1, marginLeft:12 },
  stepTitle: { fontSize:14, fontWeight:'700', color:'#222' },
  stepDesc: { fontSize:12, color:'#777', marginTop:2, lineHeight:16 },
  stepNum: {
    width:24, height:24, borderRadius:12,
    backgroundColor:'rgba(0,0,0,0.04)',
    justifyContent:'center', alignItems:'center',
  },
  stepNumText: { fontSize:13, fontWeight:'800' },
  recoBox: {
    backgroundColor:'#F1F8E9', borderRadius:12, padding:14, marginBottom:10,
    borderLeftWidth:4, borderLeftColor:'#2E7D32',
  },
  recoBoxHeader: { flexDirection:'row', alignItems:'center', marginBottom:6 },
  recoBoxTitle: { fontSize:13, fontWeight:'700', color:'#1B5E20' },
  recoBoxText: { fontSize:14, color:'#333', lineHeight:20 },
  tipsBox: {
    backgroundColor:'#FFF8E1', borderRadius:12, padding:14, marginBottom:12,
    borderLeftWidth:4, borderLeftColor:'#FFC107',
  },
  tipsTitle: { fontSize:13, fontWeight:'700', color:'#E65100', marginBottom:4 },
  tipsText: { fontSize:13, color:'#555', lineHeight:18 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

const AnalyseDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { analyse } = route.params;
  const [sharing, setSharing] = useState(false);
  const [ndviImageUri, setNdviImageUri] = useState<string | null>(null);
  const [rgbImageUri, setRgbImageUri] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{uri:string; title:string; subtitle:string} | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [modalScale, setModalScale] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [pinchScale, setPinchScale] = useState(1);
  const [recoModalVisible, setRecoModalVisible] = useState(false);
  const scaleRef = useRef(1);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        if (analyse.image_ndvi_path) {
          const ndviResponse = await api.get(`/analyses/${analyse.id}/image/ndvi`, {
            responseType: 'arraybuffer',
          });
          const ndviBase64 = `data:image/png;base64,${arrayBufferToBase64(ndviResponse.data)}`;
          setNdviImageUri(ndviBase64);
        }
        if (analyse.image_rgb_path) {
          try {
            const rgbResponse = await api.get(`/analyses/${analyse.id}/image/rgb`, {
              responseType: 'arraybuffer',
            });
            const rgbBase64 = `data:image/png;base64,${arrayBufferToBase64(rgbResponse.data)}`;
            setRgbImageUri(rgbBase64);
          } catch (err) {
            console.warn('RGB image non disponible', err);
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement des images:', error);
      }
    };
    fetchImages();
  }, [analyse.id, analyse.image_ndvi_path]);

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return base64Encode(binary);
  };

  const showToast = (message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
    } else {
      Alert.alert('Info', message);
    }
  };

  const getDownloadFilename = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + `_${analyse.id}_${Date.now()}.png`;

  const downloadImage = async (uri: string | null | undefined, title: string) => {
    if (!uri) {
      Alert.alert('Image non disponible', 'Patientez le temps que l\'image soit chargée.');
      return;
    }
    const mediaPermission = await MediaLibrary.requestPermissionsAsync();
    if (mediaPermission.status !== 'granted') {
      Alert.alert('Permission requise', 'Autorisez l\'accès à la galerie pour sauvegarder l\'image.');
      return;
    }
    try {
      setDownloading(true);
      const filename = getDownloadFilename(title);
      const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const fileUri = `${baseDir}${filename}`;
      if (uri.startsWith('data:image')) {
        const base64Data = uri.split(',')[1] ?? '';
        await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: 'base64' as any });
      } else {
        await FileSystem.downloadAsync(uri, fileUri);
      }
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      await MediaLibrary.createAlbumAsync('AgroVision', asset, false).catch(() => null);
      showToast(`Image enregistrée dans la galerie: ${filename}`);
      setPreviewImage(null);
      setModalScale(1);
      scaleRef.current = 1;
    } catch (e) {
      console.error('Erreur téléchargement image', e);
      Alert.alert('Échec du téléchargement', `Impossible de sauvegarder : ${e}`);
    } finally {
      setDownloading(false);
    }
  };

  // ─── CALCULS ──────────────────────────────────────────────────────────────
  const risk          = getRisk(analyse.risque);
  const ndviDates     = analyse.ndvi_dates  || [];
  const ndviValues    = analyse.ndvi_values || [];
  const hasRealNdvi   = ndviDates.length > 0 && ndviValues.length > 0;
  const tauxInfection = Number(analyse.taux_infection) || 0;
  const evolution     = Number(analyse.evolution_7j)   || 0;
  const surfaceHa     = Number(analyse.surface_infectee_ha) || 0;
  const surfaceTotalHa = tauxInfection > 0 ? surfaceHa / (tauxInfection / 100) : 0;

  // Score de santé : 100% - taux d'infection
  const healthScore = Math.max(0, Math.min(100, 100 - tauxInfection));

  const infectionLabel =
    tauxInfection < 10 ? 'Faible infection' :
    tauxInfection < 30 ? 'Infection modérée' :
    tauxInfection < 60 ? 'Infection importante' : 'Infection sévère';

  const evolutionLabel = evolution > 0
    ? `+${evolution}% — intervenez rapidement`
    : evolution < 0
    ? `${evolution}% — situation en amélioration`
    : 'Stable dans 7 jours';

  // Indicateurs simplifiés "grand public"
  const footballFields = haToFootballFields(surfaceHa);
  const surfaceFriendly = surfaceHa < 0.01
    ? 'Surface négligeable'
    : `${surfaceHa.toFixed(1)} ha touchés — ${footballFields >= 1 ? `soit environ ${Math.round(footballFields)} terrains de football` : 'moins d\'un terrain de football'}`;

  const infectionFriendly = tauxInfection < 5
    ? 'Le champ est quasi sain, aucune action urgente requise.'
    : tauxInfection < 15
    ? `Environ ${Math.round(tauxInfection)}% de la végétation montre des signes de stress. Une surveillance est recommandée.`
    : tauxInfection < 30
    ? `⚠️ ${Math.round(tauxInfection)}% du champ est touché. Une intervention est conseillée dans les prochains jours.`
    : `🔴 Alerte : ${Math.round(tauxInfection)}% de la parcelle est affectée. Agissez rapidement pour limiter la propagation.`;

  const evolutionFriendly = evolution > 10
    ? `📈 Sans intervention, la situation pourrait se dégrader de ${Math.round(evolution)}% en 7 jours.`
    : evolution > 0
    ? `📈 Légère hausse attendue (${Math.round(evolution)}%) — une surveillance suffit.`
    : evolution < 0
    ? `📉 Amélioration prévue (${Math.abs(Math.round(evolution))}%) — la tendance est bonne.`
    : '↔️ Situation stable dans les 7 prochains jours.';

  const isVegetationZone = analyse.zone_type
    ? ['vegetation_dense', 'vegetation_moderee'].includes(analyse.zone_type)
    : true;

  const handleShare = async () => {
    try {
      setSharing(true);
      await Share.share({
        title: 'Rapport AgroVision AI',
        message:
`AgroVision AI — Rapport du ${formatDate(analyse.date_analyse)}

RISQUE : ${analyse.risque}
SOURCE IMAGE : ${analyse.source === 'radar' ? 'Radar Sentinel-1' : 'Optique Sentinel-2'}

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
    } catch { /* ignore */ } finally {
      setSharing(false);
    }
  };

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO : Jauge de santé + carte de stress
          ═══════════════════════════════════════════════════════════════════ */}
      <View style={styles.heroSection}>

        {/* Jauge de santé */}
        <HealthGauge score={healthScore} />

        {/* ═══════════════════════════════════════════════════════════════
            TYPE DE SURFACE (juste après la jauge)
            ═══════════════════════════════════════════════════════════════ */}
        {analyse.zone_type && analyse.zone_type !== 'simulation' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="map" size={20} color="#333" />
              <Text style={styles.sectionTitle}>  Type de surface</Text>
            </View>
            <View style={[styles.zoneCard, { backgroundColor: (ZONE_CONFIG[analyse.zone_type] ?? ZONE_CONFIG['inconnu']).bg }]}>
              <MaterialCommunityIcons
                name={(ZONE_CONFIG[analyse.zone_type] ?? ZONE_CONFIG['inconnu']).icon as any}
                size={28}
                color={(ZONE_CONFIG[analyse.zone_type] ?? ZONE_CONFIG['inconnu']).color}
              />
              <View style={styles.zoneTextBlock}>
                <Text style={[styles.zoneLabel, { color: (ZONE_CONFIG[analyse.zone_type] ?? ZONE_CONFIG['inconnu']).color }]}>
                  {(ZONE_CONFIG[analyse.zone_type] ?? ZONE_CONFIG['inconnu']).label}
                </Text>
                {analyse.zone_confidence != null && (
                  <Text style={styles.zoneConfidence}>
                    Confiance : {(analyse.zone_confidence * 100).toFixed(0)}%
                  </Text>
                )}
              </View>
            </View>
            {analyse.zone_warning && (
              <View style={styles.zoneWarning}>
                <Ionicons name="alert-circle-outline" size={16} color="#E65100" />
                <Text style={styles.zoneWarningText}>  {analyse.zone_warning}</Text>
              </View>
            )}
          </View>
        )}

        {/* Carte de stress en héro (pleine largeur) */}
        <View style={styles.heroImageCard}>
          {ndviImageUri ? (
            <>
              <Image source={{ uri: ndviImageUri }} style={styles.heroImage} resizeMode="cover" />
              {/* Overlay stats */}
              <View style={styles.heroOverlay}>
                <Text style={styles.heroOverlayTitle}>Carte de stress</Text>
                <OverlayStat icon="leaf-outline" label="Santé" value={`${Math.round(healthScore)}%`} color="#81C784" />
                <OverlayStat icon="warning-outline" label="Stress" value={`${Math.round(tauxInfection)}%`} color="#EF9A9A" />
                <OverlayStat icon="ruler" lib="MaterialCommunityIcons" label="Surface touchée" value={`${surfaceHa.toFixed(1)} ha`} color="#fff" />
              </View>
              {/* Badge cliquer */}
              <TouchableOpacity
                style={styles.heroExpandBtn}
                onPress={() => ndviImageUri && setPreviewImage({ uri: ndviImageUri, title: 'Carte de stress', subtitle: 'Vue satellite avec zones de stress détectées en rouge' })}
              >
                <Ionicons name="expand-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.heroPlaceholder}>
              <ActivityIndicator size="large" color="#2E7D32" />
              <Text style={styles.heroPlaceholderText}>Chargement de l'image satellite...</Text>
            </View>
          )}
        </View>
      </View>

      {isVegetationZone && (
        <>
          {/* ═══════════════════════════════════════════════════════════════════
              BANDEAU RISQUE
              ═══════════════════════════════════════════════════════════════════ */}
          <View style={[styles.riskBanner, { backgroundColor: risk.bg, borderColor: risk.color }]}>
            <View style={[styles.riskIconBoxV2, { backgroundColor: risk.color + '22' }]}>
              <VIcon lib={risk.iconLib} name={risk.iconName} size={28} color={risk.color} />
            </View>
            <View style={styles.riskTextBlock}>
              <Text style={[styles.riskTitle, { color: risk.color }]}>{risk.label}</Text>
              <View style={styles.riskMetaRow}>
                <Text style={styles.riskDate}>{formatDate(analyse.date_analyse)}</Text>
                <View style={[styles.sourceBadge, { backgroundColor: analyse.source === 'radar' ? '#E3F2FD' : '#E8F5E9' }]}>
                  <Text style={[styles.sourceText, { color: analyse.source === 'radar' ? '#1565C0' : '#2E7D32' }]}>
                    {analyse.source === 'radar' ? 'Radar S1' : 'Optique S2'}
                  </Text>
                </View>
              </View>
              <Text style={styles.imageDate}>🛰️ {formatSatelliteDate(analyse.date_image_satellite)}</Text>
            </View>
          </View>

          {/* ═══════════════════════════════════════════════════════════════════
              RECOS EN CTA
              ═══════════════════════════════════════════════════════════════════ */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setRecoModalVisible(true)}
            style={[styles.recoCtaCard, { borderColor: risk.color }]}
          >
            <View style={styles.recoCtaRow}>
              <View style={[styles.recoCtaIconBox, { backgroundColor: risk.color + '18' }]}>
                <Ionicons name="bulb-outline" size={22} color={risk.color} />
              </View>
              <View style={styles.recoCtaText}>
                <Text style={styles.recoCtaTitle}>Voir les actions recommand&eacute;es</Text>
                <Text style={[styles.recoCtaPreview, { color: risk.color }]}>
                  {analyse.action_recommandee?.length > 80
                    ? analyse.action_recommandee.slice(0, 80) + '...'
                    : analyse.action_recommandee}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={risk.color} />
            </View>
          </TouchableOpacity>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          INDICATEURS SIMPLIFIÉS (végétation seulement)
          ═══════════════════════════════════════════════════════════════════ */}
      {isVegetationZone && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="information-outline" size={20} color="#333" />
            <Text style={styles.sectionTitle}>  En bref</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Ce qu'il faut retenir de l'analyse</Text>

          <SimpleIndicator
            icon="leaf-outline" iconLib="Ionicons"
            text={infectionFriendly}
            color={tauxInfection < 15 ? '#2E7D32' : tauxInfection < 30 ? '#E65100' : '#C62828'}
          />

          <SimpleIndicator
            icon="ruler-square" iconLib="MaterialCommunityIcons"
            text={surfaceFriendly}
            color={surfaceHa < 0.5 ? '#2E7D32' : surfaceHa < 2 ? '#E65100' : '#C62828'}
          />

          <SimpleIndicator
            icon="trending-up-outline" iconLib="Ionicons"
            text={evolutionFriendly}
            color={evolution > 10 ? '#C62828' : evolution > 0 ? '#E65100' : '#2E7D32'}
          />
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MÉTRIQUES DÉTAILLÉES (végétation seulement, repliables)
          ═══════════════════════════════════════════════════════════════════ */}
      {isVegetationZone && (
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
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SANTÉ VÉGÉTATION + PRÉVISION
          ═══════════════════════════════════════════════════════════════════ */}
      {isVegetationZone && (
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
              source={{ html: getTimelineChartHTML(ndviDates, ndviValues) }}
              javaScriptEnabled domStorageEnabled scrollEnabled={false}
            />
          </View>
        </View>
      )}

      {isVegetationZone && (
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
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MÉTÉO
          ═══════════════════════════════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════════════════════════════
          IMAGES SATELLITE
          ═══════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="satellite-variant" size={20} color="#333" />
          <Text style={styles.sectionTitle}>  Images satellite</Text>
        </View>
        <Text style={styles.sectionSubtitle}>Glissez pour voir les différentes vues</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagesRow}>
          <ImageCard
            title="Carte de stress"
            subtitle="Santé générale de la végétation"
            uri={ndviImageUri}
            onPress={() => ndviImageUri && setPreviewImage({ uri: ndviImageUri, title: 'Carte de stress', subtitle: 'Indice de santé des cultures' })}
            onDownload={() => downloadImage(ndviImageUri, 'Carte_de_stress')}
          />
          <ImageCard
            title="RGB Réel"
            subtitle="Image sans filtre"
            uri={rgbImageUri}
            onPress={() => rgbImageUri && setPreviewImage({ uri: rgbImageUri, title: 'RGB réel', subtitle: 'Vue réelle de la parcelle' })}
            onDownload={() => downloadImage(rgbImageUri, 'RGB')}
          />
        </ScrollView>
      </View>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL ZOOM
          ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={Boolean(previewImage)} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{previewImage?.title}</Text>
              <TouchableOpacity onPress={() => { setPreviewImage(null); setModalScale(1); setBaseScale(1); setPinchScale(1); }} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#222" />
              </TouchableOpacity>
            </View>
            <PinchGestureHandler
              onGestureEvent={({ nativeEvent }) => {
                const nextScale = Math.max(1, Math.min(3, baseScale * nativeEvent.scale));
                setPinchScale(nextScale);
                setModalScale(nextScale);
              }}
              onHandlerStateChange={({ nativeEvent }) => {
                if (nativeEvent.state === State.END || nativeEvent.state === State.CANCELLED) {
                  setBaseScale(modalScale);
                }
              }}
            >
              <Animated.View style={{ transform: [{ scale: modalScale }] }}>
                <Image source={{ uri: previewImage?.uri ?? '' }} style={styles.modalImg} resizeMode="contain" />
              </Animated.View>
            </PinchGestureHandler>
            <Text style={styles.modalSubtitle}>{previewImage?.subtitle}</Text>
            <TouchableOpacity
              style={styles.modalDownloadBtn}
              onPress={() => downloadImage(previewImage?.uri, previewImage?.title ?? 'image')}
              disabled={downloading || !previewImage?.uri}
            >
              {downloading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalDownloadText}>Télécharger l'image</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL RECOS
          ═══════════════════════════════════════════════════════════════════ */}
      <RecoModal
        visible={recoModalVisible}
        onClose={() => setRecoModalVisible(false)}
        risk={risk}
        tauxInfection={tauxInfection}
        actionRecommandee={analyse.action_recommandee}
      />

      {isVegetationZone && (
        <>
          {/* ═══════════════════════════════════════════════════════════════════
              ACTIONS
              ═══════════════════════════════════════════════════════════════════ */}
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
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6F4' },

  // ─── HERO ────────────────────────────────────────────────────────────
  heroSection: {
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 8,
  },
  heroImageCard: {
    marginTop: 12,
    height: 220, borderRadius: 20,
    backgroundColor: '#ddd', overflow: 'hidden',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.12,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    position: 'relative',
  },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  heroOverlayTitle: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 4, opacity: 0.85 },
  heroExpandBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  heroPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#f0f0f0', borderRadius: 20,
  },
  heroPlaceholderText: { fontSize: 13, color: '#888', marginTop: 10 },

  // ─── RISQUE ──────────────────────────────────────────────────────────
  riskBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    borderRadius: 14, borderWidth: 1.5,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.08,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  riskIconBoxV2: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  riskTextBlock: { flex: 1 },
  riskTitle:     { fontSize: 17, fontWeight: '800' },
  riskMetaRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8 },
  riskDate:      { fontSize: 11, color: '#888' },
  imageDate:     { fontSize: 11, color: '#555', marginTop: 3, fontWeight: '500' },
  sourceBadge:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  sourceText:    { fontSize: 10, fontWeight: '700' },

  // ─── RECO CTA ────────────────────────────────────────────────────────
  recoCtaCard: {
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.08,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  recoCtaRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  recoCtaIconBox: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  recoCtaText: { flex: 1 },
  recoCtaTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', marginBottom: 2 },
  recoCtaPreview: { fontSize: 12, lineHeight: 16 },

  // ─── SECTIONS ────────────────────────────────────────────────────────
  section:         { marginHorizontal: 16, marginBottom: 12 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sectionTitle:    { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  sectionSubtitle: { fontSize: 12, color: '#888', marginBottom: 10 },

  // ─── AVERTISSEMENT ───────────────────────────────────────────────────
  noticeBand: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: '#FFC107',
  },
  noticeText: { fontSize: 12, color: '#795548' },

  // ─── GRAPHIQUE ──────────────────────────────────────────────────────
  chartBox: {
    height: 240, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },

  // ─── ZONE ────────────────────────────────────────────────────────────
  zoneCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, padding: 14, marginBottom: 8,
  },
  zoneTextBlock: { marginLeft: 14, flex: 1 },
  zoneLabel: { fontSize: 15, fontWeight: '700' },
  zoneConfidence: { fontSize: 12, color: '#666', marginTop: 2 },
  zoneWarning: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF3E0', borderRadius: 8, padding: 10,
    borderLeftWidth: 3, borderLeftColor: '#FF9800',
  },
  zoneWarningText: { fontSize: 12, color: '#E65100', flex: 1 },

  // ─── PRÉVISION ──────────────────────────────────────────────────────
  predCard:      { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  predEvolution: { fontSize: 14, fontWeight: '600', marginBottom: 14, lineHeight: 20 },
  predRow:       { flexDirection: 'row', alignItems: 'center' },
  predItem:      { flex: 1, alignItems: 'center' },
  predLabel:     { fontSize: 12, color: '#777', textAlign: 'center', marginBottom: 4 },
  predValue:     { fontSize: 24, fontWeight: '800', color: '#333' },
  predDivider:   { width: 1, height: 40, backgroundColor: '#ddd' },

  // ─── MODAL ───────────────────────────────────────────────────────────
  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  modalCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle:  { fontSize: 18, fontWeight: '800', color: '#222' },
  modalImg:    { width: '100%', height: 280, borderRadius: 12, backgroundColor: '#000' },
  modalSubtitle: { marginTop: 8, color: '#555', fontSize: 13, marginBottom: 12 },
  modalDownloadBtn: { backgroundColor: '#1E88E5', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  modalDownloadText: { color: '#fff', fontWeight: '700' },
  closeBtn: { padding: 6 },

  // ─── IMAGES ──────────────────────────────────────────────────────────
  imagesRow: { paddingRight: 16 },

  // ─── ACTIONS ─────────────────────────────────────────────────────────
  actionsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 4, gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.1,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  shareBtn:    { backgroundColor: '#1565C0' },
  downloadBtn: { backgroundColor: '#2E7D32' },
  actionLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default AnalyseDetailScreen;
