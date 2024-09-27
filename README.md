# Wound Healing

## About

This thesis will survey existing computer vision methods, focusing on object segmentation of 2D data. An initial study of the healing process will be made to understand the processed data better. A tool will be developed for the manual annotation of imaging data. Collaborating with microbiologists will prepare the training data by specifically highlighting wounds. The study will also involve selecting suitable metrics for comparing the effectiveness of different segmentation methods. Based on these comparisons, the thesis will design a final system capable of monitoring the healing process over time, such as tracking the rate of wound ingrowth. This system aims to contribute valuable insights into healing dynamics, potentially influencing future therapeutic strategies.

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
