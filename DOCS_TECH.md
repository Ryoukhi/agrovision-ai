# Documentation Technique — AgroVision AI

AgroVision AI est une plateforme d'analyse satellite pour l'agriculture de précision, combinant imagerie Sentinel (optique + radar), détection non supervisée par Isolation Forest, classification des zones et modélisation épidémiologique SEIR.

---

## 1. Architecture globale

```
mobile/                          Application React Native (front-end)
  └── screens/AnalyseDetailScreen.tsx    Affichage des résultats

backend/                         API Flask (back-end)
  ├── app.py                     Point d'entrée, factory Flask
  ├── models.py                  Modèles SQLAlchemy (User, Parcelle, Analyse)
  ├── routes/                    Routes REST
  │   ├── auth.py                Authentification (JWT, Google OAuth)
  │   ├── parcelles.py           CRUD parcelles
  │   ├── analyses.py            Analyse + images
  │   └── download.py            Téléchargement rapports/images
  ├── services/
  │   └── analyse_service.py     Pont entre l'API et le moteur IA
  └── extensions.py              Initialisation Flask extensions

agrovision_satellite/            Moteur IA d'analyse satellite
  ├── analyse_engine.py          API publique du moteur (appelée par le backend)
  ├── main.py                    Pipeline CLI autonome
  ├── config.yaml                Configuration centrale
  └── modules/
      ├── satellite_real.py      Acquisition & analyse satellite réelle
      ├── satellite_simulator.py Simulateur NDVI (fallback)
      ├── weather_api.py         Client API OpenWeatherMap
      └── spread_model.py        Modèle épidémiologique SEIR
```

---

## 2. Backend — API Flask

### 2.1 Stack technique

| Composant | Technologie |
|---|---|
| Framework | Flask 2.x |
| ORM | SQLAlchemy + Alembic (Flask-Migrate) |
| Auth | Flask-JWT-Extended (JWT), Google OAuth2 |
| Hash | Flask-Bcrypt |
| Base de données | PostgreSQL (prod) / SQLite (dev) |

### 2.2 Modèles de données

#### User — `users`

| Champ | Type | Contraintes |
|---|---|---|
| `id` | Integer | PK auto |
| `username` | String(80) | Unique, NOT NULL |
| `email` | String(120) | Unique, NOT NULL |
| `password_hash` | String(128) | NOT NULL |
| `created_at` | DateTime | Default UTC now |
| `otp_code` | String(6) | Nullable |
| `otp_expiry` | DateTime | Nullable |

Relations : `parcelles` (one-to-many)

#### Parcelle — `parcelles`

| Champ | Type | Description |
|---|---|---|
| `id` | Integer | PK auto |
| `nom` | String(100) | Nom de la parcelle |
| `long_min`, `lat_min`, `long_max`, `lat_max` | Float | Bounding box WGS84 |
| `surface_ha` | Float | Surface en hectares |
| `plants_per_ha` | Integer | Densité de plantation |
| `culture` | String(50) | Type de culture (défaut: manioc) |
| `created_at` | DateTime | Timestamp création |
| `user_id` | FK→users.id | Propriétaire |

L'analyse utilise le centroïde du bounding box : `lat = (lat_min + lat_max) / 2, lon = (lon_min + lon_max) / 2`.

#### Analyse — `analyses`

| Champ | Type | Description |
|---|---|---|
| `id` | Integer | PK auto |
| `date_analyse` | DateTime | Date de l'analyse |
| `date_image_satellite` | String(20) | Date de l'image satellite utilisée |
| `taux_infection` | Float | % d'infection |
| `surface_infectee_ha` | Float | Surface infectée |
| `plants_infectes` | Integer | Plants infectés |
| `temperature_moyenne` | Float | Température actuelle (°C) |
| `humidite_moyenne` | Integer | Humidité (%) |
| `vent_moyen` | Float | Vent (m/s) |
| `risque` | String(20) | FAIBLE / MODÉRÉ / ÉLEVÉ / CRITIQUE / INFO |
| `evolution_7j` | Float | Évolution à 7 jours (%) |
| `plants_infectes_7j` | Integer | Estimation plants infectés J+7 |
| `action_recommandee` | String(200) | Recommandation |
| `zone_type` | String(50) | Type de zone détectée |
| `zone_warning` | String(200) | Avertissement zone |
| `zone_confidence` | Float | Confiance classification (0-1) |
| `image_ndvi_path` | String(200) | Chemin image stress |
| `image_rgb_path` | String(200) | Chemin image RGB |
| `rapport_json_path` | String(200) | Chemin rapport JSON |
| `parcelle_id` | FK→parcelles.id | Parcelle associée |

