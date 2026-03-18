#!/usr/bin/env python3
"""
AgroVision AI 2.0 - Pipeline complet d'analyse et prédiction
Auteur: Stephane Deutou
Date: Mars 2026

Ce programme orchestre l'analyse satellite, la météo et la prédiction
pour fournir un rapport complet sur l'état sanitaire d'une parcelle.
"""

import os
import sys
import yaml
import json
import logging
import numpy as np
import pandas as pd 
import matplotlib.pyplot as plt
from datetime import datetime, timedelta  # ← À AJOUTER
from pathlib import Path

sys.path.append('.')

# Remplacer l'import du simulateur par le réel
# from modules.satellite_simulator import SatelliteSimulator   ← À SUPPRIMER
from modules.satellite_real import RealSatellite
from modules.weather_api import WeatherAPI
from modules.spread_model import EpidemiologicalModel


# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data/logs/agrovision.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class AgroVisionPipeline:
    """
    Pipeline principal d'analyse et prédiction
    """
    
    def __init__(self, config_path='config.yaml'):
        """
        Initialise le pipeline avec la configuration
        
        Args:
            config_path: chemin vers le fichier de configuration
        """
        logger.info("="*60)
        logger.info("🌱 AGROVISION AI 2.0 - PIPELINE DE PRÉDICTION")
        logger.info("="*60)
        
        # Charger la configuration
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        logger.info("✅ Configuration chargée")
        
        # Créer les dossiers de sortie
        self.output_dir = Path(self.config['outputs']['save_path'])
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialiser les modules
        logger.info("\n🛠️  Initialisation des modules...")

        self.satellite = RealSatellite(self.config)
        self.weather = WeatherAPI(self.config['meteo']['api_key'])
        self.model = EpidemiologicalModel()
        
        # Coordonnées de la parcelle
        coords = self.config['parcelle']['coordinates']
        self.lat = (coords[1] + coords[3]) / 2  # latitude moyenne
        self.lon = (coords[0] + coords[2]) / 2  # longitude moyenne
        
        # Paramètres
        self.surface_ha = self.config['parcelle']['surface_ha']
        self.plants_per_ha = 10000  # densité typique
        self.total_plants = int(self.surface_ha * self.plants_per_ha)
        
        logger.info(f"📍 Parcelle: {self.config['parcelle']['nom']}")
        logger.info(f"   Surface: {self.surface_ha} ha")
        logger.info(f"   Population estimée: {self.total_plants:,} plants")
        logger.info(f"   Coordonnées: {self.lat:.2f}, {self.lon:.2f}")
    
    def run_satellite_analysis(self):
        """
        Étape 1: Analyse satellite réelle
        """
        logger.info("\n" + "="*60)
        logger.info("🛰️  ÉTAPE 1 - ANALYSE SATELLITE RÉELLE")
        logger.info("="*60)
        
        # Récupérer les coordonnées de la parcelle
        coords = self.config['parcelle']['coordinates']
        logger.info(f"📍 Parcelle: {coords}")
        
        # Récupérer la période d'analyse de la config
        periode_jours = self.config.get('analyse', {}).get('periode_jours', 60)
        date_fin_config = self.config.get('analyse', {}).get('date_fin', 'auto')
        
        # Définir la date de fin
        if date_fin_config == 'auto':
            date_fin = datetime.now().strftime('%Y-%m-%d')
        else:
            date_fin = date_fin_config
        
        # Calculer la date de début
        date_debut = (datetime.strptime(date_fin, '%Y-%m-%d') - timedelta(days=periode_jours)).strftime('%Y-%m-%d')
        
        logger.info(f"📅 Période: {date_debut} à {date_fin} ({periode_jours} jours)")
        
        try:
            # Récupérer l'image NDVI réelle avec tous les indices
            ndvi, all_indices, date_image, image = self.satellite.get_ndvi_image(
                coords,
                date_debut,
                date_fin,
                max_cloud=20
            )
            
            logger.info(f"✅ Image du {date_image} récupérée")
            logger.info(f"   Dimensions: {ndvi.shape}")
            logger.info(f"   NDVI min: {ndvi.min():.2f}, max: {ndvi.max():.2f}, moy: {ndvi.mean():.2f}")
            
            # Stocker tous les indices pour usage ultérieur
            self.ndvi = ndvi
            self.all_indices = all_indices
            self.image_date = date_image
            
            # Détecter les zones malades (seuil depuis config)
            seuil = self.config.get('detection', {}).get('ndvi_seuil', 0.35)
            results = self.satellite.calculate_infected_area(ndvi, seuil=seuil)
            
            # Sauvegarder la visualisation NDVI
            save_path = self.output_dir / f"satellite_{date_image}.png"
            self.satellite.plot_ndvi(
                ndvi,
                results['masque'],
                f"Analyse Sentinel-2 du {date_image}",
                save_path=save_path
            )
            
            # Sauvegarder la visualisation multi-indices (optionnel)
            multi_save_path = self.output_dir / f"multi_indices_{date_image}.png"
            self.satellite.plot_all_indices(
                all_indices,
                results['masque'],
                save_path=multi_save_path
            )
            
            # Récupérer les résultats
            self.infected_pixels = results['pixels_malades']
            self.total_pixels = results['pixels_total']
            self.infected_percent = results['pourcentage_pixels']
            self.infected_area = results['surface_infectee_ha']
            self.total_area = results['surface_totale_ha']
            
            logger.info(f"\n📊 RÉSULTATS ANALYSE:")
            logger.info(f"   Date image: {date_image}")
            logger.info(f"   Pixels analysés: {self.total_pixels}")
            logger.info(f"   Pixels malades: {self.infected_pixels}")
            logger.info(f"   Taux d'infection: {self.infected_percent:.1f}%")
            logger.info(f"   Surface parcelle: {self.total_area:.2f} ha")
            logger.info(f"   Surface infectée: {self.infected_area:.3f} ha")
            
            # Calculer les plants infectés (densité paramétrable)
            plants_per_ha = self.config.get('parcelle', {}).get('plants_per_ha', 10000)
            self.infected_plants = int(self.infected_area * plants_per_ha)
            
            logger.info(f"   Plants infectés: {self.infected_plants:,}")
            
            return {
                'ndvi': ndvi,
                'all_indices': all_indices,
                'infected_pixels': self.infected_pixels,
                'infected_percent': self.infected_percent,
                'infected_area': self.infected_area,
                'infected_plants': self.infected_plants,
                'date_image': date_image
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur analyse satellite: {e}")
            logger.warning("⚠️ Utilisation du simulateur en secours...")
            
            # Fallback vers le simulateur en cas d'erreur
            from modules.satellite_simulator import SatelliteSimulator
            sim = SatelliteSimulator(self.config)
            ndvi = sim.generate_ndvi_image(avec_maladies=True)
            
            # Simuler des résultats
            results = sim.calculate_infected_area(ndvi, seuil=0.35)
            
            self.image_date = "simulation"
            self.infected_pixels = results['pixels_malades']
            self.total_pixels = results['pixels_total']
            self.infected_percent = results['pourcentage_malade']
            self.infected_area = self.config['parcelle']['surface_ha'] * (self.infected_percent / 100)
            self.total_area = self.config['parcelle']['surface_ha']
            
            plants_per_ha = self.config.get('parcelle', {}).get('plants_per_ha', 10000)
            self.infected_plants = int(self.infected_area * plants_per_ha)
            
            return {
                'ndvi': ndvi,
                'infected_percent': self.infected_percent,
                'infected_area': self.infected_area,
                'infected_plants': self.infected_plants,
                'date_image': self.image_date
            }
    
    def run_weather_analysis(self):
        """
        Étape 2: Analyse météo
        """
        logger.info("\n" + "="*60)
        logger.info("🌤️  ÉTAPE 2 - ANALYSE MÉTÉO")
        logger.info("="*60)
        
        # Récupérer les prévisions
        jours = self.config['meteo']['forecast_days']
        forecast = self.weather.get_forecast(self.lat, self.lon, jours)
        
        # Afficher les prévisions
        self.weather.afficher_previsions(forecast)
        
        # Calculer les moyennes
        self.weather_data = {
            'temperature': np.mean([f['temperature'] for f in forecast]),
            'humidite': np.mean([f['humidite'] for f in forecast]),
            'vent': np.mean([f['vent'] for f in forecast])
        }
        
        logger.info(f"\n📊 CONDITIONS MOYENNES:")
        logger.info(f"   Température: {self.weather_data['temperature']:.1f}°C")
        logger.info(f"   Humidité: {self.weather_data['humidite']:.0f}%")
        logger.info(f"   Vent: {self.weather_data['vent']:.1f} m/s")
        
        return forecast
    
    def run_propagation_prediction(self):
        """
        Étape 3: Prédiction de propagation
        """
        logger.info("\n" + "="*60)
        logger.info("📈 ÉTAPE 3 - PRÉDICTION DE PROPAGATION")
        logger.info("="*60)
        
        # Ajuster le modèle à la météo
        self.model.adjust_for_weather(self.weather_data)
        
        # Prédire sur 60 jours
        self.df_prediction = self.model.predict_spread(
            self.total_plants,
            self.infected_plants,
            jours=60
        )
        
        # Calculer le risque à 7 jours
        self.risk = self.model.calculate_risk(self.df_prediction, 7)
        
        # Afficher le risque
        logger.info(f"\n⚠️  NIVEAU DE RISQUE: {self.risk['couleur']} {self.risk['niveau']}")
        logger.info(f"   Augmentation à 7 jours: {self.risk['augmentation']*100:+.0f}%")
        logger.info(f"   Infectés maintenant: {self.risk['infectes_maintenant']:,}")
        logger.info(f"   Infectés dans 7 jours: {self.risk['infectes_futur']:,}")
        logger.info(f"   Action: {self.risk['action']}")
        
        # Sauvegarder le graphique
        self.model.plot_prediction(self.df_prediction)
        
        return self.risk
    
    def generate_report(self):
        """
        Étape 4: Génération du rapport final
        """
        logger.info("\n" + "="*60)
        logger.info("📄 ÉTAPE 4 - GÉNÉRATION DU RAPPORT")
        logger.info("="*60)
        
        # Créer le rapport
        report = {
            'metadata': {
                'date_analyse': datetime.now().isoformat(),
                'date_image_satellite': self.image_date,
                'parcelle': self.config['parcelle']['nom'],
                'surface_ha': self.surface_ha,
                'plants_total': self.total_plants,
                'coordonnees': {
                    'lat': self.lat,
                    'lon': self.lon
                }
            },
            'satellite': {
                'taux_infection_pourcent': round(self.risk['infectes_maintenant'] / self.total_plants * 100, 1),
                'surface_infectee_ha': round(self.infected_area, 2),
                'plants_infectes': self.infected_plants
            },
            'meteo': {
                'temperature_moyenne': round(self.weather_data['temperature'], 1),
                'humidite_moyenne': round(self.weather_data['humidite']),
                'vent_moyen': round(self.weather_data['vent'], 1),
                'conditions': "Défavorables" if self.risk['augmentation'] < 0 else "Favorables"
            },
            'prediction': {
                'risque': self.risk['niveau'],
                'couleur_risque': self.risk['couleur'],
                'evolution_7j_pourcent': round(self.risk['augmentation'] * 100, 1),
                'plants_infectes_7j': int(self.risk['infectes_futur']), 
                'action_recommandee': self.risk['action']
            },
            'recommandations': {
                'urgence': self.risk['action'],
                'prochaine_analyse': (datetime.now().replace(hour=0, minute=0, second=0) + 
                                     pd.Timedelta(days=7)).strftime('%Y-%m-%d'),
                'notes': "Surveiller l'évolution des conditions météo"
            }
        }
        
        # Sauvegarder le rapport JSON
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_path = self.output_dir / f"rapport_{timestamp}.json"
        
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        logger.info(f"✅ Rapport sauvegardé: {report_path}")
        
        return report
    
    def print_summary(self, report):
        """
        Affiche un résumé coloré dans le terminal
        """
        print("\n" + "="*70)
        print("🌱 AGROVISION AI 2.0 - RAPPORT D'ANALYSE")
        print("="*70)
        
        print(f"\n📅 Date: {report['metadata']['date_analyse'][:10]}")
        print(f"📍 Parcelle: {report['metadata']['parcelle']}")
        print(f"   Surface: {report['metadata']['surface_ha']} ha")
        print(f"   Plants: {report['metadata']['plants_total']:,}")
        
        print(f"\n🛰️  ANALYSE SATELLITE:")
        print(f"   Taux d'infection: {report['satellite']['taux_infection_pourcent']}%")
        print(f"   Surface infectée: {report['satellite']['surface_infectee_ha']} ha")
        print(f"   Plants infectés: {report['satellite']['plants_infectes']:,}")
        
        print(f"\n🌤️  CONDITIONS MÉTÉO:")
        print(f"   Température: {report['meteo']['temperature_moyenne']}°C")
        print(f"   Humidité: {report['meteo']['humidite_moyenne']}%")
        print(f"   Vent: {report['meteo']['vent_moyen']} m/s")
        print(f"   Impact: {report['meteo']['conditions']}")
        
        print(f"\n⚠️  PRÉDICTION:")
        print(f"   Risque: {report['prediction']['couleur_risque']} {report['prediction']['risque']}")
        print(f"   Évolution 7j: {report['prediction']['evolution_7j_pourcent']:+.1f}%")
        print(f"   Plants infectés dans 7j: {report['prediction']['plants_infectes_7j']:,}")
        
        print(f"\n💡 RECOMMANDATION:")
        print(f"   {report['recommandations']['urgence']}")
        print(f"   Prochaine analyse: {report['recommandations']['prochaine_analyse']}")
        
        print("\n" + "="*70)
        print("✅ Analyse terminée - Rapport sauvegardé")
        print("="*70)
    
    def run(self):
        """
        Exécute le pipeline complet
        """
        try:
            # Étape 1: Analyse satellite
            sat_results = self.run_satellite_analysis()
            
            # Étape 2: Analyse météo
            forecast = self.run_weather_analysis()
            
            # Étape 3: Prédiction propagation
            risk = self.run_propagation_prediction()
            
            # Étape 4: Génération rapport
            report = self.generate_report()
            
            # Afficher le résumé
            self.print_summary(report)
            
            logger.info("\n" + "="*60)
            logger.info("✅ PIPELINE TERMINÉ AVEC SUCCÈS")
            logger.info("="*60)
            
            return report
            
        except Exception as e:
            logger.error(f"❌ Erreur dans le pipeline: {e}")
            import traceback
            traceback.print_exc()
            return None

def main():
    """
    Point d'entrée principal
    """
    pipeline = AgroVisionPipeline()
    report = pipeline.run()
    
    if report:
        print("\n📁 Fichiers générés:")
        print(f"   - Rapport JSON: data/outputs/rapport_*.json")
        print(f"   - Graphiques: data/outputs/*.png")
        print(f"   - Logs: data/logs/agrovision.log")

if __name__ == "__main__":
    main()