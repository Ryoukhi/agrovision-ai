"""
Test du module météo
"""

import sys
import yaml
sys.path.append('.')

from modules.weather_api import WeatherAPI

print("="*60)
print("🌤️  TEST DU MODULE MÉTÉO")
print("="*60)

# 1. Charger la configuration
print("\n📂 Chargement de la config...")
with open('config.yaml', 'r') as f:
    config = yaml.safe_load(f)

api_key = config['meteo']['api_key']
print(f"✅ Clé API chargée: {api_key[:5]}...{api_key[-5:]}")

# 2. Créer le client météo
print("\n🌍 Création du client météo...")
weather = WeatherAPI(api_key)

# 3. Coordonnées du champ
coords = config['parcelle']['coordinates']
lat = (coords[1] + coords[3]) / 2  # latitude moyenne
lon = (coords[0] + coords[2]) / 2  # longitude moyenne
print(f"📍 Position: lat={lat:.2f}, lon={lon:.2f}")

# 4. Récupérer les prévisions
print("\n📡 Appel API...")
previsions = weather.get_forecast(lat, lon, 7)

# 5. Afficher
weather.afficher_previsions(previsions)

print("\n" + "="*60)
print("✅ Test terminé")
print("="*60)