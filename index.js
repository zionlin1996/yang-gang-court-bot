const { createBot } = require('./src/bot');
const { startServer } = require('./src/server');
const { NICKNAME_MAP, HELP_MESSAGE, RULES_MESSAGE } = require('./constants');
require('dotenv').config();

// Initialize bot
const token = process.env.TELEGRAM_BOT_TOKEN;
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create bot instance using the standalone function
const bot = createBot(token, isDevelopment);


// Global variables for vote management
let currentVote = null;

// Vote structure
class Vote {
  constructor(type, targetUser, initiator) {
    this.type = type; // 'bailan' or 'warning'
    this.targetUser = targetUser;
    this.initiator = initiator;
    this.agreeVotes = new Set();
    this.rejectVotes = new Set();
    this.startTime = new Date();
    this.id = Date.now();
  }

  addAgree(userId) {
    if (this.isExpired()) {
      throw new Error('Vote has expired');
    }
    this.agreeVotes.add(userId);
    this.rejectVotes.delete(userId);
  }

  addReject(userId) {
    if (this.isExpired()) {
      throw new Error('Vote has expired');
    }
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
    // With exactly 3 people, need 2 votes to pass
    return this.getAgreeCount() >= 2;
  }

  shouldFail() {
    // With exactly 3 people, need 2 votes to fail, or timeout
    return this.getRejectCount() >= 2 || this.isExpired();
  }

  isComplete() {
    // Vote is complete when we have 2 votes (either agree or reject)
    return this.getAgreeCount() + this.getRejectCount() === 3;
  }

  getTimeRemaining() {
    const now = new Date();
    const hoursDiff = (now - this.startTime) / (1000 * 60 * 60);
    return Math.max(0, 8 - hoursDiff);
  }
}

// Helper functions
function getUserDisplayName(user) {
  let username;
  
  // Handle both user objects and objects with username property
  if (user.username) {
    username = user.username;
  } else if (user.first_name) {
    username = user.first_name;
  } else {
    // If it's already a string (like when passed as { username: "someuser" })
    username = typeof user === 'string' ? user : null;
  }
  
  if (!username) {
    return 'Unknown User';
  }
  
  // Add @ prefix if not present for NICKNAME_MAP lookup
  const usernameWithAt = username.startsWith('@') ? username : `@${username}`;
  return NICKNAME_MAP[usernameWithAt] || username;
}

function formatUserRecord(userId, records) {
  const user = records.find(r => r.user_id === userId);
  if (!user) return "無紀錄";
  
  const bailanCount = user.bailan_count || 0;
  const warningCount = user.warning_count || 0;
  
  return bailanCount.toString() + (warningCount > 0 ? ` + 醜一` : '');
}

async function saveUserRecord(userId, type) {
  if (!global.database) return;
  
  try {
    await global.database.saveUserRecord(userId, type);
  } catch (error) {
    console.error('Error saving user record:', error);
  }
}

async function getAllRecords() {
  if (!global.database) return [];
  
  try {
    return await global.database.getAllUserRecords();
  } catch (error) {
    console.error('Error getting all records:', error);
    return [];
  }
}

// Helper function to handle vote responses (agree/reject)
async function handleVoteResponse(chatId, messageId, voter, voteType) {
  if (!currentVote) {
    await sendResponse(chatId, "目前沒有進行中的投票", messageId);
    return;
  }
  
  // Check if vote is expired
  if (currentVote.isExpired()) {
    await handleVoteExpiration(chatId, messageId);
    return;
  }
  
  // Add vote based on type
  if (voteType === 'agree') {
    currentVote.addAgree(voter.id);
  } else {
    currentVote.addReject(voter.id);
  }
  
  const agreeCount = currentVote.getAgreeCount();
  const rejectCount = currentVote.getRejectCount();
  
  const displayName = getUserDisplayName({ username: currentVote.targetUser });
  const message = `投票更新: ${displayName}\n同意: ${agreeCount} 票\n反對: ${rejectCount} 票`;
  await sendResponse(chatId, message, messageId);
  
  // Check if vote should pass or fail
  if (currentVote.shouldPass()) {
    await handleVoteSuccess();
  } else if (currentVote.shouldFail()) {
    await handleVoteFailure();
  } else if (currentVote.isComplete()) {
    // If we have 2 votes but not enough to pass or fail, determine based on vote type
    if (voteType === 'agree') {
      await handleVoteFailure(); // Not enough agrees to pass
    } else {
      await handleVoteSuccess(); // Not enough rejects to fail
    }
  }
}

