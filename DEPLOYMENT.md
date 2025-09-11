# BSMarker Production Deployment Guide

## 📋 Přehled

Tato dokumentace popisuje nasazení BSMarker aplikace na produkční server bsmarker.utia.cas.cz pomocí Docker kontejnerů.

## 🏗️ Architektura

```
Internet → Nginx (reverse proxy) → Backend (FastAPI)
                                 → Frontend (React)
                                 → MinIO (S3 storage)
                                 → PostgreSQL
                                 → Redis
```

## 🚀 První nasazení na nový server

### 1. Příprava serveru

```bash
# Připojte se na server
ssh admin@bsmarker.utia.cas.cz

# Ověřte SSH konektivitu a oprávnění
sudo -l

# Ověřte, že cílový adresář existuje a má správná oprávnění
sudo mkdir -p /opt
sudo chown $(whoami):$(whoami) /opt

# Stáhněte repozitář
git clone https://github.com/yourusername/BSMarker.git /opt/bsmarker
cd /opt/bsmarker

# Spusťte inicializační skript
sudo ./scripts/init-server.sh
```

### 2. Konfigurace prostředí

```bash
# Vytvořte produkční environment soubor
cp .env.example .env.production

# BEZPEČNOSTNÍ POŽADAVKY NA HESLA:
# - Minimálně 32 bajtů entropie (doporučeno 48+ bajtů)
# - Kombinace velkých/malých písmen, čísel a speciálních znaků
# - Každé heslo MUSÍ být unikátní (žádné opakování)
# - NIKDY neukládejte hesla v plain textu do verzovacích systémů
# - Používejte správce hesel nebo šifrovaný vault

# Generování kryptograficky bezpečných hesel (zvolte jednu metodu):
# Metoda 1: OpenSSL (doporučeno 48 bajtů)
openssl rand -base64 48

# Metoda 2: pwgen (pokud je k dispozici)
pwgen -s 64 1

# Metoda 3: /dev/urandom
tr -dc 'A-Za-z0-9!@#$%^&*()_+{}[]|:;<>?,./' < /dev/urandom | head -c 64 && echo

# Metoda 4: Python pro komplexní hesla
python3 -c "import secrets, string; chars = string.ascii_letters + string.digits + '!@#$%^&*()_+-=[]{}|;:,.<>?'; print(''.join(secrets.choice(chars) for _ in range(64)))"

# Upravte .env.production a nastavte:
# - Silná hesla (vygenerovaná výše, min. 32 znaků)
# - Produkční doménu
# - Email konfigurace
nano .env.production
```

### 3. První deployment

```bash
# Build a nasazení
sudo ./scripts/deploy.sh --build

# Ověřte, že vše běží
docker-compose -f docker-compose.prod.yml ps
curl https://bsmarker.utia.cas.cz/health
```

## 📦 Pravidelný deployment

### Automatický (CI/CD)

Push do `main` branch automaticky spustí deployment přes GitHub Actions:

```bash
git push origin main
# GitHub Actions automaticky:
# 1. Spustí testy
# 2. Builduje Docker images
# 3. Pushuje do Docker Hub
# 4. Deployuje na server
```

### Manuální deployment

```bash
ssh admin@bsmarker.utia.cas.cz
cd /opt/bsmarker

# Stáhněte nejnovější kód
git pull origin main

# Deploy s automatickým backupem
sudo ./scripts/deploy.sh

# Nebo deploy s rebuildem images
sudo ./scripts/deploy.sh --build
```

## 🔄 Rollback

V případě problémů můžete rychle vrátit předchozí verzi:

```bash
# Automatický rollback na poslední backup
sudo ./scripts/rollback.sh

# Rollback na specifické datum
sudo ./scripts/rollback.sh 20240114_120000
```

## 💾 Zálohy

### Automatické zálohy

Nastaveny přes cron:
- Denní: databáze a konfigurace (3:00)
- Týdenní: kompletní včetně MinIO dat (neděle 4:00)

### Manuální záloha

```bash
# Rychlá záloha (pouze databáze)
sudo ./scripts/backup.sh

# Kompletní záloha (včetně souborů)
sudo ./scripts/backup.sh --full
```

### Obnovení ze zálohy

```bash
# Seznam dostupných záloh
ls -la /var/backups/bsmarker/

# Obnovení
sudo ./scripts/rollback.sh [datum_zalohy]
```

