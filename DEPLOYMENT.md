# Deployment to Render.com

This guide explains how to deploy the Yang Gang Court Bot to Render.com.

## Prerequisites

1. A Render.com account
2. Your Telegram bot token
3. Your code pushed to a Git repository (GitHub, GitLab, etc.)

## Deployment Steps

### 1. Create a New Web Service

1. Go to [Render.com Dashboard](https://dashboard.render.com/)
2. Click "New" → "Web Service"
3. Connect your Git repository
4. Select the repository containing this bot code

### 2. Configure the Service

**Basic Settings:**
- **Name:** `yang-gang-court-bot` (or your preferred name)
- **Environment:** `Node`
- **Region:** Choose the closest to your users
- **Branch:** `main` (or your deployment branch)

**Build & Deploy:**
- **Build Command:** `npm install && npm run setup:db`
- **Start Command:** `npm start`

### 3. Environment Variables

Set the following environment variables in Render.com:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | Sets production mode |
| `TELEGRAM_BOT_TOKEN` | `your_bot_token_here` | Get from @BotFather |
| `DATABASE_PROVIDER` | `postgresql` | Database type for production |
| `DATABASE_URL` | `your_postgresql_url_here` | PostgreSQL connection string |

**Important:** Never commit your actual bot token or database credentials to Git. Always use environment variables.

#### Database Configuration

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

For Render.com, you can use their managed PostgreSQL service or provide your own PostgreSQL URL.

#### Database Setup Commands

The project includes convenient scripts for database setup:

```bash
# Automatic setup based on NODE_ENV
npm run setup:db

# Development (SQLite) - explicit commands
npm run dev:db:setup
npm run dev:db:generate
npm run dev:db:push
npm run dev:db:studio

# Production (PostgreSQL) - explicit commands  
npm run prod:db:setup
npm run db:generate
npm run db:push
npm run db:migrate:prod
```

### 4. Health Check

Render.com will automatically use the `/health` endpoint to monitor your service.

### 5. Custom Domain (Optional)

After deployment, you can add a custom domain in the service settings.

## File Structure for Render.com

The following files are specifically configured for Render.com:

- `render.yaml` - Render.com service configuration
- `build.sh` - Custom build script
- `src/server.js` - Updated for Render.com webhooks

## Environment Variables Explained

### `RENDER_EXTERNAL_URL`
- Automatically provided by Render.com
- Used to set the Telegram webhook URL
- Format: `https://your-service-name.onrender.com`

### `PORT`
- Automatically provided by Render.com
- Default: 10000
- Your app must listen on this port

## Webhook Configuration

The bot automatically configures the Telegram webhook when deployed to Render.com:

1. Render.com provides `RENDER_EXTERNAL_URL`
2. The bot sets webhook to: `${RENDER_EXTERNAL_URL}/webhook`
3. Telegram sends updates to this endpoint

## Database Persistence

**Development:** Uses SQLite database (`data.db`) stored locally.

**Production:** Uses PostgreSQL database for better performance and reliability. Render.com offers managed PostgreSQL services or you can use external PostgreSQL providers.

## Monitoring

- **Health Check:** `https://your-service.onrender.com/health`
- **Service Status:** `https://your-service.onrender.com/`
- **Logs:** Available in Render.com dashboard

## Troubleshooting

### Bot Not Responding
1. Check Render.com logs for errors
2. Verify `TELEGRAM_BOT_TOKEN` is set correctly
3. Ensure webhook is set: check logs for "Webhook set to:" message

### Database Issues
1. Check if `DATABASE_URL` environment variable is correct
2. Verify build process completed successfully
3. Check logs for Prisma-related errors

### Webhook Issues
1. Verify `RENDER_EXTERNAL_URL` is available in logs
2. Check if webhook endpoint returns 200 status
3. Test health check endpoint

## Development vs Production

- **Development:** Uses polling (no webhook needed)
- **Production:** Uses webhooks for better performance

The `NODE_ENV` environment variable controls this behavior.

## Support

If you encounter issues:
1. Check Render.com service logs
2. Verify all environment variables are set
3. Test the health check endpoint
4. Review the webhook configuration in logs
