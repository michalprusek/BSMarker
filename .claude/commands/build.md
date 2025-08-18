---
description: Clean Docker rebuild with health monitoring for prod/dev modes
---

# Smart Build Command

Tento příkaz automaticky:
1. Zastaví všechny Docker procesy
2. Promaže Docker environment
3. Sestaví a spustí aplikaci v čistém prostředí
4. Monitoruje zdraví všech služeb
5. Opravuje chyby a znovu sestavuje dokud vše neběží bezchybně

Použití: 
- `/build prod` - Production mode build
- `/build dev` - Development mode build

## Implementation

# Validace parametru
Check if $ARGUMENTS is "prod" or "dev", default to "dev" if empty

# Zastavení všech služeb
!make down || docker-compose down -v || true

# Kompletní cleanup Dockeru
!docker system prune -af --volumes
!docker builder prune -af

# Čtení Makefile pro pochopení build procesu
Read Makefile to understand build targets

# Build podle módu
If $ARGUMENTS = "prod":
  !make prod-build || docker-compose -f docker-compose.prod.yml build --no-cache
  !make prod-up || docker-compose -f docker-compose.prod.yml up -d
Else:
  !make clean
  !make build || docker-compose build --no-cache
  !make up || docker-compose up -d

# Čekání na spuštění služeb
!sleep 30

# Kontrola zdraví služeb
!make health || curl -f http://localhost:3000/health || echo "Health check failed"

# Monitorování logů pro chyby
!make logs | grep -E "(ERROR|FATAL|Failed|Exception)" | head -20

# Pokud jsou chyby, analyzuj je
Read logs to identify common issues:
- Port conflicts
- Database connection issues  
- Missing environment variables
- Service dependency failures
- Build compilation errors

# Pro každou nalezenou chybu:
# 1. Oprav konfiguraci
# 2. Rebuild problematickou službu
# 3. Restart služeb
# 4. Znovu zkontroluj zdraví

# Konečné ověření všech služeb
Test všechny endpointy:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api/health  
- ML Service: http://localhost:8000/health
- Prometheus: http://localhost:9090/-/ready
- Grafana: http://localhost:3030/api/health

# Zobraz finální status
!make health
!docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Automaticky řeší časté build problémy:
- Port konflikty
- Docker volume cleanup
- Service dependencies
- Environment variables
- Strict mode compilation errors