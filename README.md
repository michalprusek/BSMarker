# Wound Healing

## About
**Abstract**: This study focuses on the development of an advanced imaging detection system for monitoring wound healing, employing cutting-edge techniques to provide accurate, real-time assessments of healing progress. The integration of machine learning models allows for the automatic classification of wound stages, offering valuable insights into the effectiveness of treatment protocols.

**Supervisor**: Adam Novozámský

**Collaborating workplace**: Ústavu biochemie a mikrobiologie VŠCHT

## Usage
### User documentation
Please refer to [the user manual](docs/manual.md).

### Running the development version

First, run migrations, create a user and launch the backend server:
```sh
cd wound-healing/backend

pip3 install -r requirements.txt

python3 manage.py migrate
python3 manage.py createsuperuser
python3 manage.py runserver
```
Then, launch the frontend:
```sh
cd wound-healing/frontend
npm install
npm run dev
```

Finally, head to [http://localhost:8000/](http://localhost:8000).
