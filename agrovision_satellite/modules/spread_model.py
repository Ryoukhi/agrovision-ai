"""
Modèle de propagation des maladies
Basé sur un modèle SEIR simplifié (Susceptible - Exposed - Infected - Removed)
"""

import numpy as np
import pandas as pd
import logging
from scipy.integrate import odeint

logger = logging.getLogger(__name__)

class EpidemiologicalModel:
    """
    Modèle épidémiologique pour prédire la propagation des maladies
    """
    
    def __init__(self, config=None):
        """
        Initialise le modèle avec des paramètres par défaut
        
        Args:
            config: configuration optionnelle
        """
        # Paramètres du modèle (valeurs par défaut)
        self.params = {
            'beta': 0.3,    # Taux de transmission (contact entre plants)
            'sigma': 0.2,   # Taux d'incubation (vitesse d'apparition des symptômes)
            'gamma': 0.1,   # Taux de guérison (plantes qui deviennent résistantes)
            'mu': 0.01      # Taux de mortalité dû à la maladie
        }
        
        # Facteurs météo (seront ajustés)
        self.weather_factors = {
            'temperature': 1.0,
            'humidity': 1.0,
            'wind': 1.0
        }
        
        logger.info("✅ Modèle épidémiologique initialisé")
    
    def adjust_for_weather(self, weather_data):
        """
        Ajuste les paramètres du modèle selon la météo
        
        Args:
            weather_data: dictionnaire avec température, humidité, vent
        """
        temp = weather_data.get('temperature', 25)
        humidite = weather_data.get('humidite', 70)
        vent = weather_data.get('vent', 5)
        
        # Facteur température (optimal vers 25°C)
        # Formule: exp(-((T-25)/10)^2) donne une courbe en cloche
        temp_factor = np.exp(-((temp - 25) / 10) ** 2)
        temp_factor = max(0.3, min(1.5, temp_factor))
        
        # Facteur humidité (optimal vers 70%)
        hum_factor = humidite / 70
        hum_factor = max(0.5, min(1.5, hum_factor))
        
        # Facteur vent (plus de vent = plus de propagation)
        wind_factor = 1 + 0.05 * vent
        wind_factor = max(1.0, min(1.5, wind_factor))
        
        # Sauvegarder les facteurs
        self.weather_factors = {
            'temperature': temp_factor,
            'humidity': hum_factor,
            'wind': wind_factor
        }
        
        # Ajuster beta (taux de transmission)
        beta_original = self.params['beta']
        self.params['beta'] = beta_original * temp_factor * hum_factor * wind_factor
        
        logger.info(f"🌡️ Facteurs météo appliqués:")
        logger.info(f"   Température: x{temp_factor:.2f}")
        logger.info(f"   Humidité: x{hum_factor:.2f}")
        logger.info(f"   Vent: x{wind_factor:.2f}")
        logger.info(f"   Nouveau beta: {self.params['beta']:.3f} (original: {beta_original:.3f})")
    
    def seir_model(self, y, t):
        """
        Modèle SEIR (Susceptible - Exposed - Infected - Removed)
        
        C'est un système d'équations différentielles qui décrit comment
        une population évolue dans le temps.
        
        Args:
            y: état actuel [S, E, I, R]
            t: temps (pas utilisé directement mais nécessaire pour odeint)
            
        Returns:
            dydt: dérivées (vitesse de changement)
        """
        S, E, I, R = y
        beta, sigma, gamma, mu = self.params.values()
        N = S + E + I + R  # Population totale
        
        # Équations différentielles
        dSdt = -beta * S * I / N  # Les plantes saines deviennent exposées
        dEdt = beta * S * I / N - sigma * E  # Les exposées deviennent infectées
        dIdt = sigma * E - gamma * I - mu * I  # Les infectées guérissent ou meurent
        dRdt = gamma * I  # Les guéries (ou devenues résistantes)
        
        return [dSdt, dEdt, dIdt, dRdt]
    
    def predict_spread(self, population_totale, infectes_initiaux, jours=30):
        """
        Prédit l'évolution de la maladie
        
        Args:
            population_totale: nombre total de plants dans la parcelle
            infectes_initiaux: nombre de plants actuellement infectés
            jours: nombre de jours de prédiction
            
        Returns:
            pandas.DataFrame: évolution quotidienne
        """
        logger.info(f"📈 Prédiction sur {jours} jours...")
        
        # Conditions initiales
        I0 = infectes_initiaux
        E0 = I0 * 0.5  # Estimation: moitié des infectés sont en incubation
        R0 = 0
        S0 = population_totale - I0 - E0 - R0
        
        y0 = [S0, E0, I0, R0]
        t = np.linspace(0, jours, jours)
        
        # Résoudre les équations différentielles
        solution = odeint(self.seir_model, y0, t)
        
        # Créer un DataFrame avec les résultats
        df = pd.DataFrame(solution, columns=['Sains', 'Exposes', 'Infectes', 'Retires'])
        df['Jour'] = range(jours)
        df['Total_infectes'] = df['Exposes'] + df['Infectes']
        
        # Arrondir pour que ce soit des nombres entiers (on ne peut pas avoir 0.5 plant)
        for col in ['Sains', 'Exposes', 'Infectes', 'Retires', 'Total_infectes']:
            df[col] = df[col].round().astype(int)
        
        logger.info(f"✅ Prédiction terminée")
        
        return df
    
    def calculate_risk(self, df, jours_a_venir=7):
        """
        Calcule le niveau de risque à partir des prédictions
        
        Args:
            df: DataFrame retourné par predict_spread()
            jours_a_venir: nombre de jours pour évaluer le risque
            
        Returns:
            dict: niveau de risque et recommandations
        """
        # Infectés aujourd'hui
        infectes_maintenant = df['Infectes'].iloc[0]
        
        # Infectés prévus dans X jours
        infectes_futur = df['Infectes'].iloc[jours_a_venir - 1]
        
        # Taux d'augmentation
        augmentation = (infectes_futur - infectes_maintenant) / max(infectes_maintenant, 1)
        
        # Déterminer le niveau de risque
        if augmentation < 0.2:
            niveau = "FAIBLE"
            couleur = "🟢"
            action = "Surveillance normale - Pas d'action urgente"
        elif augmentation < 0.5:
            niveau = "MODÉRÉ"
            couleur = "🟡"
            action = "Surveillance renforcée - Préparez des traitements"
        elif augmentation < 1.0:
            niveau = "ÉLEVÉ"
            couleur = "🟠"
            action = "Intervention recommandée - Traitez les zones infectées"
        else:
            niveau = "CRITIQUE"
            couleur = "🔴"
            action = "INTERVENTION URGENTE - Traitement immédiat et quarantaine"
        
        resultat = {
            'niveau': niveau,
            'couleur': couleur,
            'augmentation': augmentation,
            'infectes_maintenant': infectes_maintenant,
            'infectes_futur': infectes_futur,
            'action': action,
            'facteurs_meteo': self.weather_factors
        }
        
        return resultat
    
    def plot_prediction(self, df, show=False):
        """
        Affiche le graphique de prédiction
        
        Args:
            df: DataFrame retourné par predict_spread()
            show: afficher le graphique (si True)
        """
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        
        # Graphique 1: Évolution des catégories
        ax = axes[0]
        ax.plot(df['Jour'], df['Sains'], 'g-', label='Sains', linewidth=2)
        ax.plot(df['Jour'], df['Exposes'], 'orange', label='Exposés', linewidth=2)
        ax.plot(df['Jour'], df['Infectes'], 'r-', label='Infectés', linewidth=2)
        ax.plot(df['Jour'], df['Retires'], 'gray', label='Retirés', linewidth=2)
        ax.set_xlabel('Jours')
        ax.set_ylabel('Nombre de plants')
        ax.set_title('Évolution de la population')
        ax.legend()
        ax.grid(True, alpha=0.3)
        
        # Graphique 2: Total des infectés
        ax = axes[1]
        ax.plot(df['Jour'], df['Total_infectes'], 'r-', linewidth=3)
        ax.fill_between(df['Jour'], 0, df['Total_infectes'], alpha=0.3, color='red')
        ax.set_xlabel('Jours')
        ax.set_ylabel('Nombre de plants infectés')
        ax.set_title('Total des infectés (exposés + infectés)')
        ax.grid(True, alpha=0.3)
        
        # Ajouter une ligne verticale pour aujourd'hui
        ax.axvline(x=0, color='blue', linestyle='--', alpha=0.7, label='Aujourd\'hui')
        ax.legend()
        
        plt.tight_layout()
        if show:
            plt.show()
        plt.close(fig)

