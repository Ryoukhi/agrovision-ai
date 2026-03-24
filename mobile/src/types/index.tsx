export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export interface Parcelle {
  id: number;
  nom: string;
  long_min: number;
  lat_min: number;
  long_max: number;
  lat_max: number;
  surface_ha: number;
  plants_per_ha?: number;
  culture?: string;
  created_at: string;
  user_id: number;
}

export interface Analyse {
  id: number;
  date_analyse: string;
  date_image_satellite: string;
  taux_infection: number;
  surface_infectee_ha: number;
  plants_infectes: number;
  temperature_moyenne: number;
  humidite_moyenne: number;
  vent_moyen: number;
  risque: 'FAIBLE' | 'MODÉRÉ' | 'ÉLEVÉ' | 'CRITIQUE';
  evolution_7j: number;
  plants_infectes_7j: number;
  action_recommandee: string;
  rapport_json_path?: string;
  image_ndvi_path?: string;
  image_multi_path?: string;
  parcelle_id: number;
  created_at: string;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Settings: undefined;
  Map: undefined;
  ParcelleDetail: { parcelle: Parcelle };
  AnalyseDetail: { id: number };
  EditParcelleMap: { id: number; currentCoordinates: any[] };
  Onboarding: undefined;
};