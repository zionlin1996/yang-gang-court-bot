const TelegramBot = require('node-telegram-bot-api');

/**
 * Creates and configures a Telegram bot instance
 * @param {string} token - The Telegram bot token
 * @param {boolean} isDevelopment - Whether the bot is running in development mode
 * @returns {TelegramBot} The configured bot instance
 */
function createBot(token, isDevelopment = false) {
  if (!token) {
    throw new Error('Telegram bot token is required');
  }

  // Use polling in development, webhooks in production
  const bot = new TelegramBot(token, { polling: isDevelopment });

  // Add error handling
  bot.on('error', (error) => {
    console.error('Bot error:', error);
  });

  bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
  });

  return bot;
}

module.exports = { createBot };
