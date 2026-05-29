#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module d'acquisition et d'analyse satellite pour AgroVision
Basé sur l'article : fusion Sentinel-1/Sentinel-2 + Isolation Forest + buffer spatial
Auteur: Stephane Deutou
Date: Mars 2026
"""

import ee
import numpy as np
import logging
from datetime import datetime, timedelta
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from pathlib import Path
import math
from scipy.ndimage import zoom, binary_dilation
from sklearn.ensemble import IsolationForest
import pyproj
from shapely.geometry import Polygon
from shapely.ops import transform

logger = logging.getLogger(__name__)

class RealSatellite:
    """
    Acquisition et analyse d'images satellite réelles (Sentinel-1/2) avec détection non supervisée
    """

    def __init__(self, config):
        """
        Initialise la connexion à Google Earth Engine et charge la configuration

        Args:
            config: dictionnaire de configuration (contenant 'satellite', 'parcelle', 'detection')
        """
        self.config = config
        self._initialize_ee()
        # Paramètres par défaut depuis la config
        self.buffer_meters = config.get('satellite', {}).get('buffer_meters', 10)
        self.contamination = config.get('detection', {}).get('contamination', 0.1)
        self.max_cloud = config.get('satellite', {}).get('max_cloud_percent', 20)
        self.surface_totale_ha = config['parcelle']['surface_ha']
        print(f"[SAT] Module satellite reel: buffer={self.buffer_meters}m, contamination={self.contamination}, max_cloud={self.max_cloud}%, surface_config={self.surface_totale_ha}ha")

    def _initialize_ee(self):
        """Initialise Google Earth Engine avec le projet spécifié dans la config"""
        try:
            project_id = self.config.get('satellite', {}).get('project_id', '')
            if not project_id:
                # Tentative d'initialisation sans projet (déprécié mais parfois fonctionne)
                ee.Initialize()
                logger.warning("⚠️ Initialisation GEE sans project_id explicite")
            else:
                ee.Initialize(project=project_id)
                logger.info(f" Google Earth Engine connecté avec le projet {project_id}")
            # Test simple pour valider l'accès
            test_point = ee.Geometry.Point([12.55, 4.55])
            test_col = ee.ImageCollection('COPERNICUS/S2_HARMONIZED').filterBounds(test_point).limit(1)
            count = test_col.size().getInfo()
            logger.info(f" Test GEE réussi : {count} image(s) trouvée(s) pour un point test")
        except Exception as e:
            logger.error(f"❌ Erreur d'initialisation Earth Engine: {e}")
            raise e

    def buffer_negatif(self, coords):
        """
        Applique un buffer négatif (érosion) au polygone de la parcelle pour éliminer les bordures.

        Args:
            coords: liste de 4 éléments [lon_min, lat_min, lon_max, lat_max] ou un polygone GeoJSON

        Returns:
            ee.Geometry.Polygon érodé (ou le polygone original si trop petit)
        """
        try:
            # Convertir les coordonnées en polygone Shapely
            if len(coords) == 4:
                polygon = Polygon([
                    (coords[0], coords[1]),
                    (coords[2], coords[1]),
                    (coords[2], coords[3]),
                    (coords[0], coords[3])
                ])
            else:
                # Si c'est déjà une liste de paires (GeoJSON)
                polygon = Polygon(coords)

            # Projeter en UTM zone 32N (Cameroun) pour travailler en mètres
            wgs84 = pyproj.CRS('EPSG:4326')
            utm32 = pyproj.CRS('EPSG:32632')
            project_to_utm = pyproj.Transformer.from_crs(wgs84, utm32, always_xy=True).transform
            project_to_wgs84 = pyproj.Transformer.from_crs(utm32, wgs84, always_xy=True).transform

            polygon_utm = transform(project_to_utm, polygon)
            if polygon_utm.is_empty or polygon_utm.area <= 0:
                logger.warning("⚠️ Polygone UTM invalide, utilisation du polygone original")
                return ee.Geometry.Rectangle(coords)

            # Appliquer le buffer négatif
            eroded = polygon_utm.buffer(-self.buffer_meters)
            if eroded.is_empty or eroded.area <= 0:
                # Si trop petit, on garde le centroïde étendu de 5 mètres
                logger.warning(f"⚠️ Buffer négatif {self.buffer_meters}m vide, utilisation du centroïde")
                centroid = polygon_utm.centroid.buffer(5)
                eroded = centroid

            # Reprojeter en WGS84
            eroded_wgs84 = transform(project_to_wgs84, eroded)
            coords_list = list(eroded_wgs84.exterior.coords)
            logger.info(f" Buffer négatif appliqué : {self.buffer_meters}m, surface résultante {eroded.area:.0f} m²")
            return ee.Geometry.Polygon(coords_list)

        except Exception as e:
            logger.error(f"❌ Erreur lors du buffer négatif: {e}")
            # Fallback: utiliser la région d'origine
            return ee.Geometry.Rectangle(coords)

    def get_multi_index_image(self, coords, date_debut, date_fin, max_cloud=None):
        """
        Extrait une matrice multi-indices (optique ou radar) selon la disponibilité.

        Args:
            coords: [lon_min, lat_min, lon_max, lat_max]
            date_debut: 'YYYY-MM-DD'
            date_fin: 'YYYY-MM-DD'
            max_cloud: pourcentage maximum de nuages (par défaut self.max_cloud)

        Returns:
            indices_dict: dict des tableaux numpy (clés: 'EVI','GNDVI','NDWI' ou 'ratio_VH_VV')
            source: 'optique' ou 'radar'
            date_image: date de l'image (ou 'composite')
            roi_used: geometry Earth Engine utilisée (érodée)
        """
        if max_cloud is None:
            max_cloud = self.max_cloud

        # Appliquer le buffer négatif
        roi = self.buffer_negatif(coords)
        logger.info(f"🔍 Recherche d'images pour la zone (buffer appliqué)")

        # --- Tentative optique Sentinel-2 ---
        s2_collection = ee.ImageCollection('COPERNICUS/S2_HARMONIZED') \
            .filterDate(date_debut, date_fin) \
            .filterBounds(roi) \
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', max_cloud))

        s2_count = s2_collection.size().getInfo()
        logger.info(f"📸 Sentinel-2 : {s2_count} image(s) avec nuages < {max_cloud}%")

        if s2_count > 0:
            # Utiliser un composite médian (inclure B11 pour NDBI)
            median_s2 = s2_collection.select(['B2', 'B3', 'B4', 'B8', 'B11']).median()

            # Date de la plus récente image utilisée dans le composite
            newest = s2_collection.sort('system:time_start', False).first()
            date_image = ee.Date(newest.get('system:time_start')).format('YYYY-MM-dd').getInfo()
            print(f"   📅 Dernière image optique : {date_image}")

            logger.info(f"🛰️ Composite médian Sentinel-2 (dernière image : {date_image}, {s2_count} images)")

            # Calcul des indices
            # Sentinel-2 HARMONIZED fournit la réflectance ×10000,
            # donc le +1 du dénominateur EVI devient +10000
            evi = median_s2.expression(
                '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 10000))',
                {
                    'NIR': median_s2.select('B8'),
                    'RED': median_s2.select('B4'),
                    'BLUE': median_s2.select('B2')
                }
            ).rename('EVI')

            gndvi = median_s2.normalizedDifference(['B8', 'B3']).rename('GNDVI')
            ndwi = median_s2.normalizedDifference(['B3', 'B8']).rename('NDWI')
            ndbi = median_s2.normalizedDifference(['B11', 'B8']).rename('NDBI')

            indices = {'EVI': evi, 'GNDVI': gndvi, 'NDWI': ndwi, 'NDBI': ndbi}
            source = 'optique'

        else:
            # --- Fallback radar Sentinel-1 ---
            logger.warning("⚠️ Aucune image optique de qualité, bascule vers Sentinel-1 SAR")
            s1_collection = ee.ImageCollection('COPERNICUS/S1_GRD') \
                .filterDate(date_debut, date_fin) \
                .filterBounds(roi) \
                .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV')) \
                .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')) \
                .filter(ee.Filter.eq('instrumentMode', 'IW')) \
                .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING')) \
                .select(['VV', 'VH'])

            s1_count = s1_collection.size().getInfo()
            if s1_count == 0:
                raise Exception("Aucune image Sentinel-1 disponible non plus pour la période et la zone")

            median_s1 = s1_collection.median()

            # Date de la plus récente image radar
            newest_radar = s1_collection.sort('system:time_start', False).first()
            date_image = ee.Date(newest_radar.get('system:time_start')).format('YYYY-MM-dd').getInfo()
            print(f"   📅 Dernière image radar : {date_image}")
            # Ratio VH/VV
            ratio = median_s1.expression('VH / VV', {
                'VH': median_s1.select('VH'),
                'VV': median_s1.select('VV')
            }).rename('ratio_VH_VV')

            # Optionnel : ajouter des textures GLCM (Contraste, Homogénéité) sur VV
            # Pour simplifier, on ne garde que le ratio, mais on peut enrichir
            indices = {'ratio_VH_VV': ratio}
            source = 'radar'
            logger.info(f"🛰️ Utilisation d'un composite médian Sentinel-1 ({s1_count} images)")

        # Extraction des matrices numpy avec résolution forcée à 10m
        indices_arrays = {}
        for name, img in indices.items():
            sampled = img.reproject(crs='EPSG:32632', scale=10) \
                          .sampleRectangle(region=roi, defaultValue=0)
            data = sampled.get(name).getInfo()
            arr = np.array(data)
            # Nettoyage des valeurs aberrantes
            arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
            indices_arrays[name] = arr
            print(f"   {name} : shape {arr.shape}, min={arr.min():.4f}, max={arr.max():.4f}, std={arr.std():.4f}")

        # Extraction de l'image RGB true-color (uniquement pour l'optique)
        rgb_array = None
        if source == 'optique':
            try:
                # Extraire les bandes B4 (R), B3 (V), B2 (B) du composite médian
                rgb_img = median_s2.select(['B4', 'B3', 'B2'])
                sampled_rgb = rgb_img.reproject(crs='EPSG:32632', scale=10) \
                                     .sampleRectangle(region=roi, defaultValue=0)
                r = np.array(sampled_rgb.get('B4').getInfo())
                g = np.array(sampled_rgb.get('B3').getInfo())
                b = np.array(sampled_rgb.get('B2').getInfo())
                # Fusionner tous les pixels et exclure les zéros (padding sampleRectangle)
                all_px = np.concatenate([r.ravel(), g.ravel(), b.ravel()])
                all_px = all_px[all_px > 0]
                if len(all_px) < 10:
                    stretch_min, stretch_max = 0, 3000
                else:
                    stretch_min = float(np.percentile(all_px, 2))
                    stretch_max = float(np.percentile(all_px, 98))
                # Appliquer le même stretch aux 3 bandes (préserve la balance des couleurs)
                def stretch(band, lo, hi):
                    clipped = np.clip(band, lo, hi)
                    return ((clipped - lo) / max(hi - lo, 1.0) * 255).astype(np.uint8)
                rgb_array = np.stack([
                    stretch(r, stretch_min, stretch_max),
                    stretch(g, stretch_min, stretch_max),
                    stretch(b, stretch_min, stretch_max)
                ], axis=-1)
                # Upscaling si l'image est trop petite (< 512px de côté)
                h, w = rgb_array.shape[:2]
                target_side = 512
                if h < target_side or w < target_side:
                    zoom_y = max(target_side / h, 1.0)
                    zoom_x = max(target_side / w, 1.0)
                    rgb_array = zoom(rgb_array.astype(np.float64), (zoom_y, zoom_x, 1), order=3)  # bicubic
                    # Unsharp mask pour renforcer les détails
                    from scipy.ndimage import gaussian_filter
                    blurred = gaussian_filter(rgb_array, sigma=0.6)
                    rgb_array = np.clip(rgb_array + (rgb_array - blurred) * 0.4, 0, 255).astype(np.uint8)
                print(f"   RGB : shape {rgb_array.shape}, stretch [{stretch_min:.0f}–{stretch_max:.0f}]")
            except Exception as e:
                print(f"   ⚠️ Impossible d'extraire l'image RGB : {e}")
                rgb_array = None

        return indices_arrays, source, date_image, roi, rgb_array

    def detect_stress_isolation_forest(self, indices_dict, contamination=None):
        """
        Détecte les pixels anormaux (stress) par Isolation Forest.

        Args:
            indices_dict: dictionnaire de tableaux numpy (même dimensions spatiales)
            contamination: proportion attendue d'anomalies (par défaut self.contamination)

        Returns:
            dict contenant masque, pourcentage, surfaces, etc.
        """
        if contamination is None:
            contamination = self.contamination

        # Vérifier que tous les tableaux ont la même forme
        shapes = [arr.shape for arr in indices_dict.values()]
        if len(set(shapes)) != 1:
            raise ValueError(f"Les indices n'ont pas la même shape : {shapes}")
        shape = shapes[0]
        n_pixels = shape[0] * shape[1]

        print(f"📊 Détection Isolation Forest : shape={shape}, pixels={n_pixels}, features={len(indices_dict)}")
        for name, arr in indices_dict.items():
            print(f"   {name}: min={arr.min():.4f}, max={arr.max():.4f}, std={arr.std():.4f}")

        # Si trop peu de pixels, utiliser un seuil simple
        if n_pixels < 20:
            print(f"⚠️ Petit échantillon ({n_pixels} pixels) — détection par seuil fixe")
            # Pour les très petits échantillons, évaluer le premier indice directement
            if n_pixels <= 2:
                first = list(indices_dict.keys())[0]
                val = indices_dict[first].flatten()[0]
                stress = val < 0.25  # végétation saine: EVI/GNDVI > 0.3
                pixels_stress = 1 if stress else 0
                pourcentage_stress = (pixels_stress / n_pixels) * 100.0
                surface_stress_ha = self.surface_totale_ha * (pixels_stress / n_pixels)
                mask_anomalies = np.full(shape, stress, dtype=bool)
                print(f"   Pixel unique : valeur={val:.4f}, stress={'OUI' if stress else 'NON'}")
            else:
                # Combiner les indices normalisés, seuil à 20%
                scores = np.zeros(n_pixels)
                for name, arr in indices_dict.items():
                    flat = arr.flatten()
                    if flat.std() > 1e-6:
                        scores += (flat - flat.mean()) / flat.std()
                    else:
                        scores += flat
                seuil = np.percentile(scores, 20)
                mask_anomalies = (scores < seuil).reshape(shape)
                pixels_stress = np.sum(mask_anomalies)
                pourcentage_stress = (pixels_stress / n_pixels) * 100.0
                surface_stress_ha = self.surface_totale_ha * (pixels_stress / n_pixels)
                print(f"   Seuil combiné (20%), stress: {pixels_stress}/{n_pixels} ({pourcentage_stress:.1f}%)")
        else:
            # Construire la matrice de caractéristiques (pixels x features)
            n_features = len(indices_dict)
            X = np.zeros((n_pixels, n_features))
            for i, (name, arr) in enumerate(indices_dict.items()):
                X[:, i] = arr.flatten()

            # Supprimer les éventuels NaN ou infinis (normalement déjà traités)
            X = np.nan_to_num(X, nan=0.0)

            # Isolation Forest
            clf = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
            predictions = clf.fit_predict(X)  # -1 = anomalie, 1 = normal
            mask_anomalies = (predictions == -1).reshape(shape)

            pixels_stress = np.sum(mask_anomalies)
            pourcentage_stress = (pixels_stress / n_pixels) * 100.0
            surface_stress_ha = self.surface_totale_ha * (pixels_stress / n_pixels)

        print(f"📊 Résultat Isolation Forest (contamination={contamination}):")
        print(f"   Pixels stressés : {pixels_stress}/{n_pixels} ({pourcentage_stress:.2f}%)")
        print(f"   Surface stressée : {surface_stress_ha:.3f} ha")

        return {
            'masque_stress': mask_anomalies,
            'pixels_stress': int(pixels_stress),
            'pixels_total': n_pixels,
            'pourcentage_stress': pourcentage_stress,
            'surface_stress_ha': surface_stress_ha,
            'surface_totale_ha': self.surface_totale_ha,
            'contamination_utilisee': contamination,
            'n_features': len(indices_dict)
        }

    def plot_stress_map(self, indices_dict, masque_stress, save_path=None, show=False, rgb_array=None):
        """
        Génère une visualisation interprétable par un agriculteur.

        Si rgb_array est fourni → superposition pro (type Spotifarm) :
          Panel gauche  : image satellite réelle
          Panel droit   : image satellite + zones stress en rouge

        Sinon → fallback RdYlGn (pour radar/simulation)

        Args:
            indices_dict: dictionnaire des indices
            masque_stress: masque booléen des anomalies
            save_path: chemin de sauvegarde
            show: afficher interactivement
            rgb_array: image RGB (H,W,3) optionnelle pour fond réel
        """
        pct = int(np.sum(masque_stress) / max(masque_stress.size, 1) * 100)
        ha_stress = self.surface_totale_ha * pct / 100

        # Si RGB disponible, redimensionner le masque pour qu'il s'aligne
        if rgb_array is not None:
            h_rgb, w_rgb = rgb_array.shape[:2]
            h_msk, w_msk = masque_stress.shape[:2]
            if (h_rgb, w_rgb) != (h_msk, w_msk):
                zy, zx = h_rgb / h_msk, w_rgb / w_msk
                stress_viz = zoom(masque_stress.astype(np.float64), (zy, zx), order=0) > 0.5
            else:
                stress_viz = masque_stress

            # ─── Rendu pro : image satellite réelle + stress overlay ───
            fig, axes = plt.subplots(1, 2, figsize=(14, 5.5))

            # Panel 1 : image satellite brute
            axes[0].imshow(rgb_array)
            axes[0].set_title('🛰️ Image satellite réelle', fontsize=13, fontweight='bold')
            axes[0].set_xlabel('Vue true-color de la parcelle', fontsize=9, color='#555')

            # Panel 2 : image satellite + stress overlay rouge
            axes[1].imshow(rgb_array)
            # Overlay rouge semi-transparent sur les zones stressées
            stress_colored = np.zeros((*stress_viz.shape, 4), dtype=np.float64)
            stress_colored[stress_viz] = [1.0, 0.0, 0.0, 0.55]  # RGBA
            axes[1].imshow(stress_colored)
            # Contours blancs autour des zones de stress
            edges = stress_viz.astype(int) - binary_dilation(stress_viz, iterations=1).astype(int)
            edges_rgba = np.zeros((*stress_viz.shape, 4), dtype=np.float64)
            edges_rgba[edges > 0] = [1.0, 1.0, 1.0, 0.8]
            axes[1].imshow(edges_rgba)

            axes[1].set_title('🔴 Zones de stress détectées', fontsize=13, fontweight='bold')
            axes[1].set_xlabel(f'{pct}% de la parcelle — {ha_stress:.2f} ha touchés', fontsize=10, color='#c62828')

            fig.text(0.5, 0.01,
                     f"🔴 Rouge = stress / maladie détecté  |  {pct}% de la parcelle touchée",
                     ha='center', fontsize=10, color='#444',
                     bbox=dict(boxstyle='round,pad=0.5', facecolor='#f5f5f5', edgecolor='#ddd'))

            plt.tight_layout(rect=[0, 0.04, 1, 1])

        else:
            # ─── Fallback : RdYlGn (quand pas d'image RGB) ───
            first_name = list(indices_dict.keys())[0]
            base_image = indices_dict[first_name]

            fig, axes = plt.subplots(1, 2, figsize=(14, 5.5))

            vmin, vmax = np.percentile(base_image[base_image > -999], [2, 98])
            im = axes[0].imshow(base_image, cmap='RdYlGn', vmin=vmin, vmax=vmax)
            axes[0].set_title('🌿 Santé de la végétation', fontsize=13, fontweight='bold')
            axes[0].set_xlabel('Vert = sain  →  Jaune = modéré  →  Rouge = stressé', fontsize=9, color='#555')
            cbar = plt.colorbar(im, ax=axes[0], shrink=0.8)
            cbar.set_label('Indice ' + first_name, fontsize=9)

            axes[1].imshow(base_image, cmap='RdYlGn', vmin=vmin, vmax=vmax)
            overlay = np.ma.masked_where(~masque_stress, np.ones_like(base_image))
            axes[1].imshow(overlay, cmap=ListedColormap(['#D32F2F']), alpha=0.55, vmin=0, vmax=1)
            edges = masque_stress.astype(int) - binary_dilation(masque_stress, iterations=1).astype(int)
            axes[1].imshow(np.ma.masked_where(edges == 0, edges), cmap=ListedColormap(['white']), alpha=0.7)
            axes[1].set_title('🔴 Zones de stress détectées', fontsize=13, fontweight='bold')
            axes[1].set_xlabel(f'{pct}% de la parcelle — {ha_stress:.2f} ha touchés', fontsize=10, color='#c62828')

            fig.text(0.5, 0.01,
                     f"🌱 Vert = sain  |  🟡 Jaune = vigilance  |  🔴 Rouge = stress / maladie",
                     ha='center', fontsize=10, color='#444',
                     bbox=dict(boxstyle='round,pad=0.5', facecolor='#f5f5f5', edgecolor='#ddd'))

            plt.tight_layout(rect=[0, 0.04, 1, 1])

        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f" Carte de stress sauvegardée : {save_path}")
        if show:
            plt.show()
        plt.close(fig)

    # ─── ZONE CLASSIFICATION ─────────────────────────────────────────────────
    CLASS_NAMES = {
        0: 'inconnu',
        1: 'eau',
        2: 'desert',
        3: 'urbain_sol_nu',
        4: 'vegetation_clairsemee',
        5: 'vegetation_moderee',
        6: 'vegetation_dense',
        7: 'zone_humide',
    }

    CLASS_COLORS = {
        'eau': '#1565C0',
        'desert': '#FFA000',
        'urbain_sol_nu': '#757575',
        'vegetation_clairsemee': '#A5D6A7',
        'vegetation_moderee': '#66BB6A',
        'vegetation_dense': '#1B5E20',
        'zone_humide': '#4DD0E1',
        'inconnu': '#BDBDBD',
    }

    def classify_zones(self, indices_dict):
        """
        Classification pixel-wise basée sur des seuils décisionnels
        validés par la recherche (Xu 2006, Jiang 2008, Drusch 2012).

        Args:
            indices_dict: dict avec EVI, GNDVI, NDWI (optique) ou ratio_VH_VV (radar)

        Returns:
            dict: zone_type, zone_map, class_distribution, confidence, warning
        """
        shape = None
        n_pixels = 0
        for arr in indices_dict.values():
            shape = arr.shape
            n_pixels = shape[0] * shape[1]
            break

        # Initialiser la carte des classes (par défaut: inconnu)
        zone_map = np.zeros(shape, dtype=np.uint8)

        # ─── Classification optique (EVI + NDWI + NDBI) ───
        # Références : NDBI → Zha et al. (2003) ; MNDWI → Xu (2006) ;
        #             Seuils optimaux globaux → Harrak et al. (2025, RS)
        if all(k in indices_dict for k in ('EVI', 'GNDVI', 'NDWI', 'NDBI')):
            evi = indices_dict['EVI']
            gndvi = indices_dict['GNDVI']
            ndwi = indices_dict['NDWI']
            ndbi = indices_dict['NDBI']

            # Priorité décroissante : chaque pixel prend la première classe vraie
            # 1. Eau (NDWI > 0.15 — Harrak 2025)
            mask = (ndwi > 0.15)
            zone_map[mask] = 1
            # 2. Désert (très faible EVI, NDWI très négatif, NDBI ≈ 0 ou négatif)
            mask = (ndwi < -0.1) & (evi < 0.05) & (zone_map == 0)
            zone_map[mask] = 2
            # 3. Urbain / bâti (NDBI > seuil global -0.08, EVI bas)
            mask = (ndbi > -0.08) & (evi < 0.15) & (zone_map == 0)
            zone_map[mask] = 3
            # 4. Sol nu (NDBI entre -0.15 et -0.08, EVI bas)
            mask = (ndbi > -0.15) & (ndbi <= -0.08) & (evi < 0.15) & (zone_map == 0)
            zone_map[mask] = 3
            # 5. Zone humide (végétation + eau)
            mask = (ndwi > -0.05) & (evi > 0.1) & (zone_map == 0)
            zone_map[mask] = 7
            # 6. Végétation dense (EVI > 0.35 + NDBI négatif)
            mask = (evi > 0.35) & (gndvi > 0.35) & (ndbi < -0.08) & (zone_map == 0)
            zone_map[mask] = 6
            # 7. Végétation modérée (EVI > 0.2 + NDBI négatif)
            mask = (evi > 0.2) & (gndvi > 0.2) & (ndbi < -0.08) & (zone_map == 0)
            zone_map[mask] = 5
            # 8. Végétation clairsemée / rurale
            mask = (evi > 0.1) & (gndvi > 0.1) & (zone_map == 0)
            zone_map[mask] = 4

            conf_level = 'haute'
            print(f"   🌍 Classification zones : optique (EVI+NDWI+NDBI+GNDVI)")

        # ─── Classification radar (ratio VH/VV, moins précise) ───
        elif 'ratio_VH_VV' in indices_dict:
            ratio = indices_dict['ratio_VH_VV']
            # Ratio VH/VV : < 0.2 = eau/surface lisse, > 0.3 = végétation,
            # entre 0.2 et 0.3 = sol nu/urbain
            zone_map[ratio < 0.15] = 1  # eau
            zone_map[(ratio >= 0.15) & (ratio < 0.25) & (zone_map == 0)] = 3  # urbain
            zone_map[(ratio >= 0.25) & (ratio < 0.35) & (zone_map == 0)] = 4  # clairsemé
            zone_map[(ratio >= 0.35) & (zone_map == 0)] = 5  # végétation

            conf_level = 'moyenne'
            print(f"   🌍 Classification zones : radar (ratio VH/VV, précision réduite)")

        # Statistiques de distribution
        class_ids, class_counts = np.unique(zone_map, return_counts=True)
        class_distribution = {}
        for cid, count in zip(class_ids, class_counts):
            name = self.CLASS_NAMES.get(int(cid), 'inconnu')
            class_distribution[name] = {
                'pixels': int(count),
                'pourcentage': round(float(count) / n_pixels * 100, 1)
            }

        # Classe dominante
        dominant_id = class_ids[np.argmax(class_counts)]
        zone_type = self.CLASS_NAMES.get(int(dominant_id), 'inconnu')

        # Confiance : proportion de pixels non "inconnu"
        n_classified = int(class_distribution.get('inconnu', {}).get('pixels', 0))
        confidence = round((n_pixels - n_classified) / n_pixels, 3) if n_pixels > 0 else 0.0

        # Alerte si la classe dominante est problématique pour une parcelle agricole
        warning = None
        if zone_type == 'eau':
            if class_distribution.get('eau', {}).get('pourcentage', 0) > 50:
                warning = "Parcelle majoritairement aquatique — risque d'inondation"
            elif class_distribution.get('eau', {}).get('pourcentage', 0) > 20:
                warning = "Présence significative d'eau — vérifier le drainage"
        elif zone_type == 'desert':
            warning = "Sol très aride — irrigation nécessaire"
        elif zone_type == 'urbain_sol_nu':
            warning = "Zone non végétale dominante — vérifier l'emplacement de la parcelle"
        elif zone_type == 'vegetation_clairsemee':
            warning = "Végétation clairsemée — qualité du sol à surveiller"

        print(f"   Zone dominante : {zone_type} (confiance: {confidence:.1%})")
        if warning:
            print(f"   ⚠️ {warning}")

        return {
            'zone_type': zone_type,
            'zone_map': zone_map,
            'class_distribution': class_distribution,
            'confidence': confidence,
            'conf_level': conf_level,
            'warning': warning,
        }

    # --- Méthodes de compatibilité avec l'ancien pipeline (si nécessaire) ---
    def get_ndvi_image(self, coords, date_debut, date_fin, max_cloud=20):
        """
        Méthode legacy pour compatibilité ascendante.
        Retourne ndvi, all_indices, date_str, image (mais on utilise la nouvelle approche)
        """
        indices_dict, source, date_image, roi = self.get_multi_index_image(coords, date_debut, date_fin, max_cloud)
        # Extraire un pseudo-NDVI (pour compatibilité) : on utilise GNDVI ou ratio
        if 'GNDVI' in indices_dict:
            ndvi_array = indices_dict['GNDVI']  # approximation
        elif 'ratio_VH_VV' in indices_dict:
            ndvi_array = indices_dict['ratio_VH_VV']
        else:
            ndvi_array = np.zeros((10,10))
        return ndvi_array, indices_dict, date_image, None

    def calculate_infected_area(self, ndvi, seuil=None):
        """
        Méthode legacy - ne plus utiliser. On utilise désormais detect_stress_isolation_forest.
        """
        logger.warning("⚠️ calculate_infected_area est obsolète. Utilisez detect_stress_isolation_forest.")
        return {
            'pixels_malades': 0,
            'pixels_total': 0,
            'pourcentage_pixels': 0.0,
            'surface_infectee_ha': 0.0,
            'masque': np.zeros_like(ndvi, dtype=bool)
        }

# Exemple d'utilisation directe (test)
if __name__ == "__main__":
    import yaml
    logging.basicConfig(level=logging.INFO)
    with open('config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    sat = RealSatellite(config)
    coords = [10.32, 5.42, 10.36, 5.46]  # Zone agricole test (Cameroun)
    indices, source, date, roi = sat.get_multi_index_image(coords, '2025-12-01', '2026-03-01')
    results = sat.detect_stress_isolation_forest(indices)
    sat.plot_stress_map(indices, results['masque_stress'], save_path='test_stress.png')
    print("Test terminé. Consultez test_stress.png")