async function handleVoteSuccess() {
  if (!currentVote) return;
  
  const chatId = currentVote.chatId;
  const displayName = getUserDisplayName({ username: currentVote.targetUser });
  
  // Check current user record before saving
  let currentRecord = null;
  if (global.database) {
    currentRecord = await global.database.getUserRecord(currentVote.targetUser);
  }
  
  await saveUserRecord(currentVote.targetUser, currentVote.type);
  
  let message = `投票通過: ${displayName}`;
  if (currentVote.type === 'bailan') {
    message += " 記白爛一次";
  } else if (currentVote.type === 'warning') {
    // Check if user already had one warning (which would make this the second)
    if (currentRecord && currentRecord.warning_count === 1) {
      message += " 醜二，轉為白爛 +1)";
    } else {
      message += " 醜一";
    }
  }
  
  await bot.sendMessage(chatId, message);
  clearCurrentVote();
}

async function handleVoteFailure() {
  if (!currentVote) return;
  
  const chatId = currentVote.chatId;
  const displayName = getUserDisplayName({ username: currentVote.targetUser });
  
  let reason = "";
  if (currentVote.getRejectCount() >= 2) {
    reason = "反對票數過多 (2票反對)";
  } else if (currentVote.isExpired()) {
    reason = "投票時間超過8小時";
  } else if (currentVote.isComplete()) {
    reason = "投票未達通過門檻";
  }
  
  const message = `投票失敗: ${displayName}\n原因: ${reason}`;
  await bot.sendMessage(chatId, message);
  clearCurrentVote();
}

async function handleVoteExpiration(chatId, messageId) {
  if (!currentVote) return;
  
  const displayName = getUserDisplayName({ username: currentVote.targetUser });
  
  const message = `投票過期: ${displayName}\n投票時間超過8小時，自動失效`;
  await sendResponse(chatId, message, messageId);
  clearCurrentVote();
}

function clearCurrentVote() {
  currentVote = null;
}

// New function to handle reply voting
async function handleReplyVoting(msg) {
  const chatId = msg.chat.id;
  const userMessage = msg.text.trim().replaceAll(' ', '');
  const initiator = msg.from;
  const repliedToMessage = msg.reply_to_message;
  
  if (!repliedToMessage) return;
  
  const targetUser = repliedToMessage.from;
  
  // Check if the message matches the voting patterns
  const votingPatterns = ['白爛+1', '這算不算白爛'];
  const isVotingMessage = votingPatterns.some(pattern => userMessage === pattern);
  
  if (!isVotingMessage) return;
  
  // Check if there's already a vote in progress
  if (currentVote) {
    // Check if current vote is expired
    if (currentVote.isExpired()) {
      await handleVoteExpiration(chatId, null);
    } else {
      await bot.sendMessage(chatId, "目前已有進行中的投票，請等待投票結束");
      return;
    }
  }
  
  // Get target username and check if it's in NICKNAME_MAP
  const targetUsername = targetUser.username || targetUser.first_name;
  const targetUsernameWithAt = targetUsername.startsWith('@') ? targetUsername : `@${targetUsername}`;
  
  // Check if target username is in NICKNAME_MAP
  if (!NICKNAME_MAP[targetUsernameWithAt]) {
    await bot.sendMessage(chatId, `找不到用戶 ${targetUsername}，請確認用戶名稱是否正確`);
    return;
  }
  
  // Create new vote using the username with @ prefix
  currentVote = new Vote('bailan', targetUsernameWithAt, initiator);
  currentVote.chatId = chatId;
  
  // Count the issuer as agree vote
  currentVote.addAgree(initiator.id);
  
  const displayName = getUserDisplayName({ username: targetUsernameWithAt });
  const message = `開始投票: ${displayName} 是否白爛？`;
  await bot.sendMessage(chatId, message);
}


// Helper function to respond message and delete user command message
async function sendResponse(chatId, message, messageId) {
  await bot.sendMessage(chatId, message);
  if (messageId) {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      // Ignore errors if bot doesn't have permission to delete messages
      console.log('Could not delete command message:', error.message);
    }
  }
}

// Bot commands
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await sendResponse(chatId, HELP_MESSAGE);
});

bot.onText(/\/rules/, async (msg) => {
  const chatId = msg.chat.id;
  await sendResponse(chatId, RULES_MESSAGE);
});

