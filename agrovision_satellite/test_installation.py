"""
Script de test pour vérifier que toutes les bibliothèques sont bien installées
"""

print("="*50)
print("🔍 TEST D'INSTALLATION AGROVISION")
print("="*50)

# Test 1 : NumPy
try:
    import numpy as np
    print("✅ NumPy installé - version:", np.__version__)
except:
    print("❌ NumPy non installé")

# Test 2 : Pandas
try:
    import pandas as pd
    print("✅ Pandas installé - version:", pd.__version__)
except:
    print("❌ Pandas non installé")

# Test 3 : Matplotlib
try:
    import matplotlib.pyplot as plt
    print("✅ Matplotlib installé - version:", plt.matplotlib.__version__)
except:
    print("❌ Matplotlib non installé")

# Test 4 : SciPy
try:
    import scipy
    print("✅ SciPy installé - version:", scipy.__version__)
except:
    print("❌ SciPy non installé")

# Test 5 : Google Earth Engine
try:
    import ee
    print("✅ Earth Engine installé - version:", ee.__version__)
except:
    print("❌ Earth Engine non installé")

# Test 6 : PyYAML
try:
    import yaml
    print("✅ PyYAML installé - version:", yaml.__version__)
except:
    print("❌ PyYAML non installé")

# Test 7 : tqdm
try:
    from tqdm import tqdm
    print("✅ tqdm installé")
except:
    print("❌ tqdm non installé")

# Test 8 : requests
try:
    import requests
    print("✅ requests installé - version:", requests.__version__)
except:
    print("❌ requests non installé")

# Test 9 : scikit-learn
try:
    import sklearn
    print("✅ scikit-learn installé - version:", sklearn.__version__)
except:
    print("❌ scikit-learn non installé")

print("\n" + "="*50)
print("🏁 FIN DU TEST")
print("="*50)