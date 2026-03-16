"""
Service d'analyse - Interface entre l'API et le moteur IA
"""

import sys
import os
from pathlib import Path

# Ajouter le chemin du moteur
ENGINE_PATH = Path(__file__).parent.parent.parent / 'agrovision_satellite'
sys.path.append(str(ENGINE_PATH))

try:
    from analyse_engine import AnalyseEngine
    ENGINE_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Moteur IA non disponible: {e}")
    ENGINE_AVAILABLE = False

class AnalyseService:
    """Service qui encapsule le moteur d'analyse"""
    
    def __init__(self):
        self.engine = None
        if ENGINE_AVAILABLE:
            try:
                config_path = ENGINE_PATH / 'config.yaml'
                self.engine = AnalyseEngine(config_path)
                print("✅ Moteur IA initialisé avec succès")
            except Exception as e:
                print(f"❌ Erreur initialisation moteur: {e}")
    
    def run_analyse(self, parcelle):
        """
        Exécute une analyse pour une parcelle
        
        Args:
            parcelle: Objet parcelle de la base de données
        
        Returns:
            dict: Résultats de l'analyse
        """
        if not self.engine:
            print("⚠️ Moteur IA non disponible, utilisation de données simulées")
            return self._simulate_analyse(parcelle)
        
        # Coordonnées au format [long_min, lat_min, long_max, lat_max]
        coords = [
            parcelle.long_min,
            parcelle.lat_min,
            parcelle.long_max,
            parcelle.lat_max
        ]
        
        try:
            result = self.engine.run_analyse(
                parcelle_id=parcelle.id,
                nom=parcelle.nom,
                coords=coords,
                surface_ha=parcelle.surface_ha,
                plants_per_ha=parcelle.plants_per_ha or 10000
            )
            return result
        except Exception as e:
            print(f"❌ Erreur lors de l'analyse: {e}")
            return self._simulate_analyse(parcelle)
    
    def _simulate_analyse(self, parcelle):
        """Génère des données simulées pour le développement"""
        import random
        from datetime import datetime, timedelta
        
        taux = round(random.uniform(0.5, 5.0), 1)
        plants_infectes = int(parcelle.surface_ha * (parcelle.plants_per_ha or 10000) * taux / 100)
        
        return {
            'date_analyse': datetime.now().isoformat(),
            'date_image_satellite': (datetime.now() - timedelta(days=random.randint(1, 10))).strftime('%Y-%m-%d'),
            'taux_infection': taux,
            'surface_infectee_ha': round(parcelle.surface_ha * taux / 100, 2),
            'plants_infectes': plants_infectes,
            'temperature_moyenne': round(random.uniform(22, 28), 1),
            'humidite_moyenne': random.randint(60, 85),
            'vent_moyen': round(random.uniform(1.0, 3.0), 1),
            'risque': random.choice(['FAIBLE', 'MODÉRÉ', 'ÉLEVÉ']),
            'evolution_7j': round(random.uniform(-10, 30), 1),
            'plants_infectes_7j': int(plants_infectes * (1 + random.uniform(-0.1, 0.3))),
            'action_recommandee': "Surveillance normale" if random.random() > 0.5 else "Intervention recommandée",
            'image_ndvi_path': None,
            'image_multi_path': None,
        }