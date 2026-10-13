# MedMedia

A verified network for doctors and healthcare students: a feed with case polls, short clips (Medclips), an opportunities board, search, profiles, and a credential review queue for admins.

One Node process serves both the API and the web app, backed by PostgreSQL. File uploads go to object storage (recommended) or local disk.

```
medmedia/
├─ server/        Express 5 + TypeScript + PostgreSQL (plain SQL, no ORM)
│  ├─ migrations/   SQL migrations, applied automatically on boot
│  ├─ src/          routes, middleware, storage, config
│  └─ test/smoke.ts end-to-end test (47 checks)
├─ web/           React 18 + Vite + TypeScript
├─ Dockerfile     multi-stage build, runs as non-root
├─ docker-compose.yml   app + Postgres in one command
├─ railway.json   render.yaml   deploy configs
└─ .github/workflows/ci.yml     typecheck, build, smoke test on every push
```

## Why the old version crashed under load, and what changed

| Problem | What this version does |
|---|---|
| Media (especially video) uploaded through and served by the Node process, filling memory and blocking requests | Browsers upload **directly to S3/R2** with short-lived signed URLs. Media is served from a CDN. Node never touches the bytes. |
| Unbounded queries and offset paging | **Keyset (cursor) pagination** on every list, hard limit of 50 per page, indexes on every filter/sort column |
| DB connection exhaustion | One shared pool, `DB_POOL_MAX` cap, 5s connection timeout, 15s statement timeout, advisory-locked migrations so replicas can start together |
| An extra DB query on every request to load the user | Cached for 5 seconds (invalidated instantly on changes) |
| Likes and counts computed with `COUNT(*)` on each read | Denormalised counters updated in the same transaction |
| Random 502s behind a load balancer | `keepAliveTimeout` raised above the proxy's 60s idle timeout |
| One uncaught error killing the process | Global error handler, `unhandledRejection` logging, clean exit on fatal errors so the platform restarts a fresh process, graceful `SIGTERM` shutdown |
| Health check restarting the app when the DB blipped | `/healthz` (process only, used by the platform) and `/api/health` (checks the DB) are separate |
| Frontend assets served with no caching | Hashed assets cached for a year, gzip enabled, about 80 KB gzipped in total |
| No abuse protection | Per-IP rate limit, stricter login limit, per-user write and upload limits |
| Credential documents in a public folder | Stored in a **separate private bucket**, readable only by admins through short-lived links |

## Run it locally

You need Node 20+ and PostgreSQL 14+.

```bash
cp .env.example server/.env        # then edit DATABASE_URL and JWT_SECRET
npm install
npm run seed                       # creates tables + demo data
npm run dev:server                 # API on http://localhost:5000
npm run dev:web                    # web on http://localhost:5173 (in a second terminal)
```

Sign in with `asha@demo.medmedia.app` / `Password123!`. Put that email in `ADMIN_EMAILS` to get the review queue.

Run the end-to-end test while the server is running:

```bash
npm run smoke -w server
```

### Or with Docker

```bash
JWT_SECRET=$(openssl rand -hex 32) ADMIN_EMAILS=you@example.com docker compose up --build
# open http://localhost:5000
```

## Deploy to Railway (recommended, about 15 minutes)

1. **Push this project to GitHub.** (`git init && git add . && git commit -m "MedMedia v2"`, then push to a new repo.)
2. **Create the project.** On [railway.com](https://railway.com): New Project → Deploy from GitHub repo → pick the repo. Railway reads `railway.json` and builds with the Dockerfile.
3. **Add the database.** In the project: New → Database → PostgreSQL.
4. **Set variables** on the app service (Variables tab):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway reference to the database you just added; if you ever use the *public* proxy URL instead, also set `DB_SSL=true`)
   - `JWT_SECRET` = output of `openssl rand -hex 32`
   - `NODE_ENV` = `production`
   - `ADMIN_EMAILS` = your email (this account will review verification requests)
   - `STORAGE_DRIVER` = `s3` and the `S3_*` variables from the next section
5. **Create a public URL.** Settings → Networking → Generate Domain.
6. **Deploy.** Migrations run automatically on first boot. Watch the logs for `MedMedia listening`.
7. **Check it.** Open `https://<your-domain>/api/health`. You should see `{"ok":true,"db":"up",...}`. Then register an account with your admin email, and you will see **Review** in the menu.

> Do not run `npm run seed` against production. It refuses unless you set `SEED_ALLOW=true`, and it creates demo accounts with a known password.

### Set up file storage (Cloudflare R2, free tier is generous)

You need **two buckets**: one public for media, one private for credential documents.

1. In Cloudflare: R2 → Create bucket → `medmedia-public`. Create another: `medmedia-private`.
2. On `medmedia-public` only: Settings → Public access → connect a custom domain (best) or enable the `r2.dev` URL. That URL is your `S3_PUBLIC_BASE_URL`. **Never enable public access on the private bucket.**
3. R2 → Manage API tokens → Create token with **Object Read & Write**, scoped to both buckets. Copy the Access Key ID and Secret.
4. On **both** buckets: Settings → CORS policy, so browsers may upload directly:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-APP-DOMAIN"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

