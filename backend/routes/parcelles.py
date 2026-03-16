"""
Routes de gestion des parcelles
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from models import Parcelle, User

parcelles_bp = Blueprint('parcelles', __name__, url_prefix='/api/parcelles')

@parcelles_bp.route('/', methods=['GET'])
@jwt_required()
def get_parcelles():
    """Récupère toutes les parcelles de l'utilisateur"""
    current_user_id = get_jwt_identity()
    parcelles = Parcelle.query.filter_by(user_id=current_user_id).all()
    
    return jsonify([{
        'id': p.id,
        'nom': p.nom,
        'surface_ha': p.surface_ha,
        'culture': p.culture,
        'created_at': p.created_at.isoformat(),
        'long_min': p.long_min,
        'lat_min': p.lat_min,
        'long_max': p.long_max,
        'lat_max': p.lat_max,
        'coords': {
            'long_min': p.long_min,
            'lat_min': p.lat_min,
            'long_max': p.long_max,
            'lat_max': p.lat_max
        }
    } for p in parcelles]), 200

@parcelles_bp.route('/', methods=['POST'])
@jwt_required()
def create_parcelle():
    """Crée une nouvelle parcelle"""
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    # Vérifier les champs requis
    required_fields = ['nom', 'long_min', 'lat_min', 'long_max', 'lat_max', 'surface_ha']
    if not all(k in data for k in required_fields):
        return jsonify({'error': 'Champs requis manquants'}), 400
    
    # Vérifier la cohérence des coordonnées
    if data['long_min'] >= data['long_max'] or data['lat_min'] >= data['lat_max']:
        return jsonify({'error': 'Coordonnées incohérentes'}), 400
    
    # Vérifier que la surface est positive et raisonnable
    if data['surface_ha'] <= 0 or data['surface_ha'] > 10000:
        return jsonify({'error': 'Surface invalide (doit être entre 0 et 10000 ha)'}), 400
    
    # Vérifier que les coordonnées sont dans des limites plausibles
    if abs(data['lat_min']) > 90 or abs(data['lat_max']) > 90:
        return jsonify({'error': 'Latitude invalide'}), 400
    
    if abs(data['long_min']) > 180 or abs(data['long_max']) > 180:
        return jsonify({'error': 'Longitude invalide'}), 400
    
    # Créer la parcelle
    nouvelle_parcelle = Parcelle(
        nom=data['nom'],
        long_min=data['long_min'],
        lat_min=data['lat_min'],
        long_max=data['long_max'],
        lat_max=data['lat_max'],
        surface_ha=data['surface_ha'],
        plants_per_ha=data.get('plants_per_ha', 10000),
        culture=data.get('culture', 'manioc'),
        user_id=current_user_id
    )
    
    try:
        db.session.add(nouvelle_parcelle)
        db.session.commit()
        
        return jsonify({
            'message': 'Parcelle créée avec succès',
            'parcelle': {
                'id': nouvelle_parcelle.id,
                'nom': nouvelle_parcelle.nom
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500