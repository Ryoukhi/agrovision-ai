import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Remplace par l'IP de ton PC (important pour l'émulateur)
const BASE_URL = 'http://10.20.230.242:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;