# Požadavky na nástroj pro segmentaci a anotaci ptačího zpěvu

## Zobrazení dat

- [ ] Možnost **synchronizovaného zoomování** a posouvání mezi spektrogramem a waveformem
- [ ] Zobrazení **časových měřítek** (v ms) a **frekvenčních měřítek** (v kHz)
- [ ] Barevné rozlišení bounding boxů (asi podle labelů) 


---

## 🖱️ Manuální anotace segmentů

- [ ] Každý segment (obdélník) je **viditelně propojen** s waveformem
      → Na waveformu se zobrazí pouze **časová projekce** obdélníku
- [ ] Možnost **pohybovat obdélníky** – při posunu v čase se odpovídající indikátor obdélníku na waveformu také posune

---

## Anotace motivů

- [ ] Aktivní obdélník lze **označit stiskem klávesy** `A–Z`  
      → Label (např. `A`, `B`, ...) se zobrazí **přímo nad obdélníkem**
- [ ] Každý label je jednoznačně svázaný s konkrétním segmentem
- [ ] Při výběru segmentu lze **rychle přepsat label**

---

## Navigace a informace

- [ ] Při výběru nebo označování segmentu se zobrazí vlevo nad spektrogramem:  
      → **Délka segmentu v ms** (aby vědci viděli, že segment a nebo nějaký jejich výběr má třeba 10ms)
- [ ] Možnost **klikem přehrát segment** (ze spektrogramu nebo waveformu)
- [ ] Klávesová navigace: posun mezi segmenty, undo/redo, krok zpět

---

## Export a ukládání

- [ ] vhodně implementovat možnost **exportu** segmentů do souboru ve vhodných formátech. - třeba promyslet

---

## 🌱 Plánované rozšíření

- [ ] **Kopírování více segmentů najednou**  
      → Označit více segmentů, kopírovat je i s labely a pozicí
- [ ] Skupinové označování segmentů
      → Když si například s Ctr vyberu 4 segmenty a zmáčknu písmeno nebo někde do inputu napíšu "A", tak se všem přiřadí label A
- [ ] Auto-save změn + možnost ručního ukládání (jen pro pohodlí)??

---

# Code Audit [2025-08-10] - UPDATED

## 🚨 OKAMŽITÉ AKCE (Udělat DNES - 4-6 hodin)

- [x] **IMMEDIATE-001: Emergency Secret Rotation** (✓ Completed: 2025-08-10 10:35)
      - Details: Vytvořit .env s novými secrets, update config.py pro env vars, rotovat všechny klíče
      - Agent: feature-implementer
      
- [x] **IMMEDIATE-002: Fix Path Traversal** (✓ Completed: 2025-08-10 10:35)
      - Details: Použít tempfile.NamedTemporaryFile, validovat paths s pathlib
      - Agent: feature-implementer
      
- [x] **IMMEDIATE-003: Add Basic Rate Limiting** (✓ Completed: 2025-08-10 10:35)
      - Details: Instalovat slowapi, limity: upload 5/min, auth 10/min
      - Agent: feature-implementer
      
- [ ] **IMMEDIATE-004: Fix File Upload Size Check** (Effort: 30min, Files: backend/app/api/api_v1/endpoints/recordings.py)
      - Details: Stream file a kontrolovat velikost incrementálně před načtením
      - Agent: feature-implementer
      
- [x] **IMMEDIATE-005: Fix datetime.utcnow()** (✓ Completed: 2025-08-10 10:35)
      - Details: Nahradit datetime.now(timezone.utc)
      - Agent: feature-implementer

## 🔴 KRITICKÉ - Bezpečnostní problémy (Týden 1)

- [ ] **CRIT-001: Implement Secure JWT Storage** (Effort: L/8h, Files: backend auth, frontend AuthContext)
      - Details: Přesunout JWT do httpOnly cookies, přidat CSRF tokeny, refresh token mechanismus
      - Agent: feature-implementer
      
- [ ] **CRIT-002: SQL Injection Prevention** (Effort: M/2h, Files: backend endpoints with search)
      - Details: Sanitizovat všechny search parametry, použít parametrizované queries
      - Agent: feature-implementer
      
- [ ] **CRIT-003: Remove .env from Git History** (Effort: S/30min, Files: .env, backend/.env)
      - Details: git rm --cached .env backend/.env, přidat do .gitignore, BFG cleaner na historii
      - Agent: github-workflow-manager
      
- [ ] **CRIT-004: Fix NPM Vulnerabilities** (Effort: S/2h, Files: package.json)
      - Details: npm audit fix --force, update vulnerable packages (9 high, 6 moderate)
      - Agent: feature-implementer
      
- [ ] **CRIT-005: Implement CSRF Protection** (Effort: M/6h, Files: backend/app/core/security.py)
      - Details: CSRF tokeny pro všechny state-changing operace
      - Agent: feature-implementer
      
