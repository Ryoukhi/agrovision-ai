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
        'plants_per_ha': p.plants_per_ha,
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

@parcelles_bp.route('/<int:parcelle_id>', methods=['PUT'])
@jwt_required()
def update_parcelle(parcelle_id):
    current_user_id = get_jwt_identity()
    parcelle = Parcelle.query.filter_by(id=parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Parcelle non trouvée'}), 404

    data = request.get_json() or {}
    if 'nom' in data:
        parcelle.nom = data['nom']
    if 'culture' in data:
        parcelle.culture = data['culture']
    if 'plants_per_ha' in data:
        try:
            plants = int(data['plants_per_ha'])
            if plants <= 0:
                return jsonify({'error': 'plants_per_ha doit être positif'}), 400
            parcelle.plants_per_ha = plants
        except Exception:
            return jsonify({'error': 'plants_per_ha invalide'}), 400
    if 'surface_ha' in data:
        try:
            surface = float(data['surface_ha'])
            if surface <= 0:
                return jsonify({'error': 'surface_ha doit être positif'}), 400
            parcelle.surface_ha = surface
        except Exception:
            return jsonify({'error': 'surface_ha invalide'}), 400

    # Mise à jour des coordonnées
    coord_fields = ['long_min','lat_min','long_max','lat_max']
    if all(field in data for field in coord_fields):
        try:
            long_min = float(data['long_min'])
            lat_min = float(data['lat_min'])
            long_max = float(data['long_max'])
            lat_max = float(data['lat_max'])
            if long_min >= long_max or lat_min >= lat_max:
                return jsonify({'error': 'Coordonnées incohérentes'}), 400
            parcelle.long_min = long_min
            parcelle.lat_min = lat_min
            parcelle.long_max = long_max
            parcelle.lat_max = lat_max
        except Exception:
            return jsonify({'error': 'Coordonnées invalides'}), 400

    db.session.commit()
    return jsonify({'message': 'Parcelle mise à jour avec succès'}), 200

@parcelles_bp.route('/<int:parcelle_id>', methods=['DELETE'])
@jwt_required()
def delete_parcelle(parcelle_id):
    current_user_id = get_jwt_identity()
    parcelle = Parcelle.query.filter_by(id=parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Parcelle non trouvée'}), 404

    db.session.delete(parcelle)
    db.session.commit()
    return jsonify({'message': 'Parcelle supprimée avec succès'}), 200