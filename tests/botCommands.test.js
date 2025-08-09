const MockBot = require('./mocks/mockBot');
const MockDatabase = require('./mocks/mockDatabase');

// Mock constants
const NICKNAME_MAP = {
  "@testuser1": "TestUser1",
  "@testuser2": "TestUser2",
  "@testuser3": "TestUser3"
};

const HELP_MESSAGE = `
指令:
• /help - 顯示說明文字
• /rules - 顯示群組規則
• /records <username> - 顯示白爛紀錄。如果沒有指定用戶，顯示所有人的紀錄
• /vote <username> - 投票是否白爛 (發起人自動同意，需要1票同意)
• /warn <username> - 投票是否醜一 (發起人自動同意，需要1票同意)。如果醜二，視為白爛一次
• /agree - 同意目前投票
• /reject - 反對目前投票
• /status - 顯示目前投票狀態

自動投票功能:
• 回覆某人的訊息並輸入 "白爛 + 1" 或 "這算不算白爛" 即可自動開始投票
`;

const RULES_MESSAGE = `
禁聊不好笑的政治文 統神 白爛 遲到 甲片 甯芝蓶 羅傑白癡 gif 
禁分享影片自己不看
違規請麥香
`;

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
    this.chatId = null;
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

  getTimeRemaining() {
    const now = new Date();
    const hoursDiff = (now - this.startTime) / (1000 * 60 * 60);
    return Math.max(0, 8 - hoursDiff);
  }
}

// Helper functions
function getUserDisplayName(user) {
  const username = user.username || user.first_name;
  const usernameWithAt = username.startsWith('@') ? username : `@${username}`;
  return NICKNAME_MAP[usernameWithAt] || username;
}

function formatUserRecord(userId, records) {
  const user = records.find(r => r.userId === userId);
  if (!user) return "無紀錄";
  
  const bailanCount = user.bailanCount || 0;
  const warningCount = user.warningCount || 0;
  
  return bailanCount.toString() + (warningCount > 0 ? ` + 醜一` : '');
}

// Command handlers
async function handleHelpCommand(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, HELP_MESSAGE);
}

async function handleRulesCommand(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, RULES_MESSAGE);
}

async function handleRecordsCommand(bot, database, msg, targetUsername = null) {
  const chatId = msg.chat.id;
  
  if (!database.connected) {
    await bot.sendMessage(chatId, "Database 未連接，無法查詢紀錄");
    return;
  }
  
  try {
    if (targetUsername) {
      // Show specific user's records
      if (!NICKNAME_MAP[targetUsername]) {
        await bot.sendMessage(chatId, `找不到用戶 ${targetUsername}，請確認用戶名稱是否正確`);
        return;
      }
      
      const userRecord = await database.getUserRecord(targetUsername);
      
      if (userRecord) {
        const displayName = getUserDisplayName({ username: targetUsername });
        const message = `${displayName} 的紀錄:\n${formatUserRecord(targetUsername, [userRecord])}`;
        await bot.sendMessage(chatId, message);
      } else {
        await bot.sendMessage(chatId, `找不到用戶 ${targetUsername} 的紀錄`);
      }
    } else {
      // Show all records
      const allRecords = await database.getAllUserRecords();
      if (allRecords.length === 0) {
        await bot.sendMessage(chatId, "目前沒有任何紀錄");
        return;
      }
      
      let message = "";
      for (const record of allRecords) {
        const displayName = getUserDisplayName({ username: record.userId });
        message += `${displayName} ${formatUserRecord(record.userId, [record])}\n`;
      }
      await bot.sendMessage(chatId, message);
    }
  } catch (error) {
    console.error('Error getting records:', error);
    await bot.sendMessage(chatId, "查詢紀錄時發生錯誤");
  }
}

async function handleVoteCommand(bot, msg, targetUsername, currentVote) {
  const chatId = msg.chat.id;
  const initiator = msg.from;
  
  if (currentVote) {
    if (currentVote.isExpired()) {
      // Clear expired vote
      currentVote = null;
    } else {
      await bot.sendMessage(chatId, "目前已有進行中的投票，請等待投票結束");
      return { currentVote, success: false };
    }
  }
  
  // Check if target username is in NICKNAME_MAP
  if (!NICKNAME_MAP[targetUsername]) {
    await bot.sendMessage(chatId, `找不到用戶 ${targetUsername}`);
    return { currentVote, success: false };
  }
  
  currentVote = new Vote('bailan', targetUsername, initiator);
  currentVote.chatId = chatId;
  
  // Count the issuer as agree vote
  currentVote.addAgree(initiator.id);
  
  const displayName = getUserDisplayName({ username: targetUsername });
  const message = `開始投票: ${displayName} 是否白爛？`;
  await bot.sendMessage(chatId, message);
  
  return { currentVote, success: true };
}

