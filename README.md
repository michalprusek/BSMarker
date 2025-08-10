# BSMarker - Bird Song Annotation Tool

BSMarker je full-stack aplikace pro anotaci ptačího zpěvu pomocí spektrogramů. Umožňuje nahrávání audio souborů, automatické generování spektrogramů a jejich anotaci pomocí bounding boxů.

## 🚀 Funkce

- **Správa uživatelů**: Admin může vytvářet a spravovat uživatelské účty
- **Projekty**: Organizace nahrávek do projektů
- **Nahrávání audio**: Podpora MP3, WAV, M4A, FLAC formátů
- **Automatické spektrogramy**: Generování spektrogramů z audio nahrávek
- **Anotační editor**: 
  - Kreslení bounding boxů na spektrogramech
  - Přiřazování labelů (druh ptáka, typ zvuku)
  - Synchronizace s audio přehrávačem
- **Audio přehrávač**: WaveSurfer.js s vizualizací průběhu

## 🛠 Technologie

### Backend
- **FastAPI** - REST API framework
- **PostgreSQL** - Databáze
- **Redis** - Cache a Celery broker
- **MinIO** - S3-compatible storage pro soubory
- **Celery** - Asynchronní úlohy (generování spektrogramů)
- **librosa** - Audio processing

### Frontend
- **React 18** s TypeScript
- **Tailwind CSS** - Styling
- **React Konva** - Canvas pro anotace
- **WaveSurfer.js** - Audio vizualizace a přehrávání
- **React Hook Form** - Formuláře
- **React Hot Toast** - Notifikace

## 📦 Instalace a spuštění

### Požadavky
- Docker a Docker Compose
- Node.js 18+ (pro lokální vývoj)
- Python 3.11+ (pro lokální vývoj)

### Rychlý start s Dockerem

1. Klonujte repozitář:
```bash
git clone <repository-url>
cd BSMarker
```

2. Spusťte aplikaci:
```bash
docker-compose up --build
```

3. Aplikace bude dostupná na:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API dokumentace: http://localhost:8000/docs
- MinIO Console: http://localhost:9001

### Výchozí přihlašovací údaje

**Admin účet:**
- Email: admin@bsmarker.com
- Heslo: admin123

## 🏗 Struktura projektu

```
BSMarker/
├── backend/
│   ├── app/
│   │   ├── api/           # API endpoints
│   │   ├── core/          # Konfigurace, security
│   │   ├── db/            # Databázové modely
│   │   ├── models/        # SQLAlchemy modely
│   │   ├── schemas/       # Pydantic schémata
│   │   └── services/      # Business logika
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/    # React komponenty
│   │   ├── contexts/      # React contexts
│   │   ├── pages/         # Stránky aplikace
│   │   ├── services/      # API služby
│   │   └── types/         # TypeScript typy
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml
```

## 📝 Použití

### 1. Vytvoření projektu
- Přihlaste se do aplikace
- Klikněte na "New Project"
- Zadejte název a popis projektu

### 2. Nahrání audio souboru
- Otevřete projekt
- Klikněte na "Upload Recording"
- Vyberte MP3/WAV/M4A/FLAC soubor
- Systém automaticky vygeneruje spektrogram

### 3. Anotace
- Klikněte na "Annotate" u nahrávky
- Nakreslete bounding box tažením myši na spektrogramu
- Přiřaďte label (např. "Robin", "Sparrow")
- Použijte audio přehrávač pro poslech
- Uložte anotace tlačítkem "Save Annotations"

### 4. Správa uživatelů (Admin)
- Přejděte do sekce "Users"
- Vytvořte nové uživatele tlačítkem "New User"
- Nastavte email, heslo a oprávnění

## 🔧 Vývoj

### Backend vývoj
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend vývoj
```bash
cd frontend
npm install
npm start
```

## 🐛 Známé problémy a omezení

- Spektrogramy jsou generovány asynchronně - může trvat několik sekund
- Maximální velikost nahrávaného souboru: 100 MB
- Podporované audio formáty: MP3, WAV, M4A, FLAC

## 📄 API Dokumentace

Po spuštění aplikace je dostupná interaktivní API dokumentace:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🤝 Přispívání

Příspěvky jsou vítány! Prosím vytvořte pull request s popisem změn.

## 📜 Licence

Tento projekt je licencován pod MIT licencí.