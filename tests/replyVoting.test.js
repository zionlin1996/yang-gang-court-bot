const MockBot = require('./mocks/mockBot');
const MockDatabase = require('./mocks/mockDatabase');

// Mock constants
const NICKNAME_MAP = {
  "@testuser1": "TestUser1",
  "@testuser2": "TestUser2",
  "@testuser3": "TestUser3"
};

// Vote class for testing
class Vote {
  constructor(type, targetUser, initiator) {
    this.type = type;
    this.targetUser = targetUser;
    this.initiator = initiator;
    this.agreeVotes = new Set();
    this.rejectVotes = new Set();
    this.startTime = new Date();
    this.id = Date.now();
  }

  addAgree(userId) {
    this.agreeVotes.add(userId);
    this.rejectVotes.delete(userId);
  }

  addReject(userId) {
    this.rejectVotes.add(userId);
    this.agreeVotes.delete(userId);
  }

  getAgreeCount() {
    return this.agreeVotes.size;
  }

  getRejectCount() {
    return this.rejectVotes.size;
  }

  isExpired() {
    const now = new Date();
    const hoursDiff = (now - this.startTime) / (1000 * 60 * 60);
    return hoursDiff >= 8;
  }

  shouldPass() {
    return this.getAgreeCount() >= 2;
  }

  shouldFail() {
    return this.getRejectCount() >= 2 || this.isExpired();
  }
}

// Helper function to simulate handleReplyVoting
async function handleReplyVoting(msg, bot, currentVote) {
  const chatId = msg.chat.id;
  const userMessage = msg.text.trim().replaceAll(' ', '');
  const initiator = msg.from;
  const repliedToMessage = msg.reply_to_message;
  
  if (!repliedToMessage) return { currentVote, success: false, reason: 'No reply message' };
  
  const targetUser = repliedToMessage.from;
  
  // Check if the message matches the voting patterns
  const votingPatterns = ['白爛+1', '這算不算白爛'];
  const isVotingMessage = votingPatterns.some(pattern => userMessage === pattern);
  
  if (!isVotingMessage) return { currentVote, success: false, reason: 'Not a voting message' };
  
  // Check if there's already a vote in progress
  if (currentVote) {
    if (currentVote.isExpired()) {
      // Clear expired vote
      currentVote = null;
    } else {
      await bot.sendMessage(chatId, "目前已有進行中的投票，請等待投票結束");
      return { currentVote, success: false, reason: 'Vote in progress' };
    }
  }
  
  // Get target username and check if it's in NICKNAME_MAP
  const targetUsername = targetUser.username || targetUser.first_name;
  const targetUsernameWithAt = targetUsername.startsWith('@') ? targetUsername : `@${targetUsername}`;
  
  // Check if target username is in NICKNAME_MAP
  if (!NICKNAME_MAP[targetUsernameWithAt]) {
    await bot.sendMessage(chatId, `找不到用戶 ${targetUsername}，請確認用戶名稱是否正確`);
    return { currentVote, success: false, reason: 'User not found' };
  }
  
  // Create new vote using the username with @ prefix
  currentVote = new Vote('bailan', targetUsernameWithAt, initiator);
  currentVote.chatId = chatId;
  
  // Count the issuer as agree vote
  currentVote.addAgree(initiator.id);
  
  const displayName = NICKNAME_MAP[targetUsernameWithAt] || targetUsernameWithAt;
  const message = `開始投票: ${displayName} 是否白爛？`;
  await bot.sendMessage(chatId, message);
  
  return { currentVote, success: true, reason: 'Vote created' };
}

