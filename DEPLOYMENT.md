## Deployment to CapRover

This guide explains how to deploy the Yang Gang Court Bot to CapRover.

## Prerequisites

1. A running CapRover server with a public domain and valid SSL
2. `caprover` CLI installed and logged in to your server
3. Your Telegram bot token from @BotFather
4. PostgreSQL database URL for production

## Deployment Steps

### 1. Create a New App on CapRover

1. Open your CapRover dashboard
2. Click "Apps" → "Create New App"
3. Enter an app name (e.g., `yang-gang-court-bot`) and create

### 2. Set Environment Variables

In the app settings → Environment Variables, add:

| Variable | Example | Notes |
|----------|---------|-------|
| `NODE_ENV` | `production` | Required |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC...` | From @BotFather |
| `DATABASE_PROVIDER` | `postgresql` | Use `sqlite` only for dev |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Prisma connection string |
| `EXTERNAL_URL` | `https://your-app.your-domain.com` | Public HTTPS URL of your app |

Important: Ensure `EXTERNAL_URL` matches the public domain you assign to the app.

### 3. Deploy the App

Option A — Deploy from GitHub with CapRover build:

1. In CapRover → App → Deployment Methods → "Deploy from a public Git repo"
2. Provide the repository URL and branch
3. CapRover will build using the `Dockerfile`

Option B — Local deploy with CapRover CLI:

```bash
caprover deploy --appName yang-gang-court-bot --tarFile ./
```

The included `Dockerfile` will:
- Install dependencies
- Copy the source code
- Run `npm run setup:db` during build
- Start the server on port 80

### 4. Set App HTTP Settings

1. In CapRover → App → HTTP Settings
2. Enable HTTPS
3. Assign a domain (e.g., `your-app.your-domain.com`)
4. Force HTTPS (recommended)

### 5. Webhook Configuration

In production, the bot uses webhooks. `src/setup.js` reads `EXTERNAL_URL` and sets:

```
${EXTERNAL_URL}/webhook
```

Ensure `EXTERNAL_URL` is set to your public HTTPS URL and the app is reachable; the bot will log "Webhook set to:" on startup.

### 6. Health Check

- Health endpoint: `/` returns `ok` (CapRover uses container health, but you can add an HTTP check if desired)

## Database Configuration

This bot supports different databases for different environments:

**Development (SQLite):**
```env
DATABASE_PROVIDER="sqlite"
DATABASE_URL="file:./data.db"
```

**Production (PostgreSQL):**
```env
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://username:password@host:port/database_name"
```

Database setup commands are automated via:

```bash
npm run setup:db
```

During production builds, migrations are applied if available, falling back to `db push`.

## Monitoring & Logs

- View logs in CapRover → App → Logs
- Check for: "Bot server running on port ..." and "Webhook set to: ..."

## Troubleshooting

- Bot not responding: verify `EXTERNAL_URL` and `TELEGRAM_BOT_TOKEN`
- Webhook not set: confirm the app is reachable over HTTPS and env var is correct
- Database issues: check `DATABASE_URL` and build logs for Prisma output

## Development vs Production

- Development uses polling (no webhook)
- Production uses webhooks configured via `EXTERNAL_URL`

`NODE_ENV` controls this behavior.
