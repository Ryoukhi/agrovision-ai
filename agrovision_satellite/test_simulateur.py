"""
Script pour tester le simulateur satellite
"""

import sys
import yaml
from pathlib import Path

# Ajouter le dossier modules au chemin Python
sys.path.append('.')

# Importer notre module
from modules.satellite_simulator import SatelliteSimulator

print("="*60)
print("🌱 TEST DU SIMULATEUR SATELLITE AGROVISION")
print("="*60)

# 1. Charger la configuration
print("\n📂 Chargement de la configuration...")
with open('config.yaml', 'r') as f:
    config = yaml.safe_load(f)
print("✅ Configuration chargée")

# 2. Créer le simulateur
print("\n🛰️ Création du simulateur...")
sim = SatelliteSimulator(config)

# 3. Tester différentes configurations
print("\n" + "-"*40)
print("TEST 1: Image sans maladies")
print("-"*40)

ndvi_sain = sim.generate_ndvi_image(avec_maladies=False)
resultats_sain = sim.calculate_infected_area(ndvi_sain, seuil=0.3)
sim.plot_ndvi(ndvi_sain, resultats_sain['masque'], "Champ sain")

print("\n" + "-"*40)
print("TEST 2: Image avec maladies")
print("-"*40)

ndvi_malade = sim.generate_ndvi_image(avec_maladies=True)
ndvi_malade = sim.add_noise(ndvi_malade, 0.02)
resultats_malade = sim.calculate_infected_area(ndvi_malade, seuil=0.3)
sim.plot_ndvi(ndvi_malade, resultats_malade['masque'], "Champ avec maladies")

# 4. Comparaison
print("\n" + "="*60)
print("📊 COMPARAISON DES RÉSULTATS")
print("="*60)
print(f"\nChamp sain: {resultats_sain['pourcentage_malade']:.1f}% de pixels 'malades' (fausses alertes)")
print(f"Champ malade: {resultats_malade['pourcentage_malade']:.1f}% de pixels malades")
print(f"→ Différence: {resultats_malade['pourcentage_malade'] - resultats_sain['pourcentage_malade']:.1f}%")

print("\n✅ Tests terminés !")