"""
Routes d'authentification
Inscription, connexion, rafraîchissement de token
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from extensions import db, bcrypt
from models import User
import re

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def validate_email(email):
    """Valide le format d'email"""
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    return re.match(pattern, email) is not None

@auth_bp.route('/register', methods=['POST'])
def register():
    """Inscription d'un nouvel utilisateur"""
    data = request.get_json()
    
    # Vérifier les champs requis
    if not all(k in data for k in ('username', 'email', 'password')):
        return jsonify({'error': 'Champs requis manquants'}), 400
    
    # Valider l'email
    if not validate_email(data['email']):
        return jsonify({'error': 'Format d\'email invalide'}), 400
    
    # Vérifier si l'utilisateur existe déjà
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Nom d\'utilisateur déjà pris'}), 409
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email déjà utilisé'}), 409
    
    # Créer le nouvel utilisateur
    hashed_password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    new_user = User(
        username=data['username'],
        email=data['email'],
        password_hash=hashed_password
    )
    
    try:
        db.session.add(new_user)
        db.session.commit()
        
        return jsonify({
            'message': 'Utilisateur créé avec succès',
            'user': {
                'id': new_user.id,
                'username': new_user.username,
                'email': new_user.email
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """Connexion utilisateur"""
    data = request.get_json()
    
    if not all(k in data for k in ('username', 'password')):
        return jsonify({'error': 'Username et password requis'}), 400
    
    # Chercher l'utilisateur
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not bcrypt.check_password_hash(user.password_hash, data['password']):
        return jsonify({'error': 'Nom d\'utilisateur ou mot de passe incorrect'}), 401
    
    # Créer le token JWT
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        'message': 'Connexion réussie',
        'access_token': access_token,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email
        }
    }), 200

@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def profile():
    """Récupère le profil de l'utilisateur connecté"""
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    return jsonify({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'created_at': user.created_at.isoformat(),
        'nb_parcelles': len(user.parcelles)
    }), 200