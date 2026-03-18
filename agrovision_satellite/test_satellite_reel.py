#!/usr/bin/env python3
"""
Test du module satellite réel
"""

import sys
import yaml
import logging

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Ajouter le dossier modules au chemin
sys.path.append('.')

from modules.satellite_real import RealSatellite

def main():
    print("="*60)
    print("🛰️  TEST SATELLITE RÉEL")
    print("="*60)
    
    # 1. Charger la config
    with open('config.yaml', 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    # 2. Créer le module
    sat = RealSatellite(config)
    
    # 3. Coordonnées du champ
    coords = config['parcelle']['coordinates']
    print(f"\n📍 Parcelle: {coords}")
    
    # 4. Récupérer une image
    print("\n📡 Récupération image satellite...")
    try:
        ndvi, all_indices, date, image = sat.get_ndvi_image(
            coords,
            '2026-01-01',
            '2026-03-01',
            max_cloud=20
        )
        print(f"✅ Image du {date} récupérée")
        print(f"   Dimensions: {ndvi.shape}")
        print(f"   NDVI min: {ndvi.min():.2f}, max: {ndvi.max():.2f}")
        
        # 5. Analyser
        print("\n🔍 Analyse des zones malades...")
        resultats = sat.calculate_infected_area(ndvi)  # Utilise le seuil de config (0.35)
        
        # 6. Afficher
        print("\n📊 RÉSULTATS:")
        print(f"   Pixels analysés: {resultats['pixels_total']}")
        print(f"   Pixels malades: {resultats['pixels_malades']}")
        print(f"   Taux d'infection (pixels): {resultats['pourcentage_pixels']:.1f}%")
        print(f"   Surface parcelle: {resultats['surface_totale_ha']} ha")
        print(f"   Surface infectée réelle: {resultats['surface_infectee_ha']:.3f} ha")
        print(f"   Taux d'infection réel: {resultats['pourcentage_reel']:.1f}%")
        
        # 7. Sauvegarder le graphique
        sat.plot_ndvi(
            ndvi,
            resultats['masque'],
            f"Image Sentinel-2 du {date}",
            save_path="data/outputs/satellite_reel_test.png"
        )
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    print("\n✅ Test terminé avec succès")
    return 0

if __name__ == "__main__":
    sys.exit(main())