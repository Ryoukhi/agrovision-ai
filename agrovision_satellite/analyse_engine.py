"""
Moteur d'analyse satellite - Interface pour l'API
"""
import sys
import os
import json
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np

# Ajouter le chemin pour importer les modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.satellite_real import RealSatellite
from modules.weather_api import WeatherAPI
from modules.spread_model import EpidemiologicalModel

# ✅ CONVERTISSEUR JSON POUR TYPES NUMPY
class NumpyEncoder(json.JSONEncoder):
    """JSON Encoder spécial pour les types NumPy"""
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64, np.int32)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float64, np.float32)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

class AnalyseEngine:
    """Moteur d'analyse complet pour l'API"""
    
    def __init__(self, config_path=None):
        """Initialise le moteur avec la configuration"""
        if config_path is None:
            # Chemin par défaut
            config_path = Path(__file__).parent / 'config.yaml'
        
        import yaml
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        # Initialiser les modules
        self.satellite = RealSatellite(self.config)
        self.weather = WeatherAPI(self.config['meteo']['api_key'])
        self.model = EpidemiologicalModel()
        
        # Dossier de sortie
        self.output_dir = Path(self.config['outputs']['save_path'])
        # Si chemin relatif, le rendre absolu parrapport au répertoire du projet
        if not self.output_dir.is_absolute():
            self.output_dir = Path(__file__).parent.parent / self.output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        print(f"📁 Output directory: {self.output_dir}")
    
    def run_analyse(self, parcelle_id, nom, coords, surface_ha, plants_per_ha=10000):
        """
        Exécute une analyse complète pour une parcelle
        
        Args:
            parcelle_id: ID de la parcelle dans la base
            nom: Nom de la parcelle
            coords: [long_min, lat_min, long_max, lat_max]
            surface_ha: Surface en hectares
            plants_per_ha: Densité de plantation
        
        Returns:
            dict: Résultats de l'analyse
        """
        print(f"\n{'='*60}")
        print(f"🚀 ANALYSE POUR PARCELLE: {nom} (ID: {parcelle_id})")
        print(f"{'='*60}")
        
        # 1. ANALYSE SATELLITE
        print("\n🛰️ ÉTAPE 1 - ANALYSE SATELLITE")
        
        # Période d'analyse (60 derniers jours)
        date_fin = datetime.now().strftime('%Y-%m-%d')
        date_debut = (datetime.now() - timedelta(days=60)).strftime('%Y-%m-%d')
        
        try:
            indices_dict, source, date_image, roi_eroded, rgb_array = self.satellite.get_multi_index_image(
                coords,
                date_debut,
                date_fin,
                max_cloud=20
            )

            # Détection des anomalies par Isolation Forest (nouvelle méthode)
            results = self.satellite.detect_stress_isolation_forest(indices_dict)

            # Classification des zones (eau, urbain, désert, végétation)
            zone_results = self.satellite.classify_zones(indices_dict)
            zone_type = zone_results['zone_type']
            zone_warning = zone_results['warning']
            zone_confidence = zone_results['confidence']

            ratio_infection = results['pourcentage_stress'] / 100.0
            surface_infectee_ha = surface_ha * ratio_infection
            plants_infectes = int(surface_infectee_ha * plants_per_ha)

            # Sauvegarder la carte de stress (indices + masque)
            image_ndvi_path = self.output_dir / f"analyse_{parcelle_id}_ndvi.png"
            self.satellite.plot_stress_map(
                indices_dict,
                results['masque_stress'],
                save_path=image_ndvi_path
            )

            # Sauvegarder l'image RGB true-color si disponible
            image_rgb_path = None
            if rgb_array is not None:
                image_rgb_path = self.output_dir / f"analyse_{parcelle_id}_rgb.png"
                import matplotlib.pyplot as plt
                plt.imsave(str(image_rgb_path), rgb_array)
                print(f"✅ Image RGB sauvegardée : {image_rgb_path}")

            print(f"✅ Analyse satellite terminée (source: {source})")
            print(f"   Date image: {date_image}")
            print(f"   Zone dominante: {zone_type}")
            print(f"   Taux infection: {ratio_infection*100:.1f}%")
            print(f"   Surface infectée: {surface_infectee_ha:.2f} ha")
            print(f"   Plants infectés: {plants_infectes}")

            # Pas d'image multi pour l'instant
            image_multi_path = None

        except Exception as e:
            print(f"❌ Erreur satellite: {e}")
            # Fallback avec simulateur
            from modules.satellite_simulator import SatelliteSimulator
            sim = SatelliteSimulator(self.config)
            ndvi = sim.generate_ndvi_image(avec_maladies=True)
            results = sim.calculate_infected_area(ndvi, seuil=0.35)
            source = 'simulation'

            ratio_infection = results['pourcentage_malade'] / 100.0
            surface_infectee_ha = surface_ha * ratio_infection
            plants_infectes = int(surface_infectee_ha * plants_per_ha)
            date_image = "simulation"

            # Classification non disponible en simulation
            zone_type = 'simulation'
            zone_warning = None
            zone_confidence = 0.0

            # Sauvegarder l'image du simulateur
            image_ndvi_path = self.output_dir / f"analyse_{parcelle_id}_ndvi.png"
            image_multi_path = None
            image_rgb_path = None

            sim.plot_ndvi(
                ndvi,
                results['masque'],
                f"Parcelle {nom} - {date_image}",
                save_path=image_ndvi_path
            )

            print(f"✅ Analyse satellite simulée (fallback)")
            print(f"   Taux infection: {ratio_infection*100:.1f}%")
            print(f"   Image sauvegardée: {image_ndvi_path}")
        
        # 2. ANALYSE MÉTÉO
        print("\n🌤️ ÉTAPE 2 - ANALYSE MÉTÉO")
        
        lat = (coords[1] + coords[3]) / 2
        lon = (coords[0] + coords[2]) / 2
        
        forecast = self.weather.get_forecast(lat, lon, 7)
        
        if forecast:
            weather_data = {
                'temperature': round(sum(f['temperature'] for f in forecast) / len(forecast), 1),
                'humidite': round(sum(f['humidite'] for f in forecast) / len(forecast)),
                'vent': round(sum(f['vent'] for f in forecast) / len(forecast), 1)
            }
            print(f"✅ Météo récupérée")
            print(f"   Temp: {weather_data['temperature']}°C")
            print(f"   Humidité: {weather_data['humidite']}%")
            print(f"   Vent: {weather_data['vent']} m/s")
        else:
            weather_data = {'temperature': 25, 'humidite': 70, 'vent': 2}
            print(f"⚠️ Météo simulée")
        
        # 3. PRÉDICTION DE PROPAGATION
        print("\n📈 ÉTAPE 3 - PRÉDICTION")
        
        total_plants = int(surface_ha * plants_per_ha)
        
        self.model.adjust_for_weather(weather_data)
        df = self.model.predict_spread(total_plants, plants_infectes, jours=60)
        risk = self.model.calculate_risk(df, 7)
        
        print(f"✅ Prédiction terminée")
        print(f"   Risque: {risk['couleur']} {risk['niveau']}")
        print(f"   Évolution 7j: {risk['augmentation']*100:+.1f}%")
        print(f"   Plants dans 7j: {risk['infectes_futur']}")

        # ✅ Adapter les messages selon le type de zone
        zone_type_local = zone_type
        risk_level = risk['niveau']
        action_msg = risk['action']

        # Dictionnaire des messages contextualisés par zone
        ZONE_MESSAGES = {
            'eau': {
                'risque': 'INFO',
                'action': '🌊 Parcelle située en zone aquatique (rivière/lac). Aucune culture agricole détectée. Vérifiez l\'emplacement de la parcelle.'
            },
            'urbain_sol_nu': {
                'risque': 'INFO',
                'action': '🏗️ Zone urbaine ou sol nu détecté. La parcelle ne semble pas être une zone agricole cultivée.'
            },
            'desert': {
                'risque': 'MODÉRÉ',
                'action': '🏜️ Sol très aride détecté. Irrigation et amendement organique nécessaires avant toute plantation.'
            },
            'zone_humide': {
                'risque': 'ÉLEVÉ',
                'action': '💧 Zone humide détectée. Risque de pourrissement des racines. Drainage recommandé avant culture.'
            },
        }

        if zone_type_local in ZONE_MESSAGES:
            risk_level = ZONE_MESSAGES[zone_type_local]['risque']
            action_msg = ZONE_MESSAGES[zone_type_local]['action']
            print(f"   ℹ️ Message adapté à la zone « {zone_type_local} »")

        # ✅ CONVERSION DES TYPES NUMPY EN TYPES PYTHON NATIFS
        result = {
            'date_analyse': datetime.now().isoformat(),
            'date_image_satellite': date_image,
            'taux_infection': float(round(ratio_infection * 100, 1)),
            'surface_infectee_ha': float(round(surface_infectee_ha, 2)),
            'plants_infectes': int(plants_infectes),
            'temperature_moyenne': float(weather_data['temperature']),
            'humidite_moyenne': int(weather_data['humidite']),
            'vent_moyen': float(weather_data['vent']),
            'risque': risk_level,
            'evolution_7j': float(round(risk['augmentation'] * 100, 1)),
            'plants_infectes_7j': int(risk['infectes_futur']),
            'action_recommandee': action_msg,
            'source': source,
            'zone_type': zone_type_local,
            'zone_warning': zone_warning,
            'zone_confidence': zone_confidence,
            'image_ndvi_path': str(image_ndvi_path) if image_ndvi_path else None,
            'image_multi_path': str(image_multi_path) if image_multi_path else None,
            'image_rgb_path': str(image_rgb_path) if image_rgb_path else None,
        }
        
        # Sauvegarder le rapport JSON avec le convertisseur personnalisé
        rapport_path = self.output_dir / f"rapport_{parcelle_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(rapport_path, 'w') as f:
            json.dump(result, f, indent=2, cls=NumpyEncoder)
        
        print(f"\n✅ ANALYSE TERMINÉE")
        print(f"   Rapport: {rapport_path}")
        
        return result

# Pour tester
if __name__ == "__main__":
    engine = AnalyseEngine()
    result = engine.run_analyse(
        parcelle_id=1,
        nom="Parcelle test",
        coords=[12.55, 4.55, 12.58, 4.58],
        surface_ha=0.5,
        plants_per_ha=10000
    )
    print("\n📊 RÉSULTAT:")
    print(json.dumps(result, indent=2, ensure_ascii=False, cls=NumpyEncoder))