describe('Reply Voting Feature Tests', () => {
  let bot;
  let database;
  let currentVote;

  beforeEach(() => {
    bot = new MockBot();
    database = new MockDatabase();
    currentVote = null;
  });

  afterEach(() => {
    bot.clearMessages();
    database.clear();
  });

  describe('Reply Message Detection', () => {
    test('should detect "白爛+1" pattern (without spaces)', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛 + 1',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(true);
      expect(result.currentVote).toBeTruthy();
      expect(result.currentVote.type).toBe('bailan');
      expect(result.currentVote.targetUser).toBe('@testuser2');
    });

    test('should detect "這算不算白爛" pattern', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '這算不算白爛',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(true);
      expect(result.currentVote).toBeTruthy();
      expect(result.currentVote.type).toBe('bailan');
    });

    test('should ignore non-voting reply messages', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '我同意',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Not a voting message');
      expect(result.currentVote).toBeNull();
    });

    test('should ignore non-reply messages', async () => {
      const message = {
        message_id: 1,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1'
        // No reply_to_message
      };

      const result = await handleReplyVoting(message, bot, currentVote);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('No reply message');
    });
  });

  describe('User Validation', () => {
    test('should reject vote against user not in NICKNAME_MAP', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 999, username: '@unknownuser' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('User not found');
      expect(bot.getLastMessage().message).toContain('找不到用戶');
    });

    test('should handle usernames without @ prefix', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: 'testuser2' }, // No @ prefix
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(true);
      expect(result.currentVote.targetUser).toBe('@testuser2');
    });

    test('should handle users with first_name instead of username', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, first_name: 'testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(true);
      expect(result.currentVote.targetUser).toBe('@testuser2');
    });
  });

  describe('Vote Management', () => {
    test('should automatically add initiator as agree vote', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(true);
      expect(result.currentVote.getAgreeCount()).toBe(1);
      expect(result.currentVote.agreeVotes.has(1)).toBe(true);
    });

    test('should reject new vote when one is already in progress', async () => {
      // Create existing vote
      const existingVote = new Vote('bailan', '@testuser3', { id: 3 });
      existingVote.chatId = -1;
      
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, existingVote);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Vote in progress');
      expect(result.currentVote).toBe(existingVote); // Original vote unchanged
      expect(bot.getLastMessage().message).toContain('目前已有進行中的投票');
    });

    test('should clear expired vote and create new one', async () => {
      // Create expired vote
      const expiredVote = new Vote('bailan', '@testuser3', { id: 3 });
      expiredVote.startTime = new Date(Date.now() - 9 * 60 * 60 * 1000); // 9 hours ago
      
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, expiredVote);
      
      expect(result.success).toBe(true);
      expect(result.currentVote).not.toBe(expiredVote);
      expect(result.currentVote.targetUser).toBe('@testuser2');
    });
  });

  describe('Message Generation', () => {
    test('should send vote start message with display name', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      await handleReplyVoting(replyMessage, bot, currentVote);
      
      const lastMessage = bot.getLastMessage();
      expect(lastMessage.message).toContain('開始投票');
      expect(lastMessage.message).toContain('TestUser2'); // Display name from NICKNAME_MAP
      expect(lastMessage.message).toContain('是否白爛？');
      expect(lastMessage.chatId).toBe(-1);
    });

    test('should handle space variations in voting text', async () => {
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Some message'
      };

      // Test with extra spaces
      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: ' 白爛 + 1 ',
        reply_to_message: originalMessage
      };

      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      expect(result.success).toBe(true);
      expect(result.currentVote.type).toBe('bailan');
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete reply voting workflow', async () => {
      // 1. User 2 sends a message
      const originalMessage = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: '我覺得這樣很好'
      };

      // 2. User 1 replies with voting text
      const replyMessage = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage
      };

      // 3. Process reply voting
      const result = await handleReplyVoting(replyMessage, bot, currentVote);
      
      // 4. Verify vote created correctly
      expect(result.success).toBe(true);
      expect(result.currentVote.type).toBe('bailan');
      expect(result.currentVote.targetUser).toBe('@testuser2');
      expect(result.currentVote.initiator.id).toBe(1);
      expect(result.currentVote.getAgreeCount()).toBe(1);
      
      // 5. Verify message sent
      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('TestUser2');
    });

    test('should handle multiple reply voting attempts', async () => {
      const originalMessage1 = {
        message_id: 1,
        from: { id: 2, username: '@testuser2' },
        text: 'Message 1'
      };

      const originalMessage2 = {
        message_id: 3,
        from: { id: 3, username: '@testuser3' },
        text: 'Message 2'
      };

      const replyMessage1 = {
        message_id: 2,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '白爛+1',
        reply_to_message: originalMessage1
      };

      const replyMessage2 = {
        message_id: 4,
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' },
        text: '這算不算白爛',
        reply_to_message: originalMessage2
      };

      // First vote should succeed
      let result = await handleReplyVoting(replyMessage1, bot, currentVote);
      expect(result.success).toBe(true);
      currentVote = result.currentVote;

      // Second vote should fail due to existing vote
      result = await handleReplyVoting(replyMessage2, bot, currentVote);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Vote in progress');
      
      // Should have 2 messages: vote start + error message
      expect(bot.getMessageCount()).toBe(2);
    });
  });
});
