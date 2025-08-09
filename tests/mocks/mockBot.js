/**
 * Mock Telegram Bot for testing
 */
class MockBot {
  constructor() {
    this.sentMessages = [];
    this.deletedMessages = [];
    this.listeners = {
      text: [],
      message: []
    };
  }

  // Mock sendMessage
  async sendMessage(chatId, message, options = {}) {
    const messageData = {
      chatId,
      message,
      options,
      timestamp: new Date()
    };
    this.sentMessages.push(messageData);
    return Promise.resolve({
      message_id: this.sentMessages.length,
      chat: { id: chatId },
      text: message
    });
  }

  // Mock deleteMessage
  async deleteMessage(chatId, messageId) {
    this.deletedMessages.push({ chatId, messageId });
    return Promise.resolve();
  }

  // Mock onText
  onText(regex, callback) {
    this.listeners.text.push({ regex, callback });
  }

  // Mock on
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  // Test helper methods
  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  getMessageCount() {
    return this.sentMessages.length;
  }

  getMessagesContaining(text) {
    return this.sentMessages.filter(msg => msg.message.includes(text));
  }

  clearMessages() {
    this.sentMessages = [];
    this.deletedMessages = [];
  }

  // Simulate receiving a message
  simulateMessage(messageText, fromUser = { id: 1, username: '@testuser' }, replyTo = null) {
    const msg = {
      message_id: Date.now(),
      text: messageText,
      from: fromUser,
      chat: { id: -1 },
      reply_to_message: replyTo
    };

    // Find and call message listeners
    this.listeners.message.forEach(callback => {
      callback(msg);
    });

    // Find and call text pattern listeners
    this.listeners.text.forEach(({ regex, callback }) => {
      const match = messageText.match(regex);
      if (match) {
        callback(msg, match);
      }
    });

    return msg;
  }
}

module.exports = MockBot;