### 2.3 Endpoints REST

#### Auth — `/api/auth`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/register` | Non | Inscription |
| POST | `/login` | Non | Connexion → JWT |
| GET | `/profile` | Oui | Profil utilisateur |
| POST | `/google` | Non | Google OAuth2 |

#### Parcelles — `/api/parcelles`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/` | Oui | Liste des parcelles |
| POST | `/` | Oui | Créer une parcelle |
| PUT | `/<id>` | Oui | Modifier |
| DELETE | `/<id>` | Oui | Supprimer |

#### Analyses — `/api/analyses`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/parcelle/<id>` | Oui | Analyses d'une parcelle |
| GET | `/<id>` | Oui | Détail d'une analyse |
| POST | `/parcelle/<id>/run` | Oui | Lancer une analyse |
| GET | `/<id>/image/<type>` | Oui | Image (ndvi/multi/rgb) |

#### Download — `/api/download`

| Méthode | Route | Description |
|---|---|---|
| GET | `/analyse/<id>/rapport` | Télécharger rapport JSON |
| GET | `/analyse/<id>/image/<type>` | Télécharger image |

#### Système

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Message bienvenue |
| GET | `/health` | Health check |

### 2.4 Configuration

```ini
# .env
DB_USER=postgres_user
DB_PASSWORD=***
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agrovision_db
JWT_SECRET_KEY=***
JWT_ACCESS_TOKEN_EXPIRES=86400
FLASK_ENV=development
FLASK_DEBUG=1
```

Si PostgreSQL indisponible, fallback automatique sur SQLite (`agrovision.db`).

---

## 3. Moteur satellite — `agrovision_satellite`

### 3.1 Pipeline d'analyse

`AnalyseEngine.run_analyse()` (appelé par le backend) exécute 3 étapes :

```
Étape 1 — Satellite
  get_multi_index_image(coords, date_debut, date_fin, max_cloud=60)
    → indices_dict {EVI, GNDVI, NDWI, NDBI}, rgb_array
  detect_stress_isolation_forest(indices_dict)
    → masque_stress, %stress, surface_ha
  classify_zones(indices_dict)
    → zone_type, zone_warning, zone_confidence
  [fallback] SatelliteSimulator si échec

Étape 2 — Météo
  get_current_weather(lat, lon)
    → temperature, humidite, vent (temps réel)
  [fallback] get_forecast(lat, lon, 7) → moyenne 5 jours
  [fallback] valeurs par défaut 25°C, 70%, 2 m/s

Étape 3 — Prédiction
  adjust_for_weather(weather_data)
  predict_spread(total_plants, plants_infectes, jours=60)
  calculate_risk(df, jours_a_venir=7)
    → risque, evolution_7j
```

### 3.2 Module `satellite_real.py`

#### Initialisation

```python
RealSatellite(config)
  → ee.Initialize(project="coursmining-225016")
  → Test GEE (1 image)
```

#### `get_multi_index_image(coords, date_debut, date_fin, max_cloud)`

Acquisition satellite avec buffer négatif (érosion des bordures) :

1. **Buffer négatif** : projection UTM 32N, érosion de `buffer_meters` (10m)
2. **Optique Sentinel-2** : `COPERNICUS/S2_HARMONIZED`
   - Filtre : date, bounds, cloud cover < 60%
   - Composite médian (réduit les nuages résiduels)
   - Bandes : B2 (bleu), B3 (vert), B4 (rouge), B8 (NIR), B11 (SWIR)
   - Indices calculés :
     - `EVI = 2.5 × (B8 − B4) / (B8 + 6×B4 − 7.5×B2 + 10000)`
     - `GNDVI = (B8 − B3) / (B8 + B3)`
     - `NDWI = (B3 − B8) / (B3 + B8)`
     - `NDBI = (B11 − B8) / (B11 + B8)`
   - Échantillonnage : `reproject(CRS='EPSG:32632', scale=10)` → `sampleRectangle`
