# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BSMarker is a web-based tool for analyzing and annotating bird song spectrograms using computer vision and deep learning. It provides interactive spectrogram analysis, automated bird song segmentation using U-Net, manual annotation tools, and statistical analysis of song patterns and characteristics.

## Common Development Commands

### Backend (Django)
```bash
cd backend/
pip3 install -r requirements.txt
python3 manage.py migrate          # Run database migrations
python3 manage.py runserver        # Start development server (port 8000)
python3 manage.py createsuperuser  # Create admin user
python3 manage.py collectstatic    # Collect static files for production
```

### Frontend (Vue.js/Vite)
```bash
cd frontend/
npm install
npm run dev      # Development server with hot reload (port 5173)
npm run build    # Production build
npm run preview  # Preview production build
```

### Docker Production
```bash
docker-compose build  # Build all containers
docker-compose up     # Run full stack (PostgreSQL, Django, Nginx)
```

### Deep Learning Model
```bash
cd backend/imgproc/unet/
python3 net.py    # Train U-Net model with PyTorch Lightning
python3 infer.py  # Run inference on images
```

## Architecture Overview

### Backend Structure (`backend/`)
- **Django App** (`wound_healing/`): Core models (Project, Experiment, Frame, Polygon), GraphQL API via Strawberry
- **Image Processing** (`imgproc/`):
  - `wound.py`: Traditional CV algorithms (edge detection, morphological operations) for audio spectrogram analysis
  - `unet/`: Deep learning segmentation with U-Net (ResNet50 encoder)
- **API**: GraphQL mutations for bird song detection, annotation management, data export

### Frontend Structure (`frontend/`)
- **Vue 3 + Vite**: SPA with Pinia state management
- **Key Components**:
  - `FrameManager.vue`: Timeline control and navigation
  - `ImageDisplay.vue`: Zoomable/pannable image viewer
  - `Polygon.vue`: Interactive boundary editing
  - Statistical visualization components (Histogram, Plot, Results)

### Data Flow
1. Upload spectrogram images → Django stores in PostgreSQL
2. Request bird song detection → U-Net inference or traditional CV
3. Return annotation boundaries → Frontend renders interactive overlays
4. User edits annotations → GraphQL mutations update database
5. Export analysis → Generate CSV/Excel with statistics

## Key Technical Details

### Deep Learning Pipeline
- **Framework**: PyTorch + PyTorch Lightning
- **Model**: U-Net with ResNet50 encoder from Segmentation Models PyTorch
- **Loss**: Focal Loss + Dice Loss combination
- **Augmentation**: Heavy augmentation via Albumentations (rotation, elastic transforms, brightness/contrast)
- **Inference**: Cached model loading with CUDA acceleration

### Database Schema
- `Project` → contains multiple `Experiment`
- `Experiment` → contains multiple `Frame` (spectrogram segments)
- `Frame` → has multiple `Polygon` (bird song annotations)
- `Polygon` → can be additive or subtractive, stores boundary points

### GraphQL API Endpoints
Key mutations in `backend/wound_healing/api.py`:
- `detect_wound`: Run automated bird song detection on frame
- `add_polygon`/`delete_polygon`: Manage song annotations
- `update_polygon_points`: Edit boundary vertices
- `export_experiment`: Generate analysis reports

## Development Notes

- Frontend dev server runs on port 5173, backend on port 8000
- Static files served from `backend/media/` for uploaded images
- U-Net model checkpoints stored in `backend/imgproc/unet/lightning_logs/`
- Test notebooks available in `notebooks/` for algorithm experimentation
- Minimal test coverage - focus on manual testing via UI and notebooks