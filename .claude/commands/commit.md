---
description: Automated commit with pre-commit hook validation and error fixing
---

# Overview

Tento příkaz automaticky:
1. Přepni na dev branch
2. Zkontroluj a oprav pre-commit hook chyby
3. Opakuj commit, dokud pre-commit hook neprojde úspěšně

## Workflow

VERY IMPORTANT: Preflight: zkontroluj, že se v local changes nenechází soubory, které se nemají dostat na github nebo citlivé informace, zbytečné jednorázové skripty atd. - všechno takové odstraň

!git checkout dev

!git status

!git add .

# Commit
!git commit -m "$ARGUMENTS" || echo "Pre-commit hook failed, analyzing errors..."

# Analyzuj a oprav pre-commit chyby
Read package.json to understand available lint/format commands

# Spusť lint a format
!npm run lint --fix || true
!npm run format || npx prettier --write . || true  
!npm run type-check || true

# Zkus commit znovu
!git add .
!git commit -m "$ARGUMENTS" || echo "Still failing, need manual intervention"

# Pokud stále selhává, zobraz detailní chyby
!git status
!npm run lint 2>&1 | head -20
!npm run type-check 2>&1 | head -20

Automaticky opravuj časté problémy:
- ESLint chyby pomocí --fix
- Prettier formátování 
- TypeScript type chyby
- Git staged files

Pokud hook stále selhává, zobrazuji detailní chyby pro manuální opravu.

VERY IMPORTANT: Nikdy nepřeskakuj pre-commit hooky!
VERY IMPORTANT: Na konci pushni změny a přidej do PR do main. Pokud PR do main větve neexistuje, vytvoř ho.
