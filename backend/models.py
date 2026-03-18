"""
Modèles SQLAlchemy pour la base de données
"""

from extensions import db
from datetime import datetime

class User(db.Model):
    """Modèle utilisateur"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relation avec les parcelles (un utilisateur peut avoir plusieurs parcelles)
    parcelles = db.relationship('Parcelle', backref='proprietaire', lazy=True)
    
    def __repr__(self):
        return f'<User {self.username}>'

class Parcelle(db.Model):
    """Modèle parcelle agricole"""
    __tablename__ = 'parcelles'
    
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(100), nullable=False)
    
    # Coordonnées géographiques
    long_min = db.Column(db.Float, nullable=False)
    lat_min = db.Column(db.Float, nullable=False)
    long_max = db.Column(db.Float, nullable=False)
    lat_max = db.Column(db.Float, nullable=False)
    
    # Caractéristiques
    surface_ha = db.Column(db.Float, nullable=False)
    plants_per_ha = db.Column(db.Integer, default=10000)
    culture = db.Column(db.String(50), default='manioc')
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Relation avec les analyses
    analyses = db.relationship('Analyse', backref='parcelle', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<Parcelle {self.nom}>'

class Analyse(db.Model):
    """Modèle analyse (résultat d'une analyse satellite)"""
    __tablename__ = 'analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    date_analyse = db.Column(db.DateTime, default=datetime.utcnow)
    date_image_satellite = db.Column(db.String(20))  # Date de l'image utilisée
    
    # Résultats
    taux_infection = db.Column(db.Float)  # Pourcentage
    surface_infectee_ha = db.Column(db.Float)
    plants_infectes = db.Column(db.Integer)
    
    # Métriques météo
    temperature_moyenne = db.Column(db.Float)
    humidite_moyenne = db.Column(db.Integer)
    vent_moyen = db.Column(db.Float)
    
    # Prédiction
    risque = db.Column(db.String(20))  # FAIBLE, MODÉRÉ, ÉLEVÉ, CRITIQUE
    evolution_7j = db.Column(db.Float)  # Pourcentage
    plants_infectes_7j = db.Column(db.Integer)
    action_recommandee = db.Column(db.String(200))
    
    # Chemins des fichiers générés
    rapport_json_path = db.Column(db.String(200))
    image_ndvi_path = db.Column(db.String(200))
    image_multi_path = db.Column(db.String(200))
    image_rgb_path = db.Column(db.String(200), nullable=True)

    # Type de zone détectée
    zone_type = db.Column(db.String(50), default='unknown')
    zone_warning = db.Column(db.String(200), nullable=True)
    zone_confidence = db.Column(db.Float, default=0.0)
    
    # Relation
    parcelle_id = db.Column(db.Integer, db.ForeignKey('parcelles.id'), nullable=False)
    
    def __repr__(self):
        return f'<Analyse {self.id} - {self.date_analyse.strftime("%Y-%m-%d")}>'