- [ ] **CRIT-006: Secure CORS Configuration** (Effort: S/1h, Files: backend/app/main.py)
      - Details: Specifikovat exact methods a headers místo ["*"]
      - Agent: feature-implementer
      
- [ ] **CRIT-007: Add Security Headers** (Effort: S/1h, Files: backend/app/main.py)
      - Details: X-Frame-Options, X-Content-Type-Options, CSP headers
      - Agent: feature-implementer

## 🟠 VYSOKÁ PRIORITA - Výkon a architektura (Týden 2)

- [ ] **HIGH-001: Refactor 2129-line AnnotationEditor.tsx** (Effort: XL/16h, Files: frontend/src/pages/AnnotationEditor.tsx)
      - Details: Split: SpectrogramCanvas, AudioPlayer, AnnotationTools, BoundingBoxManager, KeyboardHandler
      - Agent: feature-implementer
      
- [ ] **HIGH-002: Add Database Connection Pooling** (Effort: M/3h, Files: backend/app/db/session.py)
      - Details: SQLAlchemy connection pool configuration
      - Agent: feature-implementer
      
- [ ] **HIGH-003: Fix N+1 Query Problems** (Effort: M/4h, Files: backend endpoints)
      - Details: Use eager loading with joinedload/selectinload
      - Agent: feature-implementer
      
- [ ] **HIGH-004: React Performance Optimizations** (Effort: M/6h, Files: frontend components)
      - Details: Add React.memo, useCallback, useMemo where needed
      - Agent: feature-implementer
      
- [ ] **HIGH-005: Remove Console.log Statements** (Effort: S/2h, Files: 18 locations in frontend)
      - Details: Remove all console.log, implement proper logging library
      - Agent: feature-implementer
      
- [ ] **HIGH-006: Fix TypeScript 'any' Types** (Effort: M/4h, Files: 13+ frontend files)
      - Details: Define proper interfaces and types
      - Agent: feature-implementer

## 🟡 STŘEDNÍ PRIORITA - Kvalita kódu (Týden 3)

- [ ] **MED-001: Implement Logging Framework** (Effort: M/4h, Files: backend services)
      - Details: Replace print() with Python logging module
      - Agent: feature-implementer
      
- [ ] **MED-002: Create Basic Test Suite** (Effort: L/8h, Files: new test files)
      - Details: Auth tests, file upload tests, critical path e2e
      - Agent: test-debugger-reporter
      
- [ ] **MED-003: Add Database Migrations** (Effort: M/4h, Files: backend/alembic)
      - Details: Setup Alembic, create initial migrations
      - Agent: feature-implementer
      
- [ ] **MED-004: Implement Request ID Tracking** (Effort: M/3h, Files: backend middleware)
      - Details: Correlation IDs for debugging across services
      - Agent: feature-implementer
      
- [ ] **MED-005: Add Input Validation** (Effort: M/4h, Files: backend schemas)
      - Details: Comprehensive Pydantic validation for all inputs
      - Agent: feature-implementer

## 🟢 NÍZKÁ PRIORITA - Nice-to-have (Týden 4+)

- [ ] Setup CI/CD Pipeline (GitHub Actions)
- [ ] Remove unused imports (10+ files)
- [ ] Standardize naming conventions
- [ ] Add JSDoc/docstrings
- [ ] Configure ESLint and Prettier
- [ ] Add git pre-commit hooks
- [ ] Implement log rotation
- [ ] Add health check endpoints
- [ ] Create development setup script
- [ ] Add API documentation (OpenAPI)
- [ ] Implement graceful shutdown
- [ ] Add monitoring/metrics endpoints

## 📊 Souhrn auditu - AKTUALIZOVÁNO

- **Celkem nalezených problémů**: 78
- **Kritické bezpečnostní problémy**: 12
- **Vysoká priorita problémů**: 18
- **Duplicita kódu**: ~40%
- **Test coverage**: 0%
- **Odhadovaný technický dluh**: 180-220 hodin
- **Code Quality Score**: 42/100

## 🎯 Doporučené okamžité akce (TOP 3)

1. **TERAZ**: Odstranit hardcoded secrets a vytvořit .env (30 min)
2. **TERAZ**: Opravit path traversal vulnerability (1 hodina)
3. **TERAZ**: Přidat basic rate limiting (1 hodina)

## 📈 Success Metrics

**Týden 1 cíle:**
- [ ] Žádné hardcoded secrets v kódu
- [ ] Path traversal opraveno
- [ ] Rate limiting aktivní
- [ ] .env files odstraněny z git

**Týden 2 cíle:**
- [ ] JWT v httpOnly cookies
- [ ] AnnotationEditor refaktorovaný
- [ ] Základní testy >20% coverage

**Full Implementation (4 týdny):**
- [ ] Test coverage >60%
- [ ] Security vulnerabilities: 0
- [ ] Code quality score >85
- [ ] Performance: <2s page load, <200ms API
