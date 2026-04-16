# olles

## Deploying to Heroku with Postgres

You can deploy this app to Heroku and connect it to PostgreSQL by using a `DATABASE_URL` environment variable.

> Important: the connection string shared in chat appears to contain real credentials. Rotate/reset that database password before using it in production.

### 1) Configure environment variables

Heroku automatically provides `DATABASE_URL` for attached Postgres add-ons.
For local development, create a `.env` file:

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DB_NAME"
```

### 2) Parse SSL correctly (required on Heroku Postgres)

Most Heroku Postgres plans require SSL/TLS. Ensure your app enables SSL for database connections.

- **Node (`pg`)**: use `ssl: { rejectUnauthorized: false }` when on Heroku.
- **Python (`psycopg` / SQLAlchemy)**: append `?sslmode=require` if missing.
- **Ruby (`pg` / Rails)**: set `sslmode: require` in database config for production.

### 3) Heroku app setup

```bash
heroku create <your-app-name>
heroku addons:create heroku-postgresql:mini
heroku config
```

### 4) If you must set an external database URL

If you are not using a Heroku-managed Postgres instance:

```bash
heroku config:set DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DB_NAME"
```

### 5) Release, migrate, and run

Make sure your app has:

- a valid startup command (for example via `Procfile`),
- dependency lock files,
- migration command in release phase (optional but recommended).

Example `Procfile` patterns:

```Procfile
web: <your-start-command>
# optional
release: <your-migration-command>
```

Then deploy:

```bash
git push heroku <branch>:main
heroku logs --tail
```

### 6) Verify DB connectivity

```bash
heroku run "printenv DATABASE_URL"
```

Then open your app and confirm DB-backed features (create/read/update/delete) work as expected.

---

If you want, I can next add framework-specific files (e.g., `Procfile`, runtime config, and migration release command) once you share your app stack (Node, Django, Rails, etc.).
