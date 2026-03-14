"""
Apprendre à manipuler des images avec NumPy
"""

import numpy as np
import matplotlib.pyplot as plt

print("="*50)
print("📚 APPRENDRE NUMPY")
print("="*50)

# 1. Créer une image simulée
print("\n1. Création d'une image simulée...")

# Notre image fait 100 pixels de large sur 100 pixels de haut
# Chaque pixel aura une valeur entre 0 et 1 (0 = noir, 1 = blanc)
hauteur = 100
largeur = 100

# np.random.random() génère des nombres aléatoires entre 0 et 1
image = np.random.random((hauteur, largeur))

print(f"   Image créée : {hauteur} x {largeur} pixels")
print(f"   Type de l'image : {type(image)}")
print(f"   Forme de l'image : {image.shape}")
print(f"   Valeur min : {image.min():.2f}, max : {image.max():.2f}")

# 2. Afficher l'image
print("\n2. Affichage de l'image...")

plt.figure(figsize=(8, 6))
plt.imshow(image, cmap='gray')
plt.title('Image aléatoire')
plt.colorbar(label='Valeur du pixel')
plt.show()

# 3. Modifier une zone de l'image
print("\n3. Modification d'une zone (création d'une 'tache')...")

# On va créer une zone plus sombre (valeur plus basse)
# De la ligne 30 à 40, colonne 40 à 50
image[30:40, 40:50] = 0.2  # 0.2 = gris foncé

# Une zone plus claire
image[60:70, 10:20] = 0.8  # 0.8 = gris clair

# Afficher l'image modifiée
plt.figure(figsize=(8, 6))
plt.imshow(image, cmap='gray')
plt.title('Image avec zones modifiées')
plt.colorbar(label='Valeur du pixel')
plt.show()

# 4. Calculer des statistiques sur l'image
print("\n4. Statistiques sur l'image...")

moyenne = np.mean(image)
ecart_type = np.std(image)
print(f"   Moyenne des pixels : {moyenne:.3f}")
print(f"   Écart-type : {ecart_type:.3f}")

# 5. Détecter les zones sombres (potentiellement malades)
print("\n5. Détection des zones anormales...")

# On considère comme anormal tout pixel < moyenne - 2*écart-type
seuil = moyenne - 2 * ecart_type
masque_anomalies = image < seuil

nombre_anomalies = np.sum(masque_anomalies)
pourcentage_anomalies = (nombre_anomalies / (hauteur * largeur)) * 100

print(f"   Seuil de détection : {seuil:.3f}")
print(f"   Nombre de pixels anormaux : {nombre_anomalies}")
print(f"   Pourcentage : {pourcentage_anomalies:.1f}%")

# Afficher les anomalies
plt.figure(figsize=(8, 6))
plt.imshow(masque_anomalies, cmap='Reds')
plt.title('Zones anormales détectées')
plt.colorbar(label='Anomalie (1=oui)')
plt.show()

print("\n✅ Fini ! Tu viens de manipuler ta première 'image' !")