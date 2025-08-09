const express = require('express');
const Database = require('./database');

/**
 * Initialize SQLite database
 * @returns {Promise<Database>}
 */
async function initializeDatabase() {
  try {
    const database = new Database();
    await database.init();
    console.log('Database initialized successfully');
    return database;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    console.log('Bot will continue without database functionality');
    return null;
  }
}

/**
 * Start the Express server and configure it based on environment
 * @param {Object} options - Server configuration options
 * @param {number} options.port - Port to run server on
 * @param {boolean} options.isDevelopment - Whether running in development mode
 * @param {Object} options.bot - Telegram bot instance
 * @param {Object} options.database - Database instance
 */
function startExpressServer({ port, isDevelopment, bot, database }) {
  const app = express();
  app.use(express.json());

  // Webhook endpoint for Render.com (only used in production)
  app.post('/webhook', (req, res) => {
    try {
      console.log('Received webhook update:', JSON.stringify(req.body, null, 2));
      bot.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error handling webhook update:', error);
      res.sendStatus(500);
    }
  });

  // Health check endpoint for Render.com
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'OK', 
      message: 'Bot is running',
      database: database ? 'connected' : 'not available',
      timestamp: new Date().toISOString()
    });
  });

  // Root endpoint for Render.com service verification
  app.get('/', (req, res) => {
    res.status(200).json({
      message: 'Yang Gang Court Bot is running!',
      status: 'active',
      timestamp: new Date().toISOString()
    });
  });

  if (isDevelopment) {
    // In development mode, just start the bot with polling
    console.log(`Bot running in DEVELOPMENT mode with polling`);
    console.log(`Bot is listening for messages on localhost`);
    console.log(`Health check: http://localhost:${port}/health`);
    
    // Start Express server for health check only
    app.listen(port, () => {
      console.log(`Express server running on port ${port} (health check only)`);
    });
  } else {
    // In production mode, start the server and set webhook
    app.listen(port, () => {
      console.log(`Bot server running on port ${port}`);
      console.log(`Webhook endpoint: http://localhost:${port}/webhook`);
      console.log(`Health check: http://localhost:${port}/health`);
    });

    // Set webhook for Render.com (production only)
    // Render.com provides the service URL via RENDER_EXTERNAL_URL
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
      const webhookUrl = `${renderUrl}/webhook`;
      bot.setWebHook(webhookUrl).then(() => {
        console.log(`Webhook set to: ${webhookUrl}`);
      }).catch((error) => {
        console.error('Failed to set webhook:', error);
      });
    } else {
      console.warn('RENDER_EXTERNAL_URL not found. Webhook not set. Bot will not receive updates in production.');
    }
  }

  return app;
}

/**
 * Initialize and start the server
 * @param {Object} options - Server configuration options
 * @param {Object} options.bot - Telegram bot instance
 * @param {boolean} options.isDevelopment - Whether running in development mode
 * @returns {Promise<{database: Database, app: Object}>}
 */
async function startServer({ bot, isDevelopment }) {
  // Initialize database first
  const database = await initializeDatabase();
  
  const port = process.env.PORT || 3000;
  
  // Log environment info for debugging on Render.com
  console.log('Environment info:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- PORT:', port);
  console.log('- isDevelopment:', isDevelopment);
  console.log('- RENDER_EXTERNAL_URL:', process.env.RENDER_EXTERNAL_URL || 'not set');
  console.log('- Database connected:', database ? 'yes' : 'no');

  // Start Express server
  const app = startExpressServer({ 
    port, 
    isDevelopment, 
    bot, 
    database 
  });

  return { database, app };
}

module.exports = { startServer, initializeDatabase, startExpressServer };
