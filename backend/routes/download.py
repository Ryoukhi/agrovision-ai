"""
Routes de téléchargement des fichiers
"""

from flask import Blueprint, send_file, jsonify, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import Analyse, Parcelle
import os

download_bp = Blueprint('download', __name__, url_prefix='/api/download')

@download_bp.route('/analyse/<int:analyse_id>/rapport')
@jwt_required()
def download_rapport(analyse_id):
    """Télécharge le rapport JSON d'une analyse"""
    current_user_id = get_jwt_identity()
    
    analyse = Analyse.query.get(analyse_id)
    if not analyse:
        return jsonify({'error': 'Analyse non trouvée'}), 404
    
    # Vérifier l'accès
    parcelle = Parcelle.query.filter_by(id=analyse.parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Accès non autorisé'}), 403
    
    # Chercher le rapport dans data/outputs
    import glob
    import os
    
    reports = glob.glob(f"../data/outputs/rapport_{analyse_id}_*.json")
    if not reports:
        return jsonify({'error': 'Rapport non trouvé'}), 404
    
    return send_file(reports[0], as_attachment=True, download_name=f"rapport_{analyse_id}.json")

@download_bp.route('/analyse/<int:analyse_id>/image/<type>')
@jwt_required()
def download_image(analyse_id, type):
    """Télécharge une image (NDVI ou multi)"""
    current_user_id = get_jwt_identity()
    
    analyse = Analyse.query.get(analyse_id)
    if not analyse:
        return jsonify({'error': 'Analyse non trouvée'}), 404
    
    # Vérifier l'accès
    parcelle = Parcelle.query.filter_by(id=analyse.parcelle_id, user_id=current_user_id).first()
    if not parcelle:
        return jsonify({'error': 'Accès non autorisé'}), 403
    
    if type == 'ndvi' and analyse.image_ndvi_path:
        return send_file(analyse.image_ndvi_path, as_attachment=True, download_name=f"ndvi_{analyse_id}.png")
    elif type == 'multi' and analyse.image_multi_path:
        return send_file(analyse.image_multi_path, as_attachment=True, download_name=f"multi_{analyse_id}.png")
    elif type == 'rgb' and getattr(analyse, 'image_rgb_path', None):
        return send_file(analyse.image_rgb_path, as_attachment=True, download_name=f"rgb_{analyse_id}.png")
    else:
        return jsonify({'error': 'Image non trouvée'}), 404