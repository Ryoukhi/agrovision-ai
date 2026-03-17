"""
Routes de gestion des analyses
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from models import Parcelle, Analyse
import json
from datetime import datetime
import os
from sqlalchemy import inspect

# Importer le service d'analyse
from services.analyse_service import AnalyseService

analyses_bp = Blueprint('analyses', __name__, url_prefix='/api/analyses')

# Instance unique du service (à mettre dans app.py plus tard)
analyse_service = AnalyseService()

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
        'action_recommandee': a.action_recommandee
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
    
    result = {
        'id': analyse.id,
        'date_analyse': analyse.date_analyse.isoformat(),
        'date_image_satellite': analyse.date_image_satellite,
        'taux_infection': analyse.taux_infection,
        'surface_infectee_ha': analyse.surface_infectee_ha,
        'plants_infectes': analyse.plants_infectes,
        'temperature_moyenne': analyse.temperature_moyenne,
        'humidite_moyenne': analyse.humidite_moyenne,
        'vent_moyen': analyse.vent_moyen,
        'risque': analyse.risque,
        'evolution_7j': analyse.evolution_7j,
        'plants_infectes_7j': analyse.plants_infectes_7j,
        'action_recommandee': analyse.action_recommandee,
        'image_ndvi_path': analyse.image_ndvi_path,
        'image_multi_path': analyse.image_multi_path,
        'parcelle_id': analyse.parcelle_id
    }
    insp = inspect(db.engine)
    cols = [c['name'] for c in insp.get_columns('analyses')]
    if 'zone_type' in cols:
        result['zone_type'] = analyse.zone_type
    if 'zone_warning' in cols:
        result['zone_warning'] = analyse.zone_warning
    if 'zone_confidence' in cols:
        result['zone_confidence'] = analyse.zone_confidence
    return jsonify(result), 200

@analyses_bp.route('/parcelle/<int:parcelle_id>/run', methods=['POST'])
@jwt_required()
def run_analyse(parcelle_id):
    """Déclenche une nouvelle analyse pour une parcelle avec le vrai moteur IA"""
    current_user_id = get_jwt_identity()
    
    parcelle = Parcelle.query.filter_by(id=parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Parcelle non trouvée'}), 404

    try:
        result = analyse_service.run_analyse(parcelle)
        analyse_kwargs = {
            'parcelle_id': parcelle_id,
            'date_analyse': datetime.fromisoformat(result['date_analyse']),
            'date_image_satellite': result['date_image_satellite'],
            'taux_infection': result['taux_infection'],
            'surface_infectee_ha': result['surface_infectee_ha'],
            'plants_infectes': result['plants_infectes'],
            'temperature_moyenne': result['temperature_moyenne'],
            'humidite_moyenne': result['humidite_moyenne'],
            'vent_moyen': result['vent_moyen'],
            'risque': result['risque'],
            'evolution_7j': result['evolution_7j'],
            'plants_infectes_7j': result['plants_infectes_7j'],
            'action_recommandee': result['action_recommandee'],
            'image_ndvi_path': result['image_ndvi_path'],
            'image_multi_path': result['image_multi_path']
        }
        insp = inspect(db.engine)
        cols = [c['name'] for c in insp.get_columns('analyses')]
        if 'zone_type' in cols:
            analyse_kwargs['zone_type'] = result.get('zone_type', 'unknown')
        if 'zone_warning' in cols:
            analyse_kwargs['zone_warning'] = result.get('zone_warning')
        if 'zone_confidence' in cols:
            analyse_kwargs['zone_confidence'] = result.get('zone_confidence', 0.0)

        nouvelle_analyse = Analyse(**analyse_kwargs)
        db.session.add(nouvelle_analyse)
        db.session.commit()
        return jsonify({
            'message': 'Analyse lancée avec succès',
            'analyse_id': nouvelle_analyse.id,
            'result': result
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# Route pour télécharger les images
@analyses_bp.route('/<int:analyse_id>/image/<type>', methods=['GET'])
@jwt_required()
def get_image(analyse_id, type):
    """Récupère une image d'analyse (NDVI ou multi)"""
    current_user_id = get_jwt_identity()
    
    analyse = Analyse.query.get(analyse_id)
    if not analyse:
        return jsonify({'error': 'Analyse non trouvée'}), 404
    
    # Vérifier l'accès
    parcelle = Parcelle.query.filter_by(id=analyse.parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Accès non autorisé'}), 403
    
    # Déterminer le chemin
    if type == 'ndvi':
        path = analyse.image_ndvi_path
    elif type == 'multi':
        path = analyse.image_multi_path
    else:
        return jsonify({'error': 'Type d\'image invalide'}), 400
    
    if not path:
        return jsonify({'error': f'Chemin image {type} non disponible (analyse en cours ou échouée)'}), 404
    
    # Convertir en chemin absolu si nécessaire
    full_path = os.path.abspath(path)
    
    if not os.path.exists(full_path):
        return jsonify({
            'error': f'Fichier image non trouvé: {full_path}',
            'stored_path': path
        }), 404
    
    from flask import send_file
    return send_file(full_path, mimetype='image/png')