import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

const resources = {
  en: {
    translation: {
      "cancel": "Cancel",
      "confirm": "Confirm",
      "error": "Error",
      "success": "Success",
      "login_title": "Login to your workspace",
      "username_email": "Email or Username",
      "password": "Password",
      "login_btn": "Log in",
      "no_account": "Don't have an account? Sign up",
      "fill_fields": "Please fill in all fields",
      "hello": "Hello 👋",
      "logout": "Log out",
      "logout_confirm": "Do you want to log out?",
      "quit": "Quit",
      "loading_lands": "Loading your lands...",
      "active_plots": "Active plots",
      "my_farms": "My farms",
      "crop": "Crop:",
      "since": "Since",
      "view_diagnostic": "View diagnostic",
      "no_land_title": "No land here",
      "no_land_desc": "Add your first plot to start the analysis.",
      "new_btn": "New",
      "settings_title": "Settings",
      "mode_settings": "Mode Settings",
      "edit_info": "Edit my information",
      "edit_info_sub": "Name, phone, email address",
      "change_pwd": "Change password",
      "change_pwd_sub": "Last modified 3 months ago",
      "app_lock": "Lock Application",
      "app_lock_sub": "PIN code or Fingerprint",
      "unsupported": "Unsupported",
      "unsupported_desc": "Your device doesn't support biometric authentication or no passcode is set.",
      "app_prefs": "Application Preferences",
      "language": "Language",
      "dark_theme": "Dark theme",
      "dark_theme_sub": "App appearance",
      "others": "Others",
      "help_support": "Help & Support",
      "help_support_sub": "FAQ, contact support",
      "logout_btn": "Log out",
    }
  },
  fr: {
    translation: {
      "cancel": "Annuler",
      "confirm": "Confirmer",
      "error": "Erreur",
      "success": "Succès",
      "login_title": "Connectez-vous à votre espace",
      "username_email": "Email ou Nom d'utilisateur",
      "password": "Mot de passe",
      "login_btn": "Se connecter",
      "no_account": "Pas encore de compte ? S'inscrire",
      "fill_fields": "Veuillez remplir tous les champs",
      "hello": "Bonjour 👋",
      "logout": "Déconnexion",
      "logout_confirm": "Voulez-vous vous déconnecter ?",
      "quit": "Quitter",
      "loading_lands": "Chargement de vos terres...",
      "active_plots": "Parcelles actives",
      "my_farms": "Mes exploitations",
      "crop": "Culture:",
      "since": "Depuis le",
      "view_diagnostic": "Consulter le diagnostic",
      "no_land_title": "Aucune terre ici",
      "no_land_desc": "Ajoutez votre première parcelle pour commencer l'analyse.",
      "new_btn": "Nouveau",
      "settings_title": "Paramètres",
      "mode_settings": "Paramètres du mode",
      "edit_info": "Modifier mes informations",
      "edit_info_sub": "Nom, téléphone, adresse email",
      "change_pwd": "Changer le mot de passe",
      "change_pwd_sub": "Dernière modification il y a 3 mois",
      "app_lock": "Verrouiller l'application",
      "app_lock_sub": "Code PIN ou Empreinte digitale",
      "unsupported": "Non supporté",
      "unsupported_desc": "Votre appareil ne supporte pas l'authentification biométrique ou aucun code n'est configuré.",
      "app_prefs": "Préférences de l'application",
      "language": "Langue",
      "dark_theme": "Thème sombre",
      "dark_theme_sub": "Apparence de l'application",
      "others": "Autres",
      "help_support": "Aide & Support",
      "help_support_sub": "FAQ, contacter le support",
      "logout_btn": "Se déconnecter",
    }
  }
};

const initI18n = async () => {
  let savedLanguage = await AsyncStorage.getItem('language');
  if (!savedLanguage) {
    savedLanguage = Localization.getLocales()[0]?.languageCode || 'fr';
  }

  i18n
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v4',
      resources,
      lng: savedLanguage,
      fallbackLng: 'fr',
      interpolation: {
        escapeValue: false
      }
    });
};

initI18n();

export default i18n;