bot.onText(/\/records(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  if (!global.database) {
    await sendResponse(chatId, "Database 未連接，無法查詢紀錄", messageId);
    return;
  }
  
  try {
    if (match && match[1]) {
      // Show specific user's records
      const targetUsername = match[1].trim();
      
      // Check if target username is in NICKNAME_MAP
      if (!NICKNAME_MAP[targetUsername]) {
        await sendResponse(chatId, `找不到用戶 ${targetUsername}，請確認用戶名稱是否正確`, messageId);
        return;
      }
      
      const userRecord = await global.database.getUserRecord(targetUsername);
      
      if (userRecord) {
        const displayName = getUserDisplayName({ username: targetUsername });
        const message = `${displayName} 的紀錄:\n${formatUserRecord(targetUsername, [userRecord])}`;
        await sendResponse(chatId, message, messageId);
      } else {
        await sendResponse(chatId, `找不到用戶 ${targetUsername} 的紀錄`);
      }
    } else {
      // Show all records
      const allRecords = await getAllRecords();
      if (allRecords.length === 0) {
        await sendResponse(chatId, "目前沒有任何紀錄", messageId);
        return;
      }
      
      let message = "";
      for (const record of allRecords) {
        const displayName = getUserDisplayName({ username: record.user_id });
        message += `${displayName} ${formatUserRecord(record.user_id, [record])}\n`;
      }
      await sendResponse(chatId, message, messageId);
    }
  } catch (error) {
    console.error('Error getting records:', error);
    await sendResponse(chatId, "查詢紀錄時發生錯誤", messageId);
  }
});

bot.onText(/\/vote\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const initiator = msg.from;
  
  if (currentVote) {
    // Check if current vote is expired
    if (currentVote.isExpired()) {
      await handleVoteExpiration(chatId, messageId);
    } else {
      await sendResponse(chatId, "目前已有進行中的投票，請等待投票結束", messageId);
      return;
    }
  }
  
  const targetUsername = match[1].trim();
  
  // Check if target username is in NICKNAME_MAP
  if (!NICKNAME_MAP[targetUsername]) {
    await sendResponse(chatId, `找不到用戶 ${targetUsername}`);
    return;
  }
  
  currentVote = new Vote('bailan', targetUsername, initiator);
  currentVote.chatId = chatId; // Store chat ID for later use
  
  // Count the issuer as agree vote
  currentVote.addAgree(initiator.id);
  
  const displayName = getUserDisplayName({ username: targetUsername });
  const message = `開始投票: ${displayName} 是否白爛？`;
  await sendResponse(chatId, message, messageId);
});

bot.onText(/\/warn\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const initiator = msg.from;
  
  if (currentVote) {
    // Check if current vote is expired
    if (currentVote.isExpired()) {
      await handleVoteExpiration(chatId, messageId);
    } else {
      await sendResponse(chatId, "目前已有進行中的投票，請等待投票結束", messageId);
      return;
    }
  }
  
  const targetUsername = match[1].trim();
  
  // Check if target username is in NICKNAME_MAP
  if (!NICKNAME_MAP[targetUsername]) {
    await sendResponse(chatId, `找不到用戶 ${targetUsername}`);
    return;
  }
  
  currentVote = new Vote('warning', targetUsername, initiator);
  currentVote.chatId = chatId; // Store chat ID for later use
  
  // Count the issuer as agree vote
  currentVote.addAgree(initiator.id);
  
  const displayName = getUserDisplayName({ username: targetUsername });
  const message = `開始投票: ${displayName} 是否醜一？`;
  await sendResponse(chatId, message, messageId);
});



bot.onText(/\/agree/, async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const voter = msg.from;
  
  await handleVoteResponse(chatId, messageId, voter, 'agree');
});

bot.onText(/\/reject/, async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const voter = msg.from;
  
  await handleVoteResponse(chatId, messageId, voter, 'reject');
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  if (!currentVote) {
    await sendResponse(chatId, "目前沒有進行中的投票", messageId);
    return;
  }
  
  // Check if vote is expired
  if (currentVote.isExpired()) {
    await handleVoteExpiration(chatId, messageId);
    return;
  }
  
  const displayName = getUserDisplayName({ username: currentVote.targetUser });
  const agreeCount = currentVote.getAgreeCount();
  const rejectCount = currentVote.getRejectCount();
  const hoursLeft = currentVote.getTimeRemaining();
  
  let voteType = currentVote.type === 'bailan' ? '白爛' : '醜一';
  const message = `目前投票狀態:\n${displayName} 是否${voteType}？\n\n同意: ${agreeCount}/2 票 (發起人已同意)\n反對: ${rejectCount}/2 票\n剩餘時間: ${hoursLeft.toFixed(1)} 小時`;
  
  await sendResponse(chatId, message, messageId);
});

// Handle all other messages
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const userMessage = msg.text;
  const userId = msg.from.username || msg.from.first_name;
  
  // Check for reply messages with specific voting patterns
  if (msg.reply_to_message) {
    await handleReplyVoting(msg);
  }
  
  // Store message in database if available
  if (global.database) {
    try {
      await global.database.saveMessage(chatId, userId, userMessage);
    } catch (error) {
      console.error('Error storing message in database:', error);
    }
  }
});

// Start the server
startServer({ bot, isDevelopment })
  .then(({ database }) => {
    // Make database globally available for bot commands
    global.database = database;
    console.log('Server started successfully');
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
