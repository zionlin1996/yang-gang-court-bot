const TelegramBot = require('node-telegram-bot-api');
const parseMessage = require('./libs/parseMessage');

class EnhancedBot extends TelegramBot {
  handlers = {};
  handleMessage = () => {};
  
  constructor(token, options) {
    super(token, {
      polling: options.mode !== 'production',
      request: {
        agentOptions: {
          keepAlive: true,
          family: 4
        }
      } 
    });
    if (!token) {
      throw new Error('Telegram bot token is required');
    }

    // Add error handling
    this.on('error', (error) => {
      console.error('Bot error:', error);
    });

    this.on('polling_error', (error) => {
      console.error('Polling error:', error);
    });

    this.on('message', async (msg) => {
      if (!msg.text) return;
      
      // Handle commands (messages starting with /)
      if (msg.text.startsWith('/')) {
        const commandToken = msg.text.split(' ')[0];
        const [base, mention] = commandToken.split('@');
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'yang_gang_court_bot';

        // If there is a mention, only handle if it's for this bot
        if (mention && mention !== botUsername) {
          return; // Mentioned a different bot, ignore
        }

        const normalized = base;
        if (this.handlers[normalized]) {
          return this.handlers[normalized](msg);
        }
        return; // Unknown command, ignore
      }
      
      // Handle non-command messages
      return this.handleMessage(msg);
    });
  }
  handleCommand(command, callback) {
    this.handlers[command] = callback;
  }
  async respond(msg, response, options = {}) {
    const { deleteCommand = false } = options;
    const { id, chatId } = parseMessage(msg);
    await this.sendMessage(chatId, response);
    if (id && deleteCommand) {
      try {
        await this.deleteMessage(chatId, id);
      } catch (error) {
        // Ignore errors if bot doesn't have permission to delete messages
        console.log('Could not delete command message:', error.message);
      }
    }
  }
  onMessage(callback) {
    this.handleMessage = callback;
  }
}


module.exports = EnhancedBot;
