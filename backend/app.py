"""""
AgroVision AI - API Backend
Point d'entrée principal de l'application Flask
"""

import os
from flask import Flask, jsonify
from dotenv import load_dotenv

from extensions import db, migrate, jwt, bcrypt

# Charger les variables d'environnement
load_dotenv()


def create_app():
    """Fabrique d'application Flask"""
    app = Flask(__name__)

    # Configuration (prioritize DATABASE_URL for flexibility)
    db_uri = os.getenv('DATABASE_URL')
    if not db_uri:
        db_user = os.getenv('DB_USER')
        db_pass = os.getenv('DB_PASSWORD')
        db_host = os.getenv('DB_HOST', 'localhost')
        db_port = os.getenv('DB_PORT', '5432')
        db_name = os.getenv('DB_NAME')
        if db_user and db_pass and db_name:
            db_uri = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
        else:
            # Dev fallback to local sqlite
            db_uri = 'sqlite:///agrovision.db'

    app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'dev-secret')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', 86400))

    # Initialiser les extensions avec l'app
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)

    # Importer les routes après l'initialisation pour éviter les importations circulaires
    from routes.auth import auth_bp
    from routes.parcelles import parcelles_bp
    from routes.analyses import analyses_bp
    from routes.download import download_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(parcelles_bp)
    app.register_blueprint(analyses_bp)
    app.register_blueprint(download_bp)

    # Route de test
    @app.route('/')
    def home():
        return jsonify({
            'message': 'Bienvenue sur l\'API AgroVision AI',
            'status': 'ok'
        })

    @app.route('/health')
    def health():
        return jsonify({
            'status': 'healthy',
            'database': 'connected' if db.engine else 'error'
        })

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)
