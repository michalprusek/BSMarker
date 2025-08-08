# BSMarker - Bird Song Annotation Tool

## About

BSMarker is a comprehensive annotation tool designed for bird song analysis and visualization. This tool enables researchers and ornithologists to annotate, segment, and analyze bird song spectrograms with precision. The application provides both manual annotation capabilities and automated detection features, making it suitable for large-scale bird song studies. The system includes advanced visualization tools for tracking patterns over time and comparing different song segments. BSMarker aims to facilitate research in avian communication, behavior studies, and ecological monitoring through efficient audio-visual data processing.

**Supervisor**: Adam Novozámský

**Application domain**: Ornithology and Bioacoustics Research

## Usage
### User documentation
Please refer to [the user manual](docs/manual.md).

### Running the production version
A `.env` file must be created in the project root with the following content:
```
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=<enter password>
DB_HOST=db
DB_PORT=5432
ALLOWED_HOSTS=localhost,www.example.com
```

To build the application:
```sh
cd bsmarker/
docker-compose build
docker-compose up
```

### Running the development version

First, run migrations, create a user and launch the backend server:
```sh
cd bsmarker/backend

pip3 install -r requirements.txt

python3 manage.py migrate
python3 manage.py createsuperuser
python3 manage.py runserver
```
Then, launch the frontend:
```sh
cd bsmarker/frontend
npm install
npm run dev
```

Finally, head to [http://localhost:8000/](http://localhost:8000).