3. **Radar Sentinel-1** (fallback si optique indisponible) :
   - Polarisation VV/VH, mode IW, orbite descendante
   - Indice : `ratio_VH_VV`
4. **RGB true-color** :
   - Bandes B4 (R), B3 (G), B2 (B) avec écrêtage percentile 2-98%
   - Upscaling bicubic → 512px minimum, puis **unsharp mask** (sharpening)

#### `detect_stress_isolation_forest(indices_dict, contamination=0.1)`

Détection non supervisée d'anomalies spectrales :

- **Matrice de features** : empilement des indices (EVI, GNDVI, NDWI, NDBI) → shape `(pixels, 4)`
- **Cas normal** (>20 pixels) : `IsolationForest(n_estimators=100, contamination=..., random_state=42)`
- **Petit échantillon** (≤20 pixels) : seuillage combiné z-scores (percentile 20%)
- **Cas extrême** (≤2 pixels) : seuil fixe à 0.25 sur le premier indice
- Retourne : masque binaire, % stress, surface infectée estimée

#### `classify_zones(indices_dict)`

Classification pixel-à-pixel par seuils décisionnels validés :

| Zone | Règle |
|---|---|
| Eau | `NDWI > 0.15` |
| Désert | `NDWI < -0.1` et `EVI < 0.05` |
| Urbain/Bâti | `NDBI > -0.08` et `EVI < 0.15` |
| Sol nu | `NDBI ∈ [-0.15, -0.08]` et `EVI < 0.15` |
| Zone humide | `NDWI > -0.05` et `EVI > 0.1` |
| Végétation dense | `EVI > 0.35`, `GNDVI > 0.35`, `NDBI < -0.08` |
| Végétation modérée | `EVI > 0.2`, `GNDVI > 0.2`, `NDBI < -0.08` |
| Végétation clairsemée | `EVI > 0.1`, `GNDVI > 0.1` |
| Non classifié | Aucune règle satisfaite |

La classe dominante (majorité des pixels classifiés) est retournée avec un score de confiance.

#### `plot_stress_map(indices_dict, masque_stress, save_path, rgb_array)`

Visualisation professionnelle :

- **Avec RGB** : fond satellite réel + overlay stress rouge semi-transparent + contours blancs
- **Sans RGB** (radar/simu) : colormap RdYlGn en fond + overlay rouge
- Double panneau : vue complète à gauche, zoom stress à droite
- Upscaling du masque stress pour correspondre au RGB 512px (zoom order=0)

### 3.3 Module `spread_model.py` — Modèle SEIR

Modèle épidémiologique à compartiments :

```
S (Sains) → E (Exposés) → I (Infectés) → R (Retirés/résistants)
```

Équations différentielles :

```
dS/dt = -β·S·I/N
dE/dt =  β·S·I/N - σ·E
dI/dt =  σ·E - γ·I - μ·I
dR/dt =  γ·I
```

Paramètres par défaut : `β=0.3` (transmission), `σ=0.2` (incubation), `γ=0.1` (guérison), `μ=0.01` (mortalité)

#### Ajustement météo

Le taux de transmission β est multiplié par des facteurs environnementaux :

| Facteur | Formule | Plage |
|---|---|---|
| Température | `exp(-((T−25)/10)²)` | [0.3, 1.5] |
| Humidité | `H/70` | [0.5, 1.5] |
| Vent | `1 + 0.05×V` | [1.0, 1.5] |

Optimum de propagation : 25°C, 70% HR, vent faible.

#### Niveaux de risque (7 jours)

| Augmentation | Niveau | Couleur |
|---|---|---|
| < 20% | FAIBLE | 🟢 |
| 20–50% | MODÉRÉ | 🟡 |
| 50–100% | ÉLEVÉ | 🟠 |
| > 100% | CRITIQUE | 🔴 |

### 3.4 Module `weather_api.py`

#### Endpoints OpenWeatherMap utilisés

| Méthode | Endpoint | Usage |
|---|---|---|
| `get_current_weather()` | `/weather` | Température actuelle (temps réel) |
| `get_forecast(jours)` | `/forecast` | Prévisions 5j (free tier = 40 points) |

La clé API est lue depuis `config.yaml` (section `meteo.api_key`).

En cas d'échec API (réseau, timeout, clé invalide) : fallback sur données simulées (`_get_dummy_forecast`).

### 3.5 Configuration `config.yaml`

