# Spectrogram Optimization - Deployment Guide

## Změny provedené

### 1. **Asynchronní generování spektrogramů**
- Přidán Celery + Redis pro background processing
- Spektrogramy se generují ihned po uploadu MP3 souboru
- Multi-resolution podpora (thumbnail, standard, full)

### 2. **Databázové změny**
- Nové sloupce v tabulce `spectrograms`:
  - `status`: enum (pending/processing/completed/failed)
  - `thumbnail_path`, `standard_path`, `full_path`
  - `processing_time`, `error_message`
  - `updated_at`

### 3. **API vylepšení**
- Nový endpoint `/recordings/{id}/spectrogram/status` pro kontrolu stavu
- Parametr `resolution` v `/recordings/{id}/spectrogram`
- Lepší error handling a caching

### 4. **Frontend vylepšení**
- Progresivní načítání (thumbnail → standard → full)
- Real-time status indikátory
- Retry mechanismus při selhání
- Quality selector pro různá rozlišení

## Deployment kroky

### 1. **Build nové verze**
```bash
# Build backend s Celery podporou
sudo docker-compose -f docker-compose.prod.yml build backend

# Build frontend s novými funkcemi
sudo docker-compose -f docker-compose.prod.yml build frontend
```

### 2. **Spuštění databázové migrace**
```bash
# Připojit se k PostgreSQL
sudo docker exec -it bsmarker_postgres_1 psql -U bsmarker -d bsmarker_db

# Spustit migrační skript
\i /backup/add_spectrogram_fields.sql

# Nebo manuálně zkopírovat obsah souboru migrations/add_spectrogram_fields.sql
```

### 3. **Restart služeb s novými kontejnery**
```bash
# Zastavit stará instance
sudo docker-compose -f docker-compose.prod.yml down

# Spustit s novými Celery workery
sudo docker-compose -f docker-compose.prod.yml up -d
```

### 4. **Ověření funkcionality**
```bash
# Zkontrolovat běh všech služeb
sudo docker-compose -f docker-compose.prod.yml ps

# Zkontrolovat logy Celery workera
sudo docker logs bsmarker_celery-worker_1 -f

# Zkontrolovat logy backendu
sudo docker logs bsmarker_backend_1 -f
```

## Očekávané výsledky

### Před optimalizací:
- ⏱️ Načítání spektrogramu: **5-15 sekund**
- 🚫 Blocking operace během generování
- ❌ Žádné loading indikátory
- 🔄 Každé zobrazení = nové generování

### Po optimalizaci:
- ⚡ **Okamžité zobrazení thumbnailů** (< 500ms)
- 🏃‍♂️ **Standardní spektrogramy** (< 2s)
- 📊 **Progresivní načítání** s indikátory
- 🔄 **Jednou vygenerované = navždy uložené**
- 🎯 **Multi-resolution podpora** pro různé zoom levels
- 🛡️ **Retry mechanismus** při selhání

## Troubleshooting

### Celery worker problémy:
```bash
# Kontrola Redis připojení
sudo docker exec bsmarker_redis_1 redis-cli ping

# Restart Celery workeru
sudo docker restart bsmarker_celery-worker_1

# Kontrola Celery tasks
sudo docker exec bsmarker_celery-worker_1 celery -A app.core.celery_app inspect active
```

### Spektrogramy se negenerují:
```bash
# Zkontrolovat logy
sudo docker logs bsmarker_celery-worker_1 --tail 100

# Zkontrolovat MinIO připojení
sudo docker logs bsmarker_minio_1 --tail 50

# Restartovat celý stack
sudo docker-compose -f docker-compose.prod.yml restart
```

### Frontend nezobrazuje nové funkce:
```bash
# Vyčistit cache
sudo docker-compose -f docker-compose.prod.yml exec frontend sh -c "rm -rf /app/build/*"

# Rebuild frontend
sudo docker-compose -f docker-compose.prod.yml build frontend --no-cache
```

## Architektura

```
Upload MP3 → FastAPI → Save DB → Celery Task Queued
                ↓
         Database Updated
                ↓
    Celery Worker → Generate Multi-Res → Save to MinIO → Update DB Status
                ↓
    Frontend Poll Status → Progressive Loading (Thumbnail → Standard → Full)
```

## Monitoring

Pro sledování výkonu můžete použít:

1. **Celery monitoring**:
```bash
sudo docker exec bsmarker_celery-worker_1 celery -A app.core.celery_app flower
```

2. **Redis monitoring**:
```bash
sudo docker exec bsmarker_redis_1 redis-cli monitor
```

3. **API endpoint pro statistiky**:
```bash
curl -k -H "Authorization: Bearer $TOKEN" \
  https://localhost/api/v1/recordings/123/spectrogram/status
```
