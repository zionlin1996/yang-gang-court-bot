const nicknameOf = require('./libs/nicknameOf');
const { NICKNAME_MAP } = require('../constants');
const parseMessage = require('./libs/parseMessage');

// Vote type display names
const VOTE_TYPE_TEXT = {
  bailan: '白爛',
  warning: '醜一',
};

const getVoteTopic = (voteType, displayName) => 
   voteType === "pardon" ? `是否赦免${displayName}` : `${displayName} 484 ${VOTE_TYPE_TEXT[voteType]}`;

const getVotePassMessage = (voteType, displayName, record) => {
  if (voteType === 'bailan') {
    return `${displayName} 白爛 +1`;
  } else if (voteType === 'warning') {
    // Check if user already had one warning (which would make this the second)
    if (record && record.warning_count === 1) {
      return `${displayName} 醜二，白爛 +1`;
    } else {
      return `${displayName} 醜一`;
    }
  } else if (voteType === 'pardon') {
    return `赦免 ${displayName}，白爛 -1`;
  }
}

const getVoteFailMessage = (voteType, displayName) => {
  return voteType === 'pardon' ? `赦免${displayName}失敗` : `${displayName}不算${VOTE_TYPE_TEXT[voteType]}`;
}

class Vote {
  constructor(type, targetUser, initiator) {
    this.type = type; // 'bailan', 'warning', or 'pardon'
    this.targetUser = targetUser;
    this.initiator = initiator;
    this.votes = new Map();
    this.startTime = new Date();
    this.id = Date.now();
  }

  vote(userId, agree) {
    if (this.isExpired()) {
      throw new Error('Vote has expired');
    }
    this.votes.set(userId, agree);
  }

  getAgreeCount() {
    return Array.from(this.votes.values()).filter(Boolean).length;
  }

  getRejectCount() {
    return Array.from(this.votes.values()).filter(vote => !vote).length;
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


class VoteManager {
  active = null
  bot = null
  db = null

  create(type, targetUser, initiator) {
    const vote = new Vote(type, targetUser, initiator);
    this.active = vote;
    return vote;
  }

  delete() {
    this.active = null;
  }

  getCurrent() {
    return this.active;
  }

  async checkValid(msg, deleteCommand = false) {
    if (!this.bot) {
      throw new Error('Bot not set');
    }
    if (!this.active) {
      await this.bot.respond(msg, "目前沒有進行中的投票", { deleteCommand });
      return false;
    } else if (this.active.isExpired()) {
      await this.bot.respond(msg, "投票時間超過8小時，自動失效", { deleteCommand });
      this.delete();
      return false;
    }
    return true;
  }

  use(bot, db) {
    this.bot = bot;
    this.db = db;
  }
  // Helper function to handle vote responses (agree/reject)
  async handleVote(msg, agree) {
    const valid = await this.checkValid(msg);
    if (!valid) return;
    
    const currentVote = this.getCurrent();
    const { initiator } = parseMessage(msg);
    
    // Add vote based on type
    currentVote.vote(initiator.id, agree);
    
    const agreeCount = currentVote.getAgreeCount();
    const rejectCount = currentVote.getRejectCount();
    
    const displayName = nicknameOf(currentVote.targetUser);
    const message = `投票更新: ${getVoteTopic(currentVote.type, displayName)}？ 同意 ${agreeCount} / 反對 ${rejectCount}`;
    await this.bot.respond(msg, message);
    
    // Check if vote should pass or fail
    if (currentVote.shouldPass()) {
      await this.handlePass();
    } else if (currentVote.shouldFail()) {
      await this.handleReject();
    } else if (currentVote.isComplete()) {
      // If we have 2 votes but not enough to pass or fail, determine based on vote type
      if (agree === false) {
        await this.handleReject();
      } else {
        await this.handlePass();
      }
    }
  }

  async handlePass() {
    const currentVote = this.getCurrent();
    const chatId = currentVote.chatId;
    const displayName = nicknameOf(currentVote.targetUser);
    
    const currentRecord = await this.db.getUserRecord(currentVote.targetUser);
    await this.db.saveUserRecord(currentVote.targetUser, currentVote.type);
    
    const message = "投票結束: " + getVotePassMessage(currentVote.type, displayName, currentRecord);
    
    await this.bot.sendMessage(chatId, message);
    this.delete();
  }

  async handleReject() {
    const currentVote = this.getCurrent();
    if (!currentVote) return;
    
    const chatId = currentVote.chatId;
    const displayName = nicknameOf(currentVote.targetUser);
    

    const message = "投票結束：" + getVoteFailMessage(currentVote.type, displayName);
    await this.bot.sendMessage(chatId, message);
    this.delete();
  }

  // Common function to initialize a new vote
  async initiateVote(msg, target, voteType, deleteAfter = false) {
    const { initiator } = parseMessage(msg);
    const existingVote = this.getCurrent();

    // Check if there's already a vote in progress
    if (existingVote) {
      if (existingVote.isExpired()) {
        await this.bot.respond(msg, "投票時間超過8小時，自動失效");
        this.delete();
      } else {
        return this.bot.respond(msg, "已有進行中的投票");
      }
    }
    
    // Check if target username is in NICKNAME_MAP
    if (!NICKNAME_MAP[target]) {
      return this.bot.respond(msg, `找不到用戶 ${target}，請確認用戶名稱是否正確`);
    }
    
    // Create new vote
    const currentVote = this.create(voteType, target, initiator);
    
    // Set chat ID
    currentVote.chatId = msg.chat.id;
    
    // Count the initiator as agree vote
    currentVote.vote(initiator.id, true);
    
    // Send confirmation message
    const displayName = nicknameOf(target);
    const message = `開始投票: ${getVoteTopic(voteType, displayName)}？`;
    
    await this.bot.respond(msg, message, { deleteCommand: deleteAfter });
  }

  async handleNewVote(msg, voteType) {
    const { args } = parseMessage(msg);
    const targetUsername = args[0]?.trim();
    await this.initiateVote(msg, targetUsername, voteType, true);
  }

  // Function to handle reply voting
  async handleReplyVoting(msg) {
    const userMessage = msg.text.trim().replaceAll(' ', '');
    const repliedToMessage = msg.reply_to_message;
    if (!repliedToMessage) return;
    
    let found = null
    if (userMessage.includes('白爛+1') ) {
      found = 'bailan';
    } else if (userMessage.includes('醜一')) {
      found = 'warning';
    }
    if (!found) return;
    
    const targetUser = repliedToMessage.from;
    
    // Get target username and ensure it has @ prefix
    const targetUsername = targetUser.username || targetUser.first_name;
    const targetUsernameWithAt = targetUsername.startsWith('@') ? targetUsername : `@${targetUsername}`;
    
    await this.initiateVote(msg, targetUsernameWithAt, found);
  }

  async getStatus(msg) {
    const valid = await this.checkValid(msg); 
    if (!valid) return;
    
    const currentVote = this.getCurrent();
    const displayName = nicknameOf(currentVote.targetUser);
    const agreeCount = currentVote.getAgreeCount();
    const rejectCount = currentVote.getRejectCount();
    const hoursLeft = currentVote.getTimeRemaining();
    
    const message = `${getVoteTopic(currentVote.type, displayName)}？ 同意 ${agreeCount} / 反對 ${rejectCount} \n剩餘時間: ${hoursLeft.toFixed(1)} 小時`;
    
    await this.bot.respond(msg, message);
  }
}

const voteManager = new VoteManager();

module.exports = voteManager;