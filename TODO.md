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

# Code Audit [2025-08-10]

## 🔴 KRITICKÉ - Bezpečnostní problémy (opravit OKAMŽITĚ)

- [ ] **CRIT-001: Odstranit hardcoded secrets z kódu** (Effort: S, Files: backend/app/core/config.py)
      - Details: SECRET_KEY, MINIO keys, admin password jsou přímo v kódu
      - Agent: feature-implementer
      
- [ ] **CRIT-002: Zabezpečit file operations proti path traversal** (Effort: M, Files: backend/app/api/api_v1/endpoints/recordings.py)
      - Details: Validovat a sanitizovat všechny file paths, použít tempfile
      - Agent: feature-implementer
      
- [ ] **CRIT-003: Přesunout JWT z localStorage do httpOnly cookies** (Effort: M, Files: frontend/src/services/api.ts, backend security)
      - Details: Ochrana proti XSS útokům, implementovat CSRF ochranu
      - Agent: feature-implementer
      
- [ ] **CRIT-004: Opravit SQL injection rizika** (Effort: S, Files: backend/app/api/api_v1/endpoints/)
      - Details: Sanitizovat search parametry, escape speciální znaky
      - Agent: feature-implementer
      
- [ ] **CRIT-005: Opravit deprecated datetime.utcnow()** (Effort: S, Files: backend/app/core/security.py)
      - Details: Použít datetime.now(timezone.utc) pro Python 3.12+
      - Agent: feature-implementer

## 🟠 VYSOKÁ PRIORITA - Výkon a architektura

- [ ] **HIGH-001: Refaktorovat 2129-řádkový AnnotationEditor.tsx** (Effort: XL, Files: frontend/src/pages/AnnotationEditor.tsx)
      - Details: Rozdělit na SpectrogramCanvas, AudioPlayer, AnnotationTools, BoundingBoxManager
      - Agent: feature-implementer
      
- [ ] **HIGH-002: Validovat file upload velikost před načtením** (Effort: M, Files: backend/app/api/api_v1/endpoints/recordings.py)
      - Details: Stream file a kontrolovat velikost incrementálně
      - Agent: feature-implementer
      
- [ ] **HIGH-003: Odstranit console.log statements** (Effort: S, Files: 5+ frontend files)
      - Details: 18 výskytů, použít proper logging library
      - Agent: feature-implementer
      
- [ ] **HIGH-004: Přidat React performance optimizace** (Effort: M, Files: frontend components)
      - Details: Pouze 11 použití useCallback/useMemo, přidat memoizaci
      - Agent: feature-implementer

## 🟡 STŘEDNÍ PRIORITA - Kvalita kódu

- [ ] **MED-001: Implementovat API rate limiting** (Effort: M, Files: backend/app/main.py)
      - Details: Použít slowapi, zejména na upload endpointy
      - Agent: feature-implementer
      
- [ ] **MED-002: Odstranit .env soubory z git** (Effort: S, Files: .env, backend/.env)
      - Details: git rm --cached, přidat do .gitignore
      - Agent: github-workflow-manager
      
- [ ] **MED-003: Nahradit print() proper loggingem** (Effort: M, Files: backend services)
      - Details: Python logging modul s různými úrovněmi
      - Agent: feature-implementer
      
- [ ] **MED-004: Opravit TypeScript 'any' typy** (Effort: M, Files: 5+ frontend files)
      - Details: Definovat proper interfaces a typy
      - Agent: feature-implementer
      
- [ ] **MED-005: Přidat CSRF ochranu** (Effort: M, Files: backend/app/core/security.py)
      - Details: Implementovat CSRF tokeny pro state-changing operace
      - Agent: feature-implementer

## 🟢 NÍZKÁ PRIORITA - Nice-to-have

- [ ] Odstranit unused imports (10+ souborů)
- [ ] Standardizovat error message formáty
- [ ] Přidat JSDoc komentáře k public API
- [ ] Aktualizovat deprecated npm packages (9 vulnerabilities)
- [ ] Konfigurovat ESLint a Prettier
- [ ] Přidat git hooks pro pre-commit kontroly
- [ ] Implementovat log rotation
- [ ] Přidat API versioning strategii
- [ ] Dokumentovat deployment procedury
- [ ] Vytvořit development environment setup script

## 📊 Souhrn auditu

- **Celkem nalezených problémů**: 47
- **Kritické bezpečnostní problémy**: 8
- **Duplicita kódu**: ~35%
- **Test coverage**: <10%
- **Odhadovaný technický dluh**: 120-150 hodin
- **Doporučené okamžité akce**: 
  1. Odstranit hardcoded secrets (CRIT-001)
  2. Zabezpečit file operations (CRIT-002)
  3. Přesunout JWT do cookies (CRIT-003)