# Test du module
if __name__ == "__main__":
    print("="*50)
    print("🧪 TEST DU MODÈLE ÉPIDÉMIOLOGIQUE")
    print("="*50)
    
    # Créer le modèle
    modele = EpidemiologicalModel()
    
    # Simuler des conditions météo
    weather_test = {
        'temperature': 28,
        'humidite': 80,
        'vent': 8
    }
    
    # Ajuster selon la météo
    print("\n🌡️ Ajustement météo...")
    modele.adjust_for_weather(weather_test)
    
    # Prédire
    print("\n📈 Prédiction...")
    population = 10000  # 10 000 plants
    infectes = 500      # 500 déjà infectés
    df = modele.predict_spread(population, infectes, jours=60)
    
    # Afficher les premiers jours
    print("\n📊 Premiers 10 jours:")
    print(df[['Jour', 'Sains', 'Exposes', 'Infectes', 'Retires']].head(10).to_string(index=False))
    
    # Calculer le risque
    risque = modele.calculate_risk(df, 7)
    print(f"\n⚠️ Risque à 7 jours: {risque['couleur']} {risque['niveau']}")
    print(f"   Augmentation: +{risque['augmentation']*100:.0f}%")
    print(f"   Action: {risque['action']}")
    
    # Afficher le graphique
    modele.plot_prediction(df)