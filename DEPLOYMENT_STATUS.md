# 📊 BSMarker - Status nasazení

**Datum**: 14.8.2025  
**Server**: bsmarker (Ubuntu 24.04 LTS)  
**Uživatel**: prusek

## ✅ Co je připraveno

1. **Kompletní Docker konfigurace pro produkci**
   - Multi-stage Dockerfiles pro optimalizované images
   - docker-compose.prod.yml pro orchestraci
   - Nginx reverse proxy s SSL podporou
   - Automatické zálohy a monitoring

2. **Deployment skripty**
   - `scripts/init-server.sh` - inicializace serveru
   - `scripts/deploy.sh` - zero-downtime deployment
   - `scripts/rollback.sh` - rychlý rollback
   - `scripts/backup.sh` - automatické zálohy
   - `scripts/deploy-local.sh` - alternativa bez Docker

3. **CI/CD Pipeline**
   - GitHub Actions workflow (.github/workflows/deploy.yml)
   - Automatické testy, build a deployment

4. **Produkční konfigurace**
   - `.env.production` vytvořen s bezpečnými hesly
   - Admin heslo: [REDACTED - heslo bylo rotováno z bezpečnostních důvodů]
   - Všechny secrets vygenerovány pomocí OpenSSL

5. **Dokumentace**
   - DEPLOYMENT.md - kompletní návod
   - INSTALL_INSTRUCTIONS.md - instrukce pro správce

## ❌ Co chybí na serveru

### Kritické komponenty (vyžaduje sudo/root):

```bash
# 1. Docker a Docker Compose
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker prusek
# POZNÁMKA: Po usermod je potřeba se odhlásit a znovu přihlásit pro aktivaci skupiny

# 2. Python dependencies
sudo apt-get install -y python3-pip python3-venv python3-dev

# 3. PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
sudo -u postgres createuser --createdb bsmarker
sudo -u postgres createdb bsmarker_db

# 4. Redis
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 5. Nginx (pro reverse proxy)
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 6. MinIO (volitelné, pro file storage)
wget -O minio https://dl.min.io/server/minio/release/linux-amd64/minio
# Ověření checksum (doporučeno - získat aktuální hash z https://dl.min.io/server/minio/release/linux-amd64/minio.sha256sum)
# sha256sum minio
sudo chmod +x minio
sudo mv minio /usr/local/bin/
```

## 🚀 Jak dokončit nasazení

### Varianta A: Docker (doporučeno)

```bash
# 1. Správce serveru nainstaluje Docker (viz výše)

# 2. Přesun do produkční složky
sudo cp -r /home/prusek/BSMarker /opt/bsmarker
sudo chown -R prusek:prusek /opt/bsmarker

# 3. Spuštění
cd /opt/bsmarker
./scripts/init-server.sh  # pouze jednou
./scripts/deploy.sh --build
```

### Varianta B: Bez Docker (fallback)

```bash
# 1. Správce nainstaluje dependencies (viz výše)

# 2. Spuštění lokálního deploymentu
cd /home/prusek/BSMarker
./scripts/deploy-local.sh

# 3. Nastavení Nginx proxy (sudo required)
sudo cp nginx/nginx.conf /etc/nginx/sites-available/bsmarker
sudo ln -s /etc/nginx/sites-available/bsmarker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Varianta C: Development mode (okamžité řešení)

```bash
# Pokud máme alespoň Python a Node.js lokálně:
cd /home/prusek/BSMarker
python3 run_local.py
```

## 📝 Potřebné akce od správce serveru

1. **Instalace systémových balíčků** (viz seznam výše)
2. **Nastavení firewallu** - otevřít porty 80, 443
3. **DNS konfigurace** - nasměrovat your-domain.example.com na IP serveru
4. **SSL certifikát** - Let's Encrypt přes certbot
5. **Přidělení sudo práv** nebo instalace potřebných služeb

## 🔐 Bezpečnostní informace

- Všechna hesla jsou vygenerována a uložena v `.env.production`
- JWT secret key je nastaven
- CORS je nakonfigurován pro produkční doménu
- Rate limiting je připraven v nginx konfiguraci

## 📞 Kontakt pro správce

Pokud máte dotazy k instalaci:
- Konfigurační soubory jsou připraveny v `/home/prusek/BSMarker`
- Dokumentace: `DEPLOYMENT.md` a `INSTALL_INSTRUCTIONS.md`
- Produkční secrets: `.env.production`

## 🎯 Další kroky

1. **Požádat správce serveru o instalaci chybějících komponent**
2. **Po instalaci spustit deployment skript**
3. **Ověřit funkčnost na https://your-domain.example.com**

---

**Aktuální stav**: Aplikace je připravena k nasazení, čeká na instalaci systémových dependencies.
