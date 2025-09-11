# ✅ BSMarker Pre-commit Hook System - AKTIVOVÁN

## 🎉 Systém pre-commit hooks byl úspěšně aktivován!

### 📋 Co bylo nainstalováno:

#### Python nástroje (backend):
- ✅ **Black** - automatické formátování kódu
- ✅ **isort** - organizace importů
- ✅ **Flake8** - linting a style kontroly
- ✅ **MyPy** - kontrola typů
- ✅ **Pylint** - pokročilá analýza kódu
- ✅ **Bandit** - bezpečnostní skenování
- ✅ **detect-secrets** - detekce citlivých dat
- ✅ **yamllint** - validace YAML souborů
- ✅ **sqlfluff** - SQL linting

#### Node.js nástroje (frontend):
- ✅ **Husky** - Git hooks management
- ✅ **lint-staged** - kontrola pouze změněných souborů
- ✅ **commitlint** - validace commit zpráv
- ✅ **ESLint** - JavaScript/TypeScript linting
- ✅ **Prettier** - formátování kódu

### 🚀 Jak používat:

#### 1. Běžný commit:
```bash
git add .
git commit -m "feat(backend): add new feature"
# Hooks automaticky zkontrolují váš kód
```

#### 2. Formát commit zpráv:
```
<type>(<scope>): <subject>

Typy: feat, fix, docs, style, refactor, perf, test, build, ci, chore, security
Scopes: backend, frontend, api, auth, db, docker, etc.
```

#### 3. Příklady správných commitů:
```bash
git commit -m "feat(backend): implement JWT refresh tokens"
git commit -m "fix(frontend): resolve canvas rendering issue"
git commit -m "security(api): fix SQL injection vulnerability"
git commit -m "docs: update installation instructions"
```

### 🛠️ Užitečné příkazy:

#### Ruční spuštění kontrol:
```bash
# Spustit všechny pre-commit kontroly
source .venv/bin/activate
pre-commit run --all-files

# Spustit konkrétní kontrolu
pre-commit run black --all-files
pre-commit run flake8 --all-files

# Automaticky opravit formátování
black backend/app/
isort backend/app/
```

#### Bypass hooks (pouze v nouzi!):
```bash
git commit --no-verify -m "emergency: critical fix"
```

### 📁 Konfigurace:

- **`.pre-commit-config.yaml`** - hlavní konfigurace pre-commit
- **`package.json`** - lint-staged a husky konfigurace
- **`commitlint.config.js`** - pravidla pro commit zprávy
- **`.yamllint.yml`** - YAML linting pravidla
- **`.secrets.baseline`** - baseline pro detekci secrets

### ⚠️ První commit může trvat déle!

Při prvním commitu se stahují a instalují všechny nástroje.
Následující commity budou rychlejší.

### 🔧 Řešení problémů:

#### Pokud hooks nefungují:
```bash
# Reinstalace
source .venv/bin/activate
pre-commit uninstall
pre-commit install
pre-commit install --hook-type commit-msg
pre-commit install --hook-type pre-push
```

#### Pokud chcete aktualizovat nástroje:
```bash
source .venv/bin/activate
pre-commit autoupdate
```

### 📈 Výhody aktivovaného systému:

1. **Konzistentní kód** - automatické formátování
2. **Méně bugů** - type checking a linting
3. **Bezpečnost** - detekce citlivých dat a vulnerabilit
4. **Čistá historie** - standardizované commit zprávy
5. **Rychlejší review** - kód je již zkontrolován

### 🎯 Co se kontroluje při každém commitu:

- ✓ Python formátování (Black)
- ✓ Import sorting (isort)
- ✓ Syntax a style (Flake8)
- ✓ Type hints (MyPy)
- ✓ Bezpečnostní problémy (Bandit)
- ✓ Hardcoded secrets
- ✓ YAML/JSON validace
- ✓ SQL syntax
- ✓ Velikost souborů
- ✓ Merge konflikty
- ✓ Commit message formát

---

**Hook systém je plně funkční a připraven k použití!** 🚀
