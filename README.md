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
DEBUG=False

DOMAIN=<DOMAIN>
ORIGIN=http://<DOMAIN>
SECRET_KEY=<YOUR SECRET KEY>

NUM_WORKERS=<(number of cores) * 2 + 1>
```
where <DOMAIN> is replaced with the domain on which the app will be running and <YOUR SECRET KEY> replaced with a randomly generated secret key for Django. Set `NUM_WORKERS` to an approprivate number of workers corresponding to the number of available cores (there should be `number_of_cores*2 + 1` workers).

The port on which the server will be running is by default 1337 (in `docker-compose.yml`) but it should be changed to 80 or other port depending on whether your server has another proxy on the way.

Then run the following commands:
```
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
