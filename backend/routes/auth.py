"""
Routes d'authentification
Inscription, connexion, rafraîchissement de token
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from extensions import db, bcrypt
from models import User
import re
import string
import random
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

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

@auth_bp.route('/google', methods=['POST'])
def google_auth():
    """Authentification via Google OAuth2"""
    data = request.get_json()
    token = data.get('token')
    
    if not token:
        return jsonify({'error': 'Token manquant'}), 400
        
    try:
        # Vérifier le token auprès de Google
        # Si vous décommentez le config de client_id => id_token.verify_oauth2_token(token, google_requests.Request(), client_id='VOTRE_WEB_CLIENT_ID')
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request()
        )
        
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Mauvais émetteur.')
            
        email = idinfo['email']
        # Utiliser le nom complet ou le début de l'email comme nom d'utilisateur
        username = idinfo.get('name', email.split('@')[0])
        
        user = User.query.filter_by(email=email).first()
        
        if not user:
            # S'il y a conflit de nom d'utilisateur, on ajoute un nombre aléatoire
            existing_username = User.query.filter_by(username=username).first()
            if existing_username:
                username = f"{username}_{random.randint(1000, 9999)}"

            # Générer un mot de passe aléatoire (L'utilisateur se connectera toujours via Google)
            random_password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
            hashed_password = bcrypt.generate_password_hash(random_password).decode('utf-8')
            
            user = User(
                username=username,
                email=email,
                password_hash=hashed_password
            )
            db.session.add(user)
            db.session.commit()
            
        access_token = create_access_token(identity=str(user.id))
        
        return jsonify({
            'message': 'Connexion Google réussie',
            'access_token': access_token,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        }), 200

    except ValueError as e:
        return jsonify({'error': 'Token Google invalide ou expiré'}), 401
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500