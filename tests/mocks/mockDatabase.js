/**
 * Mock Database for testing
 */
class MockDatabase {
  constructor() {
    this.userRecords = new Map();
    this.messages = [];
    this.votes = new Map();
    this.voteResponses = new Map();
    this.connected = false;
    this.nextId = 1;
  }

  async init() {
    this.connected = true;
    return Promise.resolve();
  }

  async saveUserRecord(userId, type) {
    let user = this.userRecords.get(userId) || {
      id: this.nextId++,
      userId,
      bailanCount: 0,
      warningCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (type === 'bailan') {
      user.bailanCount += 1;
    } else if (type === 'warning') {
      user.warningCount += 1;
      
      // If warning count reaches 2, convert to bailan and reset warning count
      if (user.warningCount >= 2) {
        user.warningCount = 0;
        user.bailanCount += 1;
      }
    }

    user.updatedAt = new Date();
    this.userRecords.set(userId, user);
    return Promise.resolve();
  }

  async getUserRecord(userId) {
    return Promise.resolve(this.userRecords.get(userId) || null);
  }

  async getAllUserRecords() {
    const records = Array.from(this.userRecords.values());
    return Promise.resolve(records.sort((a, b) => b.updatedAt - a.updatedAt));
  }

  async saveMessage(chatId, userId, messageText) {
    const message = {
      id: this.nextId++,
      chatId,
      userId,
      messageText,
      timestamp: new Date()
    };
    this.messages.push(message);
    return Promise.resolve();
  }

  async getUserMessageCount(userId) {
    const count = this.messages.filter(msg => msg.userId === userId).length;
    return Promise.resolve(count);
  }

  async saveVote(voteType, targetUser, initiatorId, chatId) {
    const voteId = this.nextId++;
    const vote = {
      id: voteId,
      voteType,
      targetUser,
      initiatorId,
      chatId,
      startTime: new Date(),
      status: 'active'
    };
    this.votes.set(voteId, vote);
    return Promise.resolve(voteId);
  }

  async saveVoteResponse(voteId, voterId, response) {
    const responseId = this.nextId++;
    const voteResponse = {
      id: responseId,
      voteId,
      voterId,
      response,
      timestamp: new Date()
    };
    
    if (!this.voteResponses.has(voteId)) {
      this.voteResponses.set(voteId, []);
    }
    this.voteResponses.get(voteId).push(voteResponse);
    return Promise.resolve();
  }

  async getVoteResponses(voteId) {
    return Promise.resolve(this.voteResponses.get(voteId) || []);
  }

  async getVote(voteId) {
    const vote = this.votes.get(voteId);
    if (!vote) return Promise.resolve(null);
    
    const responses = this.voteResponses.get(voteId) || [];
    return Promise.resolve({
      ...vote,
      responses
    });
  }

  async updateVoteStatus(voteId, status) {
    const vote = this.votes.get(voteId);
    if (vote) {
      vote.status = status;
    }
    return Promise.resolve();
  }

  async getActiveVotes() {
    const activeVotes = Array.from(this.votes.values())
      .filter(vote => vote.status === 'active')
      .map(vote => ({
        ...vote,
        responses: this.voteResponses.get(vote.id) || []
      }))
      .sort((a, b) => b.startTime - a.startTime);
    
    return Promise.resolve(activeVotes);
  }

  async close() {
    this.connected = false;
    return Promise.resolve();
  }

  // Test helper methods
  clear() {
    this.userRecords.clear();
    this.messages = [];
    this.votes.clear();
    this.voteResponses.clear();
    this.nextId = 1;
  }

  getRecordCount() {
    return this.userRecords.size;
  }

  getMessageCount() {
    return this.messages.length;
  }

  getVoteCount() {
    return this.votes.size;
  }
}

module.exports = MockDatabase;
