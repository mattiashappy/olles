# olles

## Köra appen lokalt

```bash
npm install
npm run dev
```

Öppna sedan `http://localhost:3000`.

---

## Deploy till Heroku (nuvarande app med SQLite)

Den här appen använder **SQLite** (`better-sqlite3`). Den kan köras på Heroku, men databasen blir då **tillfällig** (ephemeral) eftersom dynons filsystem återställs vid omstart/deploy.

I den här repo-konfigurationen används:

- `Procfile` med `web: npm start`
- `PORT` från Heroku (redan stöds i `server.js`)
- `DB_PATH=/tmp/crm.db` automatiskt på Heroku (via `DYNO`)

### 1) Skapa app

```bash
heroku create <your-app-name>
```

### 2) Deploya

```bash
git push heroku main
```

### 3) Kontrollera loggar

```bash
heroku logs --tail
```

Du ska se att servern startar och att DB initieras i `/tmp/crm.db`.

---

## Viktigt om data på Heroku

Med nuvarande SQLite-upplägg försvinner data när dynon startas om.

Om du behöver persistent data i produktion bör appen byggas om till Postgres (Heroku Postgres). Denna kodbas är ännu inte migrerad till Postgres-frågor/driver.

---

## Miljövariabler

Valfria variabler:

- `PORT` – sätts automatiskt av Heroku
- `DB_PATH` – tvinga egen SQLite-sökväg

Exempel lokalt:

```bash
DB_PATH="./crm.db" npm start
```
