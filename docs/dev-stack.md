# DEV prostředí vedle produkce

DEV běží na stejném serveru jako produkce a je dostupné na
**<https://bsmarker.utia.cas.cz/dev/>**. Má vlastní databázi, Redis, MinIO i kontejnery, takže se
v něm dá zkoušet i změna backendu nebo migrace, aniž by se cokoliv stalo ostrým datům.

## Každodenní použití

```bash
./scripts/dev-deploy.sh                  # postaví a nasadí backend i frontend z pracovní kopie
./scripts/dev-deploy.sh dev-frontend     # jen jedna služba
./scripts/dev-seed.sh                    # nahraje kopii produkčních dat (databáze + audio)
./scripts/dev-seed.sh --db-only          # jen databáze, rychlé (audio je ta pomalá část)
```

Přihlášení do DEV: kterýkoliv produkční e-mail a heslo z `DEV_USER_PASSWORD` v `.env.dev`.
Seed přepíše všem uživatelům heslo právě na tuhle hodnotu.

Nasazení na produkci je i nadále ruční postup z `CLAUDE.md`, ten se nemění.

## Jak je to poskládané

| Část | Produkce | DEV |
|---|---|---|
| Compose soubor | `docker-compose.prod.yml` | `docker-compose.dev-server.yml` |
| Kontejnery | `bsmarker_<služba>_1` | `bsmarker_dev_<služba>` |
| Veřejná cesta | `/` a `/api/v1` | `/dev/` a `/dev/api/v1` |
| Nastavení | `.env` | `.env.dev` (vzor v `.env.dev.example`) |

Provoz rozděluje produkční nginx (`nginx/nginx.conf`, sekce *DEV stack*). Jména `dev-backend` a
`dev-frontend` se překládají až při každém požadavku, takže nginx nastartuje i tehdy, když DEV
neběží. Tehdy `/dev/` vrací 502 a produkce tím není dotčená.

## Tři věci, které se snadno rozbijí

1. **Jména služeb v DEV musí začínat `dev-`.** Služba v compose je na každé síti dostupná pod
   svým jménem. Kdyby se jmenovala `backend`, měly by na sdílené síti stejné jméno dvě služby,
   Docker by adresy střídal a část produkčního provozu by skončila v DEV. (Při stavbě se to
   přesně takhle na pár minut stalo. Datové služby proto na sdílenou síť vůbec nechodí.)
2. **`DOMAIN` musí být i v `.env.dev`.** Bez něj se do frontendu zapeče
   `https://localhost/dev/api/v1`. `scripts/dev-deploy.sh` to po buildu kontroluje a skončí chybou.
3. **`PUBLIC_URL=/dev` musí sedět na třech místech:** build frontendu (argument v compose),
   `basename` v `createBrowserRouter` (`frontend/src/App.tsx`) a předpona klíčů v
   `localStorage` (`frontend/src/utils/storage.ts`). Ta třetí věc brání tomu, aby si DEV a PROD
   na společné doméně přepisovaly přihlášení a zálohy neuložených boxů.

## Co DEV sdílí s produkcí

Jen nginx a Docker síť, po které se k DEV dostane. Databáze, fronty, úložiště souborů i podpisové
klíče jsou oddělené. Ověřeno: změna nahrávky přes `/dev/api/v1` se projeví jen v DEV databázi,
produkční řádek zůstane beze změny.
