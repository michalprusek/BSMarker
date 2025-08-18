---
description: Automated commit with pre-commit hook validation and error fixing
---

# Smart Commit Command

Tento příkaz automaticky:
1. Přepne na dev branch
2. Zkontroluje a opraví pre-commit hook chyby
3. Opakuje commit, dokud hook neprojde úspěšně

Použití: `/commit`

## Implementation

!git checkout dev

!git status

!git add .

# Pokus o commit s pre-commit hook validací
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

Automaticky opravuji časté problémy:
- ESLint chyby pomocí --fix
- Prettier formátování 
- TypeScript type chyby
- Git staged files

Pokud hook stále selhává, zobrazuji detailní chyby pro manuální opravu.