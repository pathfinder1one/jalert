# OGD India Data Integration for JALERT

This folder is where JALERT looks for official Open Government Data (OGD) India files before training the ML models.

## Folder layout

- `raw/`
  Put the original government CSV/XLS/XLSX files here.
- `processed/`
  JALERT writes normalized training tables here after parsing the official files.

## Supported official datasets

### 1. Water quality

- Official catalog:
  `https://ap.data.gov.in/catalog/status-water-quality-india-2008-and-2011`
- Use for:
  water quality model training
- Filename should include:
  `water` and `quality`

### 2. District rainfall

- Official page:
  `https://www.data.gov.in/resource/daily-district-wise-rainfall-data`
- Direct resource URL published on the official page:
  `https://www.data.gov.in/files/ogdpv2dms/s3fs-public/datafile/Daily_Rainfall_data_from_India_Meteorological_Department_Agency_during_January_1901.csv`
- Use for:
  rainfall and recency features for disease-outbreak training
- Filename should include:
  `rainfall`

### 3. HMIS district health indicators

- Official page:
  `https://www.data.gov.in/resource/item-wise-hmis-report-district-level-andhra-pradesh-january-2014-15`
- Direct resource URL published on the official page:
  `https://www.data.gov.in/files/ogdpv2dms/s3fs-public/dataurl30122020/hmis-item-2014-15-mn-ap-upto-Jan.csv`
- Use for:
  fever, diarrhea, vomiting, and symptom-load features for disease-outbreak training
- Filename should include:
  `hmis`

### 4. NFHS indicators

- Official catalog:
  `https://www.data.gov.in/catalog/key-indicators-national-family-health-survey-nfhs`
- Use for:
  future population vulnerability enrichment
- Filename should include:
  `nfhs`

## Why manual download is needed

The official resource pages are available, but the direct file endpoints currently return `403 Forbidden` for automated downloads in this environment. Because of that, JALERT is set up to read the official files from `raw/` after you download them manually from the government pages.

## How JALERT uses the files

1. Drop the official files into `data/ogd_india/raw/`
2. Start the app
3. Call:
   - `POST /api/v1/ml/train/water-quality`
   - `POST /api/v1/ml/train/disease-outbreak`
4. JALERT will:
   - detect the official files
   - normalize them into model-ready columns
   - save processed tables in `data/ogd_india/processed/`
   - train the model using `data_source = "ogd_india"`

## Notes

- Water-quality training uses official water metrics first, then falls back to database sensor data, then synthetic data.
- Disease-outbreak training uses HMIS + rainfall first, then falls back to synthetic data if official files are missing.
- The current disease pipeline also uses official water-quality data as a district-level or national fallback context when available.
