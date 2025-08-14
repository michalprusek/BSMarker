# Instrukce pro správce serveru - BSMarker

## Požadavky na instalaci

Server potřebuje následující komponenty:

### 1. Instalace Docker a Docker Compose

```bash
# Aktualizace systému
sudo apt-get update
sudo apt-get upgrade -y

# Instalace Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

# Instalace Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Přidání uživatele do docker skupiny
sudo usermod -aG docker $USER
```

### 2. Instalace dalších potřebných nástrojů

```bash
sudo apt-get install -y \
    git \
    curl \
    wget \
    postgresql-client \
    redis-tools \
    nginx \
    certbot \
    python3-certbot-nginx
```

### 3. Nastavení firewallu

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3456/tcp  # Development frontend (pokud potřeba)
sudo ufw allow 8123/tcp  # Development backend (pokud potřeba)
sudo ufw enable
```

### 4. Vytvoření adresářů

```bash
sudo mkdir -p /opt/bsmarker
sudo mkdir -p /var/log/bsmarker
sudo mkdir -p /var/backups/bsmarker
sudo chown -R $USER:$USER /opt/bsmarker
sudo chown -R $USER:$USER /var/log/bsmarker
sudo chown -R $USER:$USER /var/backups/bsmarker
```

### 5. Kopírování aplikace

```bash
sudo cp -r $HOME/BSMarker/* /opt/bsmarker/
sudo chown -R $USER:$USER /opt/bsmarker
```

### 6. SSL certifikát (pokud je doména dostupná)

```bash
sudo certbot certonly --standalone -d bsmarker.utia.cas.cz \
    --non-interactive --agree-tos --email admin@utia.cas.cz
```

## Po instalaci

Jakmile budou tyto komponenty nainstalovány, uživatel může spustit:

```bash
cd /opt/bsmarker
./scripts/deploy.sh --build
```

## Alternativa: Instalace bez Docker

Pokud Docker není možný, můžeme aplikaci provozovat přímo:

### Backend (Python)
```bash
cd $HOME/BSMarker/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

### Frontend (Node.js)
```bash
cd $HOME/BSMarker/frontend
npm install
npm run build
```

### Databáze a Redis
Tyto služby musí být nainstalovány systémově:
```bash
sudo apt-get install postgresql postgresql-contrib redis-server
```

## Kontakt

V případě dotazů kontaktujte: admin@utia.cas.cz