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
    
    # 4. Récupérer les indices
    print("\n📡 Récupération image satellite...")
    try:
        indices_dict, source, date, roi = sat.get_multi_index_image(
            coords,
            '2026-01-01',
            '2026-03-01',
            max_cloud=20
        )
        print(f"✅ Image du {date} récupérée (source: {source})")
        for name, arr in indices_dict.items():
            print(f"   {name}: {arr.shape}, min={arr.min():.2f}, max={arr.max():.2f}")
        
        # 5. Détection des anomalies par Isolation Forest
        print("\n🔍 Détection des zones de stress...")
        resultats = sat.detect_stress_isolation_forest(indices_dict)
        
        # 6. Afficher
        print("\n📊 RÉSULTATS:")
        print(f"   Pixels analysés: {resultats['pixels_total']}")
        print(f"   Pixels stressés: {resultats['pixels_stress']}")
        print(f"   Taux de stress: {resultats['pourcentage_stress']:.1f}%")
        print(f"   Surface stressée: {resultats['surface_stress_ha']:.3f} ha")
        
        # 7. Sauvegarder la carte de stress
        sat.plot_stress_map(
            indices_dict,
            resultats['masque_stress'],
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