```yaml
satellite:
  source: "COPERNICUS/S2_HARMONIZED"
  project_id: "coursmining-225016"    # ID projet Google Earth Engine
  max_cloud_percent: 20
  buffer_meters: 10

detection:
  contamination: 0.1                   # Proportion attendue d'anomalies
  ndvi_seuil: 0.35

parcelle:
  nom: "Champ de test"
  coordinates: [12.55, 4.55, 12.58, 4.58]  # [lon_min, lat_min, lon_max, lat_max]
  surface_ha: 0.5
  plants_per_ha: 10000

meteo:
  api_key: "99af24940ae488aea278dca8d237c2dd"
  forecast_days: 7

outputs:
  save_path: "./data/outputs"
```

---

## 4. Flux de données complet

```
[Frontend React Native]
  │ POST /api/analyses/parcelle/{id}/run
  ▼
[Backend Flask]
  routes/analyses.py::run_analyse()
  │ analyse_service.run_analyse(parcelle)
  ▼
[AnalyseService]
  │ self.engine.run_analyse(parcelle_id, nom, coords, surface_ha)
  ▼
[AnalyseEngine]
  │
  ├── 1. Satellite ──────────────────────────────────────────────
  │   RealSatellite.get_multi_index_image(coords, D−120, D, max_cloud=60)
  │     → buffer_negatif() [érosion 10m UTM 32N]
  │     → composite médian Sentinel-2 (ou Sentinel-1 fallback)
  │     → reproject(scale=10) + sampleRectangle
  │     → indices_dict {EVI, GNDVI, NDWI, NDBI} + rgb_array
  │   detect_stress_isolation_forest(indices_dict)
  │     → masque_stress, % stress
  │   classify_zones(indices_dict)
  │     → zone_type, warning, confidence
  │   plot_stress_map(indices_dict, masque_stress, save_path, rgb_array)
  │     → image PNG (stress_map)
  │   [fallback] SatelliteSimulator.generate_ndvi_image()
  │
  ├── 2. Météo ──────────────────────────────────────────────────
  │   WeatherAPI.get_current_weather(lat, lon)
  │     → temperature, humidite, vent
  │   [fallback] get_forecast(lat, lon, 7)
  │   [fallback] valeurs par défaut
  │
  ├── 3. Prédiction ─────────────────────────────────────────────
  │   EpidemiologicalModel.adjust_for_weather(weather_data)
  │     → β ajusté (facteurs T°, HR, vent)
  │   predict_spread(total_plants, plants_infectes, jours=60)
  │     → DataFrame SEIR sur 60 jours
  │   calculate_risk(df, 7)
  │     → niveau risque, évolution %, action
  │
  └── Résultat ──────────────────────────────────────────────────
      → dict JSON (taux_infection, meteo, risque, etc.)
      → Sauvegarde rapport JSON + images PNG
      → Sauvegarde en DB (Analyse model)
  ▲
  │ Retour résultats
  ▼
[Backend Flask]
  → Sauvegarde en base de données
  → Retourne l'analyse créée
  ▲
  │ HTTP 201
  ▼
[Frontend React Native]
  → Affiche les résultats
```

---

## 5. Dépendances logicielles

### Backend (Flask)

```
flask, flask-sqlalchemy, flask-migrate, flask-jwt-extended,
flask-bcrypt, python-dotenv, psycopg2-binary, pyyaml, requests
```

### Moteur satellite

```
earthengine-api, numpy, scipy, scikit-learn, matplotlib,
pandas, pyyaml, requests, pyproj, shapely, pillow, tqdm
```

Version Python : ≥ 3.10

---

## 6. Démarrage

```bash
# Backend
cd backend
pip install -r requirements.txt   # ou installer manuellement les dépendances
python app.py                     # Flask → http://0.0.0.0:5000

# Moteur satellite (test autonome)
cd agrovision_satellite
python main.py                    # Pipeline CLI complète

# Moteur via backend
# POST /api/analyses/parcelle/{id}/run avec token JWT
```

## 7. Authentification Google Earth Engine

Le moteur satellite nécessite une authentification Google Earth Engine :

```bash
earthengine authenticate
```

Le `project_id` dans `config.yaml` doit correspondre à un projet GEE actif.

---

*Documentation générée le 29 mai 2026 — AgroVision AI v2.0*
