"""
Module de simulation d'images satellite
Pour l'instant, on simule des données en attendant d'avoir accès aux vraies
"""

import numpy as np
import matplotlib.pyplot as plt
import logging
from pathlib import Path

# Configuration du logging (pour afficher des messages)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SatelliteSimulator:
    """
    Simulateur d'images satellite
    Cette classe crée des fausses images NDVI pour qu'on puisse développer
    en attendant les vraies données.
    """
    
    def __init__(self, config):
        """
        Initialise le simulateur avec la configuration
        
        Args:
            config: dictionnaire de configuration (venant de config.yaml)
        """
        self.config = config
        self.image_size = 100  # 100x100 pixels pour commencer
        logger.info("✅ Simulateur satellite initialisé")
    
    def generate_ndvi_image(self, avec_maladies=True):
        """
        Génère une image NDVI simulée
        
        Args:
            avec_maladies: Si True, ajoute des zones malades
            
        Returns:
            ndvi: tableau 2D de valeurs NDVI (entre -1 et 1)
        """
        logger.info("🔄 Génération d'une image NDVI simulée...")
        
        # 1. Créer une image de base (plantes saines)
        # Les plantes saines ont un NDVI entre 0.5 et 0.8
        # np.random.normal(moyenne, écart-type, taille)
        ndvi_sain = np.random.normal(0.7, 0.1, (self.image_size, self.image_size))
        
        # 2. Borner les valeurs entre 0.4 et 0.9 (pour rester réaliste)
        ndvi_sain = np.clip(ndvi_sain, 0.4, 0.9)
        
        ndvi = ndvi_sain.copy()
        
        if avec_maladies:
            # 3. Ajouter des zones malades (NDVI plus bas)
            logger.info("   Ajout de zones malades...")
            
            # Première zone malade (carré de 20x20 pixels)
            # Les plantes malades ont NDVI entre 0.1 et 0.3
            ndvi[20:40, 30:50] = np.random.normal(0.2, 0.05, (20, 20))
            
            # Deuxième zone malade
            ndvi[60:70, 10:20] = np.random.normal(0.15, 0.05, (10, 10))
            
            # Troisième zone (forme irrégulière)
            for i in range(80, 90):
                for j in range(70, 85):
                    if np.random.random() > 0.3:  # 70% de chance d'être malade
                        ndvi[i, j] = np.random.normal(0.2, 0.05)
        
        # 4. S'assurer que les valeurs restent entre -1 et 1 (NDVI théorique)
        ndvi = np.clip(ndvi, -1, 1)
        
        logger.info(f"✅ Image générée : {ndvi.shape}, min={ndvi.min():.2f}, max={ndvi.max():.2f}")
        
        return ndvi
    
    def add_noise(self, ndvi, niveau_bruit=0.02):
        """
        Ajoute un peu de bruit à l'image (plus réaliste)
        
        Args:
            ndvi: image NDVI
            niveau_bruit: écart-type du bruit à ajouter
            
        Returns:
            ndvi_bruitee: image avec bruit
        """
        bruit = np.random.normal(0, niveau_bruit, ndvi.shape)
        ndvi_bruitee = ndvi + bruit
        return np.clip(ndvi_bruitee, -1, 1)
    
    def calculate_infected_area(self, ndvi, seuil=0.3):
        """
        Calcule la surface infectée à partir de l'image NDVI
        
        Args:
            ndvi: image NDVI
            seuil: valeur en dessous de laquelle on considère comme malade
            
        Returns:
            dict: résultats
        """
        # 1. Créer un masque des pixels malades (True si malade)
        masque_malade = ndvi < seuil
        
        # 2. Compter le nombre de pixels malades
        pixels_malades = np.sum(masque_malade)
        pixels_total = ndvi.shape[0] * ndvi.shape[1]
        
        # 3. Calculer le pourcentage
        pourcentage_malade = (pixels_malades / pixels_total) * 100
        
        # 4. Estimer la surface en hectares
        # Notre image simulée fait 100x100 pixels
        # Si on suppose que chaque pixel représente 10m x 10m (100 m²)
        # Alors 1 pixel = 0.01 hectare
        surface_par_pixel_ha = 0.01
        surface_malade_ha = pixels_malades * surface_par_pixel_ha
        
        # 5. Résultats
        resultats = {
            'pixels_malades': pixels_malades,
            'pixels_total': pixels_total,
            'pourcentage_malade': pourcentage_malade,
            'surface_malade_ha': surface_malade_ha,
            'masque': masque_malade
        }
        
        logger.info(f"📊 Analyse:")
        logger.info(f"   Pixels malades: {pixels_malades}/{pixels_total} ({pourcentage_malade:.1f}%)")
        logger.info(f"   Surface estimée: {surface_malade_ha:.2f} hectares")
        
        return resultats
    
    def plot_ndvi(self, ndvi, masque=None, titre="Image NDVI"):
        """
        Affiche l'image NDVI et optionnellement le masque
        
        Args:
            ndvi: image NDVI
            masque: masque des zones malades (optionnel)
            titre: titre du graphique
        """
        fig, axes = plt.subplots(1, 2 if masque is not None else 1, figsize=(12, 5))
        
        # Si on a qu'un seul graphique
        if masque is None:
            im = axes.imshow(ndvi, cmap='RdYlGn', vmin=-0.5, vmax=1)
            axes.set_title(titre)
            axes.set_xlabel('Pixels')
            axes.set_ylabel('Pixels')
            plt.colorbar(im, ax=axes, label='NDVI')
        else:
            # Premier graphique : NDVI
            im1 = axes[0].imshow(ndvi, cmap='RdYlGn', vmin=-0.5, vmax=1)
            axes[0].set_title('NDVI')
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
        
        # Sauvegarde
        output_path = Path(self.config['outputs']['save_path'])
        output_path.mkdir(parents=True, exist_ok=True)
        plt.savefig(output_path / 'simulation_ndvi.png', dpi=150)
        plt.show()
        
        logger.info(f"✅ Graphique sauvegardé dans {output_path / 'simulation_ndvi.png'}")

# Pour tester le module tout seul
if __name__ == "__main__":
    print("="*50)
    print("🧪 TEST DU SIMULATEUR SATELLITE")
    print("="*50)
    
    # Configuration minimale pour le test
    config_test = {
        'outputs': {
            'save_path': './data/outputs'
        }
    }
    
    # Créer le simulateur
    sim = SatelliteSimulator(config_test)
    
    # Générer une image avec maladies
    ndvi = sim.generate_ndvi_image(avec_maladies=True)
    
    # Ajouter un peu de bruit
    ndvi = sim.add_noise(ndvi, 0.02)
    
    # Analyser
    resultats = sim.calculate_infected_area(ndvi, seuil=0.3)
    
    # Afficher
    sim.plot_ndvi(ndvi, resultats['masque'], "Simulation NDVI avec zones malades")
    
    print("\n✅ Test terminé !")