async function handleStatusCommand(bot, msg, currentVote) {
  const chatId = msg.chat.id;
  
  if (!currentVote) {
    await bot.sendMessage(chatId, "目前沒有進行中的投票");
    return;
  }
  
  if (currentVote.isExpired()) {
    await bot.sendMessage(chatId, `投票過期: ${getUserDisplayName({ username: currentVote.targetUser })}\n投票時間超過8小時，自動失效`);
    return { currentVote: null };
  }
  
  const displayName = getUserDisplayName({ username: currentVote.targetUser });
  const agreeCount = currentVote.getAgreeCount();
  const rejectCount = currentVote.getRejectCount();
  const hoursLeft = currentVote.getTimeRemaining();
  
  let voteType = currentVote.type === 'bailan' ? '白爛' : '醜一';
  const message = `目前投票狀態:\n${displayName} 是否${voteType}？\n\n同意: ${agreeCount}/2 票 (發起人已同意)\n反對: ${rejectCount}/2 票\n剩餘時間: ${hoursLeft.toFixed(1)} 小時`;
  
  await bot.sendMessage(chatId, message);
  return { currentVote };
}

describe('Bot Commands Tests', () => {
  let bot;
  let database;
  let currentVote;

  beforeEach(() => {
    bot = new MockBot();
    database = new MockDatabase();
    database.connected = true;
    currentVote = null;
  });

  afterEach(() => {
    bot.clearMessages();
    database.clear();
  });

  describe('Help Command', () => {
    test('should display help message', async () => {
      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleHelpCommand(bot, msg);

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toBe(HELP_MESSAGE);
      expect(bot.getLastMessage().chatId).toBe(-1);
    });
  });

  describe('Rules Command', () => {
    test('should display rules message', async () => {
      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRulesCommand(bot, msg);

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toBe(RULES_MESSAGE);
    });
  });

  describe('Records Command', () => {
    test('should show specific user record', async () => {
      // Add test data
      await database.saveUserRecord('@testuser1', 'bailan');
      await database.saveUserRecord('@testuser1', 'warning');

      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRecordsCommand(bot, database, msg, '@testuser1');

      expect(bot.getMessageCount()).toBe(1);
      const message = bot.getLastMessage().message;
      expect(message).toContain('TestUser1');
      expect(message).toContain('1 + 醜一');
    });

    test('should show all user records', async () => {
      // Add test data
      await database.saveUserRecord('@testuser1', 'bailan');
      await database.saveUserRecord('@testuser2', 'warning');

      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRecordsCommand(bot, database, msg);

      expect(bot.getMessageCount()).toBe(1);
      const message = bot.getLastMessage().message;
      expect(message).toContain('TestUser1');
      expect(message).toContain('TestUser2');
    });

    test('should handle user not found', async () => {
      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRecordsCommand(bot, database, msg, '@unknownuser');

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('找不到用戶');
    });

    test('should handle no records found', async () => {
      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRecordsCommand(bot, database, msg, '@testuser1');

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('找不到用戶 @testuser1 的紀錄');
    });

    test('should handle empty database', async () => {
      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRecordsCommand(bot, database, msg);

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('目前沒有任何紀錄');
    });

    test('should handle database disconnected', async () => {
      database.connected = false;

      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRecordsCommand(bot, database, msg);

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('Database 未連接');
    });
  });

  describe('Vote Command', () => {
    test('should start new vote successfully', async () => {
      const msg = {
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' }
      };

      const result = await handleVoteCommand(bot, msg, '@testuser2', currentVote);

      expect(result.success).toBe(true);
      expect(result.currentVote).toBeTruthy();
      expect(result.currentVote.type).toBe('bailan');
      expect(result.currentVote.targetUser).toBe('@testuser2');
      expect(result.currentVote.getAgreeCount()).toBe(1);

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('開始投票: TestUser2 是否白爛？');
    });

    test('should reject vote when one is in progress', async () => {
      // Create existing vote
      const existingVote = new Vote('bailan', '@testuser3', { id: 3 });

      const msg = {
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' }
      };

      const result = await handleVoteCommand(bot, msg, '@testuser2', existingVote);

      expect(result.success).toBe(false);
      expect(result.currentVote).toBe(existingVote);

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('目前已有進行中的投票');
    });

    test('should reject vote for unknown user', async () => {
      const msg = {
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' }
      };

      const result = await handleVoteCommand(bot, msg, '@unknownuser', currentVote);

      expect(result.success).toBe(false);
      expect(result.currentVote).toBeNull();

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('找不到用戶');
    });

    test('should clear expired vote and start new one', async () => {
      // Create expired vote
      const expiredVote = new Vote('bailan', '@testuser3', { id: 3 });
      expiredVote.startTime = new Date(Date.now() - 9 * 60 * 60 * 1000); // 9 hours ago

      const msg = {
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' }
      };

      const result = await handleVoteCommand(bot, msg, '@testuser2', expiredVote);

      expect(result.success).toBe(true);
      expect(result.currentVote).not.toBe(expiredVote);
      expect(result.currentVote.targetUser).toBe('@testuser2');
    });
  });

  describe('Status Command', () => {
    test('should show vote status', async () => {
      // Create vote
      const vote = new Vote('bailan', '@testuser2', { id: 1 });
      vote.addAgree(1);
      vote.addReject(2);

      const msg = {
        chat: { id: -1 }
      };

      const result = await handleStatusCommand(bot, msg, vote);

      expect(result.currentVote).toBe(vote);
      expect(bot.getMessageCount()).toBe(1);
      
      const message = bot.getLastMessage().message;
      expect(message).toContain('目前投票狀態');
      expect(message).toContain('TestUser2');
      expect(message).toContain('同意: 1/2');
      expect(message).toContain('反對: 1/2');
      expect(message).toContain('剩餘時間');
    });

    test('should handle no current vote', async () => {
      const msg = {
        chat: { id: -1 }
      };

      await handleStatusCommand(bot, msg, null);

      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('目前沒有進行中的投票');
    });

    test('should handle expired vote', async () => {
      // Create expired vote
      const expiredVote = new Vote('bailan', '@testuser2', { id: 1 });
      expiredVote.startTime = new Date(Date.now() - 9 * 60 * 60 * 1000);

      const msg = {
        chat: { id: -1 }
      };

      const result = await handleStatusCommand(bot, msg, expiredVote);

      expect(result.currentVote).toBeNull();
      expect(bot.getMessageCount()).toBe(1);
      expect(bot.getLastMessage().message).toContain('投票過期');
      expect(bot.getLastMessage().message).toContain('TestUser2');
    });

    test('should show warning vote type correctly', async () => {
      const vote = new Vote('warning', '@testuser2', { id: 1 });
      vote.addAgree(1);

      const msg = {
        chat: { id: -1 }
      };

      await handleStatusCommand(bot, msg, vote);

      const message = bot.getLastMessage().message;
      expect(message).toContain('是否醜一？');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete vote workflow', async () => {
      // 1. Start vote
      const voteMsg = {
        chat: { id: -1 },
        from: { id: 1, username: '@testuser1' }
      };

      let result = await handleVoteCommand(bot, voteMsg, '@testuser2', currentVote);
      expect(result.success).toBe(true);
      currentVote = result.currentVote;

      // 2. Check status
      const statusMsg = {
        chat: { id: -1 }
      };

      result = await handleStatusCommand(bot, statusMsg, currentVote);
      expect(result.currentVote).toBe(currentVote);

      // Should have 2 messages: vote start + status
      expect(bot.getMessageCount()).toBe(2);
    });

    test('should format user records correctly', async () => {
      // Create complex user record
      await database.saveUserRecord('@testuser1', 'bailan');
      await database.saveUserRecord('@testuser1', 'bailan');
      await database.saveUserRecord('@testuser1', 'warning');

      const msg = {
        chat: { id: -1 },
        message_id: 1
      };

      await handleRecordsCommand(bot, database, msg, '@testuser1');

      const message = bot.getLastMessage().message;
      expect(message).toContain('TestUser1');
      expect(message).toContain('2 + 醜一');
    });
  });
});
