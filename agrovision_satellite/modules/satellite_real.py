"""
Module d'acquisition d'images satellite réelles (Sentinel-2)
Version améliorée avec multiples indices et seuil configurable
"""

import ee
import numpy as np
import logging
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
from pathlib import Path
import math  # ← AJOUTÉ pour les calculs de redimensionnement
from scipy.ndimage import zoom

logger = logging.getLogger(__name__)

class RealSatellite:
    """
    Acquisition et analyse d'images Sentinel-2 réelles
    """
    
    def __init__(self, config):
        """
        Initialise la connexion à Google Earth Engine
        """
        self.config = config
        self._initialize_ee()
        logger.info("✅ Module satellite réel initialisé")
    
    def _initialize_ee(self):
        """Initialise Google Earth Engine avec le projet spécifié"""
        try:
            # Ton ID de projet depuis la config
            project_id = self.config.get('satellite', {}).get('project_id', '')
            
            # Initialise avec le projet
            ee.Initialize(project=project_id)
            logger.info(f"✅ Google Earth Engine connecté avec projet {project_id}")
            
        except Exception as e:
            logger.error(f"❌ Erreur EE: {e}")
            logger.info("🔑 Vérifie l'enregistrement du projet sur https://code.earthengine.google.com/register")
            raise e
    
    def compute_all_indices(self, image):
        """
        Calcule plusieurs indices de végétation
        
        Args:
            image: Image Sentinel-2
        
        Returns:
            dict: Dictionnaire contenant NDVI, EVI, SAVI
        """
        indices = {}
        
        # NDVI (Normalized Difference Vegetation Index)
        # Formule: (NIR - RED) / (NIR + RED)
        indices['NDVI'] = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        
        # EVI (Enhanced Vegetation Index)
        # Formule: 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))
        evi = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
                'NIR': image.select('B8'),
                'RED': image.select('B4'),
                'BLUE': image.select('B2')
            }).rename('EVI')
        indices['EVI'] = evi
        
        # SAVI (Soil Adjusted Vegetation Index)
        # Formule: ((NIR - RED) / (NIR + RED + 0.5)) * 1.5
        savi = image.expression(
            '((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {
                'NIR': image.select('B8'),
                'RED': image.select('B4')
            }).rename('SAVI')
        indices['SAVI'] = savi
        
        logger.info(f"✅ Indices calculés: {', '.join(indices.keys())}")
        return indices
    
    def get_ndvi_image(self, coords, date_debut, date_fin, max_cloud=20):
        """
        Récupère une image NDVI réelle pour une parcelle
        
        Args:
            coords: [long_min, lat_min, long_max, lat_max]
            date_debut: '2026-01-01'
            date_fin: '2026-03-01'
            max_cloud: % maximum de nuages
        
        Returns:
            ndvi: tableau numpy NDVI
            all_indices: dict de tous les indices calculés
            date_image: date de l'image
        """
        logger.info(f"🔍 Recherche d'images pour la zone {coords}")
        logger.info(f"📅 Période: {date_debut} à {date_fin}")
        
        # Créer la région d'intérêt
        roi = ee.Geometry.Rectangle(coords)
        
        # Récupérer les images Sentinel-2
        collection = ee.ImageCollection('COPERNICUS/S2_HARMONIZED') \
            .filterDate(date_debut, date_fin) \
            .filterBounds(roi) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', max_cloud))
        
        # Compter les images
        count = collection.size().getInfo()
        logger.info(f"📸 {count} images trouvées")
        
        if count == 0:
            # Élargir la recherche
            logger.warning("⚠️ Aucune image trouvée, élargissement de la période...")
            new_date_debut = (datetime.strptime(date_debut, '%Y-%m-%d') - timedelta(days=60)).strftime('%Y-%m-%d')
            collection = ee.ImageCollection('COPERNICUS/S2_HARMONIZED') \
                .filterDate(new_date_debut, date_fin) \
                .filterBounds(roi) \
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', max_cloud))
            count = collection.size().getInfo()
            logger.info(f"📸 Après élargissement: {count} images")
            
            if count == 0:
                raise Exception("❌ Aucune image disponible")
        
        # Prendre l'image la plus récente
        image = collection.sort('system:time_start', False).first()
        date_image = image.get('system:time_start').getInfo()
        date_str = datetime.fromtimestamp(date_image/1000).strftime('%Y-%m-%d')
        logger.info(f"🖼️ Image sélectionnée du {date_str}")
        
        # Calculer tous les indices
        indices = self.compute_all_indices(image)
        
        # Limite de pixels Earth Engine
        max_pixels = 262144
        logger.info(f"🎯 Limite Earth Engine: {max_pixels} pixels max")
        
        # Échantillonner chaque indice
        results = {}
        for idx_name, idx_image in indices.items():
            # Échantillonner sans paramètre side (pas supporté)
            sampled = idx_image.sampleRectangle(
                region=roi, 
                defaultValue=0
            )
            
            # Récupérer les données
            data = sampled.get(idx_name).getInfo()
            results[idx_name] = np.array(data)
            
            logger.info(f"   {idx_name} taille originale: {results[idx_name].shape}")
            
            # Si l'image est trop grande, on la réduit
            if results[idx_name].size > max_pixels:
                logger.warning(f"⚠️ {idx_name} trop grand ({results[idx_name].size} pixels), redimensionnement...")
                
                # Calculer le facteur de réduction pour atteindre max_pixels
                current_size = results[idx_name].size
                scale_factor = np.sqrt(max_pixels / current_size)
                
                # Calculer les nouvelles dimensions
                new_height = int(results[idx_name].shape[0] * scale_factor)
                new_width = int(results[idx_name].shape[1] * scale_factor)
                
                # Redimensionner avec scipy (si disponible) ou interpolation simple
                try:
                    from scipy.ndimage import zoom
                    results[idx_name] = zoom(results[idx_name], scale_factor)
                except ImportError:
                    # Fallback : interpolation linéaire simple
                    from skimage.transform import resize
                    results[idx_name] = resize(results[idx_name], (new_height, new_width))
                
                logger.info(f"   Redimensionné à: {results[idx_name].shape}")
            
            # Nettoyer les valeurs (NaN, Inf)
            mean_val = np.nanmean(results[idx_name])
            results[idx_name] = np.where(
                np.isnan(results[idx_name]) | np.isinf(results[idx_name]), 
                mean_val, 
                results[idx_name]
            )
        
        # Extraire NDVI pour la compatibilité avec l'ancien code
        ndvi_array = results['NDVI']
        
        logger.info(f"✅ Images récupérées, taille finale: {ndvi_array.shape}")
        for idx_name, idx_array in results.items():
            logger.info(f"   {idx_name}: min={idx_array.min():.2f}, max={idx_array.max():.2f}, moy={idx_array.mean():.2f}")
        
        return ndvi_array, results, date_str
    
    def calculate_infected_area(self, ndvi, seuil=None):
        """
        Calcule la surface infectée à partir de l'image NDVI
        
        Args:
            ndvi: image NDVI
            seuil: valeur en dessous de laquelle on considère comme malade
                   (si None, utilise la valeur de config)
            
        Returns:
            dict: résultats
        """
        # Utiliser le seuil de config si non spécifié
        if seuil is None:
            seuil = self.config.get('detection', {}).get('ndvi_seuil', 0.35)
        
        logger.info(f"🔍 Utilisation du seuil NDVI = {seuil}")
        
        # 1. Créer un masque des pixels malades (True si malade)
        masque_malade = ndvi < seuil
        
        # 2. Compter le nombre de pixels malades
        pixels_malades = np.sum(masque_malade)
        pixels_total = ndvi.shape[0] * ndvi.shape[1]
        
        # 3. Calculer le pourcentage
        pourcentage_malade = (pixels_malades / pixels_total) * 100
        
        # 4. Estimer la surface en hectares (adapté à la résolution réelle)
        # Sentinel-2 a une résolution de 10m/pixel
        surface_par_pixel_ha = 0.01  # 100 m² = 0.01 ha
        surface_malade_ha = pixels_malades * surface_par_pixel_ha
        
        # 5. Résultats
        resultats = {
            'pixels_malades': int(pixels_malades),
            'pixels_total': int(pixels_total),
            'pourcentage_malade': float(pourcentage_malade),
            'surface_malade_ha': float(surface_malade_ha),
            'masque': masque_malade,
            'seuil_utilise': seuil
        }
        
        logger.info(f"📊 Analyse (seuil={seuil}):")
        logger.info(f"   Pixels malades: {pixels_malades}/{pixels_total} ({pourcentage_malade:.1f}%)")
        logger.info(f"   Surface estimée: {surface_malade_ha:.2f} hectares")
        
        return resultats
    
    def detect_anomalies_multiple_indices(self, indices_dict, seuils=None):
        """
        Détecte les anomalies en combinant plusieurs indices
        
        Args:
            indices_dict: dict des indices {nom: tableau}
            seuils: dict des seuils {nom: valeur}
        
        Returns:
            dict: résultats combinés
        """
        if seuils is None:
            # Utiliser les seuils de la config si disponibles
            detection_config = self.config.get('detection', {})
            seuils = {
                'NDVI': detection_config.get('ndvi_seuil', 0.35),
                'EVI': detection_config.get('evi_seuil', 0.2),
                'SAVI': detection_config.get('savi_seuil', 0.25)
            }
        
        logger.info(f"🔍 Détection multi-indices avec seuils: {seuils}")
        
        # Créer un masque pour chaque indice
        masques = {}
        for nom, idx_array in indices_dict.items():
            if nom in seuils:
                masques[nom] = idx_array < seuils[nom]
                logger.info(f"   {nom}: {np.sum(masques[nom])} pixels anormaux")
        
        # Combiner les masques (union: un pixel est malade si un indice le détecte)
        masque_combine = np.zeros_like(indices_dict['NDVI'], dtype=bool)
        for masque in masques.values():
            masque_combine = masque_combine | masque
        
        pixels_malades = np.sum(masque_combine)
        pourcentage = (pixels_malades / masque_combine.size) * 100
        
        logger.info(f"   COMBINÉ: {pixels_malades} pixels anormaux ({pourcentage:.1f}%)")
        
        return {
            'masque': masque_combine,
            'pixels_malades': pixels_malades,
            'pourcentage': pourcentage,
            'masques_individuels': masques,
            'seuils_utilises': seuils
        }
    
    def plot_ndvi(self, ndvi, masque=None, titre="Image NDVI", save_path=None):
        """
        Affiche l'image NDVI et optionnellement le masque
        
        Args:
            ndvi: image NDVI
            masque: masque des zones malades (optionnel)
            titre: titre du graphique
            save_path: chemin pour sauvegarder (optionnel)
        """
        fig, axes = plt.subplots(1, 2 if masque is not None else 1, figsize=(12, 5))
        
        # Si on a qu'un seul graphique
        if masque is None:
            im = axes.imshow(ndvi, cmap='RdYlGn', vmin=0, vmax=1)
            axes.set_title(titre)
            axes.set_xlabel('Pixels')
            axes.set_ylabel('Pixels')
            plt.colorbar(im, ax=axes, label='NDVI')
        else:
            # Premier graphique : NDVI
            im1 = axes[0].imshow(ndvi, cmap='RdYlGn', vmin=0, vmax=1)
            axes[0].set_title(f'{titre} - NDVI')
            axes[0].set_xlabel('Pixels')
            axes[0].set_ylabel('Pixels')
            plt.colorbar(im1, ax=axes[0], label='NDVI')
            
            # Deuxième graphique : masque des zones malades
            im2 = axes[1].imshow(masque, cmap='Reds')
            axes[1].set_title('Zones malades détectées')
            axes[1].set_xlabel('Pixels')
            axes[1].set_ylabel('Pixels')
            plt.colorbar(im2, ax=axes[1], label='Malade (1=oui)')
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=150)
            logger.info(f"✅ Graphique sauvegardé: {save_path}")
        
        plt.show()
    
    def plot_all_indices(self, indices_dict, masque=None, save_path=None):
        """
        Affiche tous les indices côte à côte
        
        Args:
            indices_dict: dict des indices
            masque: masque des anomalies (optionnel)
            save_path: chemin de sauvegarde
        """
        n_indices = len(indices_dict)
        fig, axes = plt.subplots(1, n_indices + (1 if masque is not None else 0), 
                                  figsize=(5 * (n_indices + 1), 5))
        
        for i, (nom, data) in enumerate(indices_dict.items()):
            im = axes[i].imshow(data, cmap='RdYlGn', vmin=0, vmax=1)
            axes[i].set_title(f'{nom}')
            axes[i].set_xlabel('Pixels')
            axes[i].set_ylabel('Pixels')
            plt.colorbar(im, ax=axes[i])
        
        if masque is not None:
            axes[-1].imshow(masque, cmap='Reds')
            axes[-1].set_title('Zones malades (combiné)')
            axes[-1].set_xlabel('Pixels')
            axes[-1].set_ylabel('Pixels')
            plt.colorbar(axes[-1].images[0], ax=axes[-1], label='Malade')
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=150)
            logger.info(f"✅ Graphique multi-indices sauvegardé: {save_path}")
        
        plt.show()


