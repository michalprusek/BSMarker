FROM python:3.12
ENV PYTHONUNBUFFERED=1
COPY . /app/

# Setup frontend
WORKDIR /app/frontend/

ARG NODE_VERSION=18.20.5
RUN curl https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz | tar -xz -C /usr/local --strip-components 1
RUN npm install
RUN npm run build

# Setup backend
WORKDIR /app/backend/
RUN apt-get update && apt-get install -y python3-opencv
RUN pip install --upgrade pip
RUN pip install -r requirements.txt
RUN mkdir -p /app/backend/static/
RUN rm -rf /app/backend/static/*
RUN python3 manage.py collectstatic --no-input