## 🔐 SSL Certifikáty

SSL certifikáty jsou spravovány pomocí Let's Encrypt a automaticky obnovovány:

```bash
# Manuální obnovení
sudo certbot renew

# Ověření certifikátu
sudo certbot certificates
```

## 📊 Monitoring

### Logy

```bash
# Backend logy
docker-compose -f docker-compose.prod.yml logs -f backend

# Frontend logy
docker-compose -f docker-compose.prod.yml logs -f frontend

# Nginx logy
tail -f /var/log/nginx/bsmarker_access.log
tail -f /var/log/nginx/bsmarker_error.log

# Všechny logy
docker-compose -f docker-compose.prod.yml logs -f
```

### Health check

```bash
# Základní health check
curl https://bsmarker.utia.cas.cz/health

# API health check
curl https://bsmarker.utia.cas.cz/api/health

# Docker status
docker-compose -f docker-compose.prod.yml ps
```

### Metriky

```bash
# Docker statistiky
docker stats

# Systémové metriky
htop
df -h
free -h
```

## 🐛 Troubleshooting

### Container nenaběhne

```bash
# Zkontrolujte logy
docker-compose -f docker-compose.prod.yml logs [service_name]

# Restartujte service
docker-compose -f docker-compose.prod.yml restart [service_name]

# Rebuild a restart
docker-compose -f docker-compose.prod.yml up -d --build [service_name]
```

### Databázové problémy

```bash
# Připojení k databázi
docker-compose -f docker-compose.prod.yml exec postgres psql -U bsmarker -d bsmarker_db

# Kontrola spojení
docker-compose -f docker-compose.prod.yml exec backend python -c "from app.db.database import engine; engine.connect()"
```

### Nedostatek místa

```bash
# Vyčistit Docker
docker system prune -a --volumes

# Zkontrolovat místo
df -h
du -sh /var/lib/docker/
```

### Port už používá jiná aplikace

```bash
# Najít proces
sudo lsof -i :80
sudo lsof -i :443

# Zastavit konfliktní službu
sudo systemctl stop apache2  # například
```

## 🛠️ Údržba

### Aktualizace systému

```bash
# Aktualizace OS
sudo apt update && sudo apt upgrade

# Aktualizace Docker images
docker-compose -f docker-compose.prod.yml pull

# Restart s novými images
docker-compose -f docker-compose.prod.yml up -d
```

### Čištění

```bash
# Odstranit staré Docker images
docker image prune -a

# Odstranit staré logy
find /var/log/bsmarker -name "*.log" -mtime +30 -delete

# Odstranit staré zálohy
find /var/backups/bsmarker -name "*.gz" -mtime +30 -delete
```

## 📝 Důležité soubory a cesty

- **Aplikace**: `/opt/bsmarker/`
- **Environment**: `/opt/bsmarker/.env.production`
- **Logy**: `/var/log/bsmarker/`
- **Zálohy**: `/var/backups/bsmarker/`
- **SSL certifikáty**: `/etc/letsencrypt/live/bsmarker.utia.cas.cz/`
- **Docker compose**: `/opt/bsmarker/docker-compose.prod.yml`

## 🔑 GitHub Secrets pro CI/CD

Nastavte v GitHub repository Settings → Secrets:

- `DOCKER_USERNAME`: Docker Hub username
- `DOCKER_PASSWORD`: Docker Hub password
- `PRODUCTION_HOST`: bsmarker.utia.cas.cz
- `PRODUCTION_USER`: deployment user
- `PRODUCTION_SSH_KEY`: SSH private key pro deployment
- `SLACK_WEBHOOK`: (volitelné) pro notifikace

## 📞 Kontakty

V případě problémů kontaktujte:
- Systémový administrátor: admin@utia.cas.cz
- Vývojový tým: dev-team@utia.cas.cz

## 🔄 Migrace z lokálního developmentu

Lokální development zůstává nezměněn - používá `run_local.py`:

```bash
# Lokální development (bez změny)
python3 run_local.py

# Produkce (Docker)
ssh bsmarker.utia.cas.cz
cd /opt/bsmarker
./scripts/deploy.sh
```

Hlavní rozdíly:
- **Development**: run_local.py, porty 3456/8123, hot reload
- **Produkce**: Docker Compose, HTTPS, nginx proxy, automatické zálohy