# Test du module si exécuté directement
if __name__ == "__main__":
    import yaml
    
    print("="*60)
    print("🧪 TEST DU MODULE SATELLITE RÉEL")
    print("="*60)
    
    # Charger la config
    with open('config.yaml', 'r') as f:
        config = yaml.safe_load(f)
    
    # Créer le module
    sat = RealSatellite(config)
    
    # Coordonnées de test (Cameroun)
    coords = [12.55, 4.55, 12.58, 4.58]  # Note: [long_min, lat_min, long_max, lat_max]
    
    # Récupérer une image avec tous les indices
    ndvi, all_indices, date = sat.get_ndvi_image(
        coords,
        '2026-01-01',
        '2026-03-01',
        max_cloud=20
    )
    
    print(f"\n✅ Image du {date} récupérée")
    print(f"   Dimensions: {ndvi.shape}")
    
    # Analyser avec le seuil de config
    resultats = sat.calculate_infected_area(ndvi)  # seuil automatique depuis config
    
    # Détection multi-indices
    multi_results = sat.detect_anomalies_multiple_indices(all_indices)
    
    # Afficher tous les indices
    sat.plot_all_indices(all_indices, multi_results['masque'], 
                         save_path="data/outputs/multi_indices_test.png")
    
    print("\n✅ Test terminé")