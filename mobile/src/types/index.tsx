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

export interface Coordinate {
  latitude: number;
  longitude: number;
}

// Type pour la navigation (à importer partout)
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Map: undefined;                    // ← AJOUTÉ
  ParcelleDetail: { parcelle: Parcelle };  // ← AJOUTÉ
};