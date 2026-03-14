"""
Module de récupération des données météo
Utilise l'API gratuite OpenWeatherMap
"""

import requests
import numpy as np
import logging
from datetime import datetime, timedelta
import time

logger = logging.getLogger(__name__)

class WeatherAPI:
    """
    Récupère les prévisions météo pour une localisation donnée
    """
    
    def __init__(self, api_key):
        """
        Initialise avec la clé API
        
        Args:
            api_key: ta clé personnelle OpenWeatherMap
        """
        self.api_key = api_key
        self.base_url = "http://api.openweathermap.org/data/2.5"
        logger.info("✅ Module météo initialisé")
    
    def get_forecast(self, lat, lon, jours=7):
        """
        Récupère les prévisions pour les prochains jours
        
        Args:
            lat: latitude (ex: 4.5 pour le Cameroun)
            lon: longitude (ex: 12.5)
            jours: nombre de jours de prévision (max 7 pour gratuit)
            
        Returns:
            list: liste de dictionnaires avec les prévisions quotidiennes
        """
        logger.info(f"🌍 Récupération météo pour lat={lat}, lon={lon}, {jours} jours")
        
        # Construction de l'URL de l'API
        url = f"{self.base_url}/forecast"
        params = {
            'lat': lat,
            'lon': lon,
            'appid': self.api_key,
            'units': 'metric',  # Pour avoir les degrés Celsius
            'lang': 'fr',        # Pour avoir les descriptions en français
            'cnt': jours * 8      # 8 prévisions par jour (toutes les 3h)
        }
        
        try:
            # Envoyer la requête à l'API
            logger.info("📡 Appel API OpenWeatherMap...")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()  # Déclenche une erreur si le code n'est pas 200
            
            # Convertir la réponse en dictionnaire Python
            data = response.json()
            
            # Vérifier que la réponse est valide
            if 'list' not in data:
                logger.error("❌ Réponse API invalide: pas de liste de prévisions")
                return self._get_dummy_forecast(jours)
            
            # Transformer les données
            previsions = self._process_forecast_data(data, jours)
            
            logger.info(f"✅ {len(previsions)} jours de prévisions récupérés")
            return previsions
            
        except requests.exceptions.ConnectionError:
            logger.error("❌ Pas de connexion Internet")
            return self._get_dummy_forecast(jours)
            
        except requests.exceptions.Timeout:
            logger.error("❌ Timeout - le serveur met trop de temps à répondre")
            return self._get_dummy_forecast(jours)
            
        except requests.exceptions.HTTPError as e:
            if response.status_code == 401:
                logger.error("❌ Clé API invalide ! Vérifie ta clé OpenWeatherMap")
            elif response.status_code == 404:
                logger.error("❌ Ville non trouvée")
            else:
                logger.error(f"❌ Erreur HTTP: {e}")
            return self._get_dummy_forecast(jours)
            
        except Exception as e:
            logger.error(f"❌ Erreur inattendue: {e}")
            return self._get_dummy_forecast(jours)
    
    def _process_forecast_data(self, data, jours):
        """
        Transforme les données brutes de l'API en un format plus simple
        
        Args:
            data: réponse brute de l'API
            jours: nombre de jours demandé
            
        Returns:
            list: prévisions simplifiées
        """
        previsions = []
        
        # L'API renvoie des prévisions toutes les 3h
        # On va regrouper par jour pour avoir une prévision quotidienne
        for i in range(jours):
            # Indices des prévisions pour ce jour (8 par jour)
            debut = i * 8
            fin = debut + 8
            
            # Extraire les prévisions du jour
            jour_data = data['list'][debut:fin]
            
            if not jour_data:
                continue
            
            # Calculer les moyennes du jour
            temp_min = min(item['main']['temp_min'] for item in jour_data)
            temp_max = max(item['main']['temp_max'] for item in jour_data)
            temp_moy = np.mean([item['main']['temp'] for item in jour_data])
            humidite_moy = np.mean([item['main']['humidity'] for item in jour_data])
            vent_moy = np.mean([item['wind']['speed'] for item in jour_data])
            
            # Trouver la description majoritaire
            descriptions = [item['weather'][0]['description'] for item in jour_data]
            description = max(set(descriptions), key=descriptions.count)
            
            # Créer la prévision du jour
            prevision = {
                'date': (datetime.now() + timedelta(days=i)).strftime('%Y-%m-%d'),
                'temperature_min': round(temp_min, 1),
                'temperature_max': round(temp_max, 1),
                'temperature': round(temp_moy, 1),
                'humidite': round(humidite_moy),
                'vent': round(vent_moy, 1),
                'description': description
            }
            
            previsions.append(prevision)
        
        return previsions
    
    def _get_dummy_forecast(self, jours):
        """
        Génère des prévisions fictives pour le développement
        (utilisé quand l'API n'est pas disponible)
        """
        logger.warning("⚠️ Utilisation de données météo simulées")
        
        previsions = []
        base_date = datetime.now()
        
        # Conditions météo possibles
        conditions = [
            "Ensoleillé", "Nuageux", "Légère pluie", "Venteux",
            "Orageux", "Couvert", "Brumes matinales"
        ]
        
        for i in range(jours):
            # Simuler une température qui varie légèrement
            temp_base = 25 + np.random.normal(0, 3)
            
            prevision = {
                'date': (base_date + timedelta(days=i)).strftime('%Y-%m-%d'),
                'temperature_min': round(temp_base - 3, 1),
                'temperature_max': round(temp_base + 3, 1),
                'temperature': round(temp_base, 1),
                'humidite': round(70 + np.random.normal(0, 10)),
                'vent': round(5 + np.random.normal(0, 2), 1),
                'description': np.random.choice(conditions)
            }
            
            previsions.append(prevision)
        
        return previsions
    
    def afficher_previsions(self, previsions):
        """
        Affiche les prévisions de façon lisible
        
        Args:
            previsions: liste retournée par get_forecast()
        """
        if not previsions:
            print("📭 Aucune prévision disponible")
            return
        
        print("\n" + "="*60)
        print("🌤️  PRÉVISIONS MÉTÉO - 7 JOURS")
        print("="*60)
        
        for prev in previsions:
            # Choisir une icône selon la météo
            if "pluie" in prev['description'].lower():
                icone = "🌧️"
            elif "nuage" in prev['description'].lower():
                icone = "☁️"
            elif "soleil" in prev['description'].lower() or "ensoleill" in prev['description'].lower():
                icone = "☀️"
            else:
                icone = "⛅"
            
            print(f"\n{icone}  {prev['date']} : {prev['description']}")
            print(f"   🌡️  {prev['temperature_min']}°C → {prev['temperature_max']}°C (moy: {prev['temperature']}°C)")
            print(f"   💧 Humidité: {prev['humidite']}%")
            print(f"   💨 Vent: {prev['vent']} m/s")

# Test du module si exécuté directement
if __name__ == "__main__":
    print("="*50)
    print("🧪 TEST DU MODULE MÉTÉO")
    print("="*50)
    
    # Configuration de test
    API_KEY = "ta_cle_ici"  # Remplace par ta vraie clé pour tester
    
    # Créer le client
    weather = WeatherAPI(API_KEY)
    
    # Tester avec les coordonnées du Cameroun (exemple)
    previsions = weather.get_forecast(4.5, 12.5, 7)
    
    # Afficher
    weather.afficher_previsions(previsions)