5. Set these on the app:

```
STORAGE_DRIVER=s3
S3_BUCKET=medmedia-public
S3_PRIVATE_BUCKET=medmedia-private
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=https://media.yourdomain.com
```

AWS S3 works the same way: leave `S3_ENDPOINT` empty, set `S3_REGION`, and use a CloudFront or bucket URL for `S3_PUBLIC_BASE_URL`. The app refuses to start if the two buckets are the same.

**Just want to try it without a bucket?** Use `STORAGE_DRIVER=local` and attach a Railway Volume mounted at `/app/data`. Without a volume, uploads vanish on every deploy. This is fine for a demo and not for real traffic.

## Deploy elsewhere

**Render:** New → Blueprint → select the repo. `render.yaml` creates the web service and database. Fill in the prompted variables.

**Any VPS with Docker** (DigitalOcean, Hetzner, EC2):

```bash
git clone <your repo> && cd medmedia
cat > .env <<EOF
DATABASE_URL=postgres://user:pass@your-db-host:5432/medmedia
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_EMAILS=you@example.com
STORAGE_DRIVER=s3
# ...S3_* variables
EOF
docker build -t medmedia .
docker run -d --name medmedia --restart unless-stopped --env-file .env -p 5000:5000 medmedia
```

Put Caddy or nginx in front for HTTPS. Caddy needs only: `yourdomain.com { reverse_proxy localhost:5000 }`.

**Fly.io, Cloud Run, Kubernetes:** the Docker image is stateless when `STORAGE_DRIVER=s3`, listens on `$PORT`, and exposes `/healthz`, so it works on any of them.

## Handling heavy load

Do these in order. Stop when the site is healthy.

1. **Use S3/R2 for media.** This is the single biggest win.
2. **Find the real bottleneck** before scaling. Load test a staging copy:
   ```bash
   npx autocannon -c 200 -d 30 -H "Cookie: mm_token=<token from your browser>" https://staging.example.com/api/posts
   ```
   Watch `/api/health`: if `pool.waiting` is above zero for long, the database connections are the limit.
3. **Scale the app:** add replicas (the app is stateless). Keep `replicas × DB_POOL_MAX` below your database's `max_connections`. For many replicas, put PgBouncer (or your provider's pooler) in front of Postgres.
4. **Scale the database:** a bigger instance and a read replica come before anything exotic. Indexes for the main queries (feeds, comments, search, opportunities by type) are already in place.
5. **Rate limiting across replicas:** the built-in limiter is per instance. At several replicas, move it to Redis (`rate-limit-redis`). The same goes for the 5-second user cache, which is fine as is (changes reach other instances within 5 seconds).
6. **Put Cloudflare in front** for TLS, DDoS protection, and caching of `/assets`.

### If it still crashes, read the logs first

| In the logs | Cause | Fix |
|---|---|---|
| `exit code 137`, `OOM`, `JavaScript heap out of memory` | Out of memory | Bigger instance; confirm uploads use S3 |
| `timeout exceeded when trying to connect`, `too many clients already` | DB connections exhausted | Lower `DB_POOL_MAX`, add a pooler, fewer replicas |
| `canceling statement due to statement timeout` | A slow query | Check the table has data growth the indexes cover; look at the query in the log |
| 502/504 from the proxy | Proxy idle timeout shorter than keep-alive | Already handled (65s); check your proxy's timeout |
| `Invalid environment configuration` | Missing/invalid env var | The message lists exactly which |

## Verification (how the badge works)

1. A member uploads a registration certificate (doctors) or college ID (students) from their profile. It goes to the **private** bucket.
2. An admin (anyone listed in `ADMIN_EMAILS`) opens **Review**, views the document through a link that expires in two minutes, and approves or rejects.
3. Approved members get the verified badge and can post Medclips and opportunities. Only verified doctors can post jobs and freelance work.

Anyone signed in can post updates and case polls. Case polls and images require an explicit confirmation that nothing identifies a patient.

## Security notes

- Passwords: scrypt with per-user salt. Sessions: signed JWT in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie (also accepted as a `Bearer` token for a mobile app).
- Uploads: type allowlist, size limits, content-signature check for local files, random server-generated names, `nosniff`.
- Helmet with a strict CSP, rate limits, input validation on every route (zod), parameterised SQL everywhere.
- The whole API requires sign-in, apart from register and login, so profiles and posts cannot be scraped anonymously.
- Set a strong `JWT_SECRET`. Rotating it signs everyone out.

## What this version does not include

- **The Expo mobile app.** The new API accepts `Authorization: Bearer <token>` (returned by login and register), so the existing mobile app can be pointed at it, but its screens would need updating to the new endpoints.
- **Password reset and email verification.** These need an email provider (Resend, SES, Postmark). The `users` table is ready for it.
- **Push notifications, direct messages, and content moderation tooling.** Admins can delete any post, clip or listing; reporting flows are not built.
- **Legal review.** If you handle patient-adjacent content in India, get advice on the DPDP Act and your terms of use before launch.

## Environment variables

See `.env.example` for the full list with comments. Required: `DATABASE_URL`, `JWT_SECRET`.
