"""
Test du modèle complet avec météo et propagation
"""

import sys
import yaml
import numpy as np

sys.path.append('.')

from modules.weather_api import WeatherAPI
from modules.spread_model import EpidemiologicalModel
from modules.satellite_simulator import SatelliteSimulator

print("="*60)
print("🌱 TEST COMPLET AGROVISION AI 2.0")
print("="*60)

# 1. Charger config
with open('config.yaml', 'r') as f:
    config = yaml.safe_load(f)

# 2. Simuler l'analyse satellite
print("\n🛰️  ANALYSE SATELLITE")
print("-"*40)

sat = SatelliteSimulator(config)
ndvi = sat.generate_ndvi_image(avec_maladies=True)
resultats_sat = sat.calculate_infected_area(ndvi, seuil=0.3)
sat.plot_ndvi(ndvi, resultats_sat['masque'], "Analyse satellite")

surface_malade_ha = resultats_sat['surface_malade_ha']
print(f"\n📊 Résultats satellite:")
print(f"   Surface malade: {surface_malade_ha:.2f} ha")
print(f"   Pourcentage: {resultats_sat['pourcentage_malade']:.1f}%")

# 3. Récupérer la météo
print("\n🌤️  DONNÉES MÉTÉO")
print("-"*40)

weather = WeatherAPI(config['meteo']['api_key'])
coords = config['parcelle']['coordinates']
lat = (coords[1] + coords[3]) / 2
lon = (coords[0] + coords[2]) / 2

previsions = weather.get_forecast(lat, lon, 7)
weather.afficher_previsions(previsions)

# Moyenne des conditions
temp_moy = np.mean([p['temperature'] for p in previsions])
hum_moy = np.mean([p['humidite'] for p in previsions])
vent_moy = np.mean([p['vent'] for p in previsions])

weather_data = {
    'temperature': temp_moy,
    'humidite': hum_moy,
    'vent': vent_moy
}

# 4. Prédire la propagation
print("\n📈 PRÉDICTION DE PROPAGATION")
print("-"*40)

# Estimation du nombre de plants
plants_par_ha = 10000  # densité typique
population_totale = int(config['parcelle']['surface_ha'] * plants_par_ha)
infectes_initiaux = int(surface_malade_ha * plants_par_ha)

print(f"🌱 Population totale: {population_totale:,} plants")
print(f"🦠 Infectés initiaux: {infectes_initiaux:,} plants")

modele = EpidemiologicalModel()
modele.adjust_for_weather(weather_data)

df = modele.predict_spread(population_totale, infectes_initiaux, jours=60)
risque = modele.calculate_risk(df, 7)

print(f"\n⚠️ RISQUE: {risque['couleur']} {risque['niveau']}")
print(f"   Augmentation à 7 jours: +{risque['augmentation']*100:.0f}%")
print(f"   Infectés dans 7 jours: {risque['infectes_futur']:,} plants")
print(f"   Action recommandée: {risque['action']}")

modele.plot_prediction(df)

print("\n" + "="*60)
print("✅ TEST COMPLET TERMINÉ")
print("="*60)