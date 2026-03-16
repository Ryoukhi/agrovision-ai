"""
Routes de gestion des analyses
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import Parcelle, Analyse
import subprocess
import json
from datetime import datetime
import os

analyses_bp = Blueprint('analyses', __name__, url_prefix='/api/analyses')

@analyses_bp.route('/parcelle/<int:parcelle_id>', methods=['GET'])
@jwt_required()
def get_analyses_parcelle(parcelle_id):
    """Récupère toutes les analyses d'une parcelle"""
    current_user_id = get_jwt_identity()
    
    # Vérifier que la parcelle appartient à l'utilisateur
    parcelle = Parcelle.query.filter_by(id=parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Parcelle non trouvée'}), 404
    
    analyses = Analyse.query.filter_by(parcelle_id=parcelle_id).order_by(Analyse.date_analyse.desc()).all()
    
    return jsonify([{
        'id': a.id,
        'date_analyse': a.date_analyse.isoformat(),
        'taux_infection': a.taux_infection,
        'risque': a.risque,
        'action': a.action_recommandee
    } for a in analyses]), 200

@analyses_bp.route('/<int:analyse_id>', methods=['GET'])
@jwt_required()
def get_analyse(analyse_id):
    """Récupère une analyse spécifique avec tous ses détails"""
    current_user_id = get_jwt_identity()
    
    analyse = Analyse.query.get(analyse_id)
    if not analyse:
        return jsonify({'error': 'Analyse non trouvée'}), 404
    
    # Vérifier que l'utilisateur a accès à cette analyse
    parcelle = Parcelle.query.filter_by(id=analyse.parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Accès non autorisé'}), 403
    
    return jsonify({
        'id': analyse.id,
        'date_analyse': analyse.date_analyse.isoformat(),
        'date_image_satellite': analyse.date_image_satellite,
        'resultats': {
            'taux_infection': analyse.taux_infection,
            'surface_infectee_ha': analyse.surface_infectee_ha,
            'plants_infectes': analyse.plants_infectes
        },
        'meteo': {
            'temperature': analyse.temperature_moyenne,
            'humidite': analyse.humidite_moyenne,
            'vent': analyse.vent_moyen
        },
        'prediction': {
            'risque': analyse.risque,
            'evolution_7j': analyse.evolution_7j,
            'plants_infectes_7j': analyse.plants_infectes_7j,
            'action': analyse.action_recommandee
        },
        'fichiers': {
            'rapport_json': analyse.rapport_json_path,
            'image_ndvi': analyse.image_ndvi_path,
            'image_multi': analyse.image_multi_path
        }
    }), 200

@analyses_bp.route('/parcelle/<int:parcelle_id>/run', methods=['POST'])
@jwt_required()
def run_analyse(parcelle_id):
    """Déclenche une nouvelle analyse pour une parcelle"""
    current_user_id = get_jwt_identity()
    
    # Vérifier la parcelle
    parcelle = Parcelle.query.filter_by(id=parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Parcelle non trouvée'}), 404
    
    # Ici, on appellera ton moteur IA existant
    # Pour l'instant, on simule une analyse
    from datetime import timedelta
    import random
    
    # Simulation de résultats (à remplacer par l'appel réel)
    nouvelle_analyse = Analyse(
        parcelle_id=parcelle_id,
        date_image_satellite='2026-01-12',
        taux_infection=round(random.uniform(0.5, 5.0), 1),
        surface_infectee_ha=parcelle.surface_ha * random.uniform(0.005, 0.05),
        plants_infectes=int(parcelle.surface_ha * parcelle.plants_per_ha * random.uniform(0.005, 0.05)),
        temperature_moyenne=round(random.uniform(22, 28), 1),
        humidite_moyenne=random.randint(60, 85),
        vent_moyen=round(random.uniform(1.0, 3.0), 1),
        risque=random.choice(['FAIBLE', 'MODÉRÉ', 'ÉLEVÉ']),
        evolution_7j=round(random.uniform(-10, 30), 1),
        plants_infectes_7j=int(parcelle.surface_ha * parcelle.plants_per_ha * random.uniform(0.01, 0.08)),
        action_recommandee="Surveillance normale" if random.random() > 0.5 else "Intervention recommandée"
    )
    
    try:
        db.session.add(nouvelle_analyse)
        db.session.commit()
        
        return jsonify({
            'message': 'Analyse lancée avec succès',
            'analyse_id': nouvelle_analyse.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500