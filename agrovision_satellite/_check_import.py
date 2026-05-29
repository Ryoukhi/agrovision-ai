import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Same imports as _test_run.py
sys.path.insert(0, r'E:\EADL\EADL\PROJET TUTORÉ\agrovision-ai')
sys.path.insert(0, r'E:\EADL\EADL\PROJET TUTORÉ\agrovision-ai\agrovision_satellite')

print('sys.path[0:5]:')
for p in sys.path[:5]:
    print(f'  {p}')

# Check where satellite_real is loaded from
from modules import satellite_real
print(f'\nsatellite_real location: {satellite_real.__file__}')

import inspect
src = inspect.getsource(satellite_real.RealSatellite.get_multi_index_image)
for i, line in enumerate(src.split('\n')):
    if '2.5 *' in line:
        print(f'\nEVI expression (line {i}): {line.strip()}')
        break

# Now test the actual function call - check if roi.coordinates changes anything
import ee
ee.Initialize()

# Replicate the EXACT coords from the analysis
coords = [12.55, 4.55, 12.58, 4.58]
roi = ee.Geometry.Rectangle(coords)

# Test median B4
s2 = ee.ImageCollection('COPERNICUS/S2_HARMONIZED') \
    .filterDate('2026-01-01', '2026-03-01') \
    .filterBounds(roi) \
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
median = s2.select(['B2', 'B3', 'B4', 'B8', 'B11']).median()

b4_test = median.select('B4').reproject(crs='EPSG:32632', scale=10).sampleRectangle(region=roi, defaultValue=0)
b4_data = b4_test.get('B4').getInfo()
b4_arr = __import__('numpy').array(b4_data)
b4_flat = b4_arr.flatten()
b4_nz = b4_flat[b4_flat > 0]
print(f'\nDirect test: B4 shape={b4_arr.shape}, nz={len(b4_nz)}/{len(b4_flat)}, range=[{b4_flat.min()},{b4_flat.max()}]')
