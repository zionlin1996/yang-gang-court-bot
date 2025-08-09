const MockBot = require('./mocks/mockBot');
const MockDatabase = require('./mocks/mockDatabase');

// Mock the constants
const NICKNAME_MAP = {
  "@testuser1": "TestUser1",
  "@testuser2": "TestUser2", 
  "@testuser3": "TestUser3"
};

// Vote class from index.js
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
    // Vote is complete when we have 3 votes total
    return this.getAgreeCount() + this.getRejectCount() >= 3;
  }

  getTimeRemaining() {
    const now = new Date();
    const hoursDiff = (now - this.startTime) / (1000 * 60 * 60);
    return Math.max(0, 8 - hoursDiff);
  }
}

// Helper functions from index.js
function getUserDisplayName(user) {
  const username = user.username || user.first_name;
  // Add @ prefix if not present for NICKNAME_MAP lookup
  const usernameWithAt = username.startsWith('@') ? username : `@${username}`;
  return NICKNAME_MAP[usernameWithAt] || username;
}

describe('Vote Class Tests', () => {
  let vote;
  let initiator;

  beforeEach(() => {
    initiator = { id: 1, username: '@testuser1' };
    vote = new Vote('bailan', '@testuser2', initiator);
  });

  test('should create a new vote with correct properties', () => {
    expect(vote.type).toBe('bailan');
    expect(vote.targetUser).toBe('@testuser2');
    expect(vote.initiator).toBe(initiator);
    expect(vote.agreeVotes.size).toBe(0);
    expect(vote.rejectVotes.size).toBe(0);
    expect(vote.startTime).toBeInstanceOf(Date);
  });

  test('should add agree votes correctly', () => {
    vote.addAgree(1);
    vote.addAgree(2);
    
    expect(vote.getAgreeCount()).toBe(2);
    expect(vote.getRejectCount()).toBe(0);
  });

  test('should add reject votes correctly', () => {
    vote.addReject(1);
    vote.addReject(2);
    
    expect(vote.getRejectCount()).toBe(2);
    expect(vote.getAgreeCount()).toBe(0);
  });

  test('should switch vote when user changes mind', () => {
    vote.addAgree(1);
    expect(vote.getAgreeCount()).toBe(1);
    expect(vote.getRejectCount()).toBe(0);
    
    vote.addReject(1);
    expect(vote.getAgreeCount()).toBe(0);
    expect(vote.getRejectCount()).toBe(1);
  });

  test('should determine when vote should pass', () => {
    expect(vote.shouldPass()).toBe(false);
    
    vote.addAgree(1);
    expect(vote.shouldPass()).toBe(false);
    
    vote.addAgree(2);
    expect(vote.shouldPass()).toBe(true);
  });

  test('should determine when vote should fail', () => {
    expect(vote.shouldFail()).toBe(false);
    
    vote.addReject(1);
    expect(vote.shouldFail()).toBe(false);
    
    vote.addReject(2);
    expect(vote.shouldFail()).toBe(true);
  });

  test('should determine when vote is complete', () => {
    expect(vote.isComplete()).toBe(false);
    
    vote.addAgree(1);
    vote.addAgree(2);
    vote.addReject(3);
    
    expect(vote.isComplete()).toBe(true);
  });

  test('should detect expired votes', () => {
    // Create a vote that started 9 hours ago
    const oldVote = new Vote('bailan', '@testuser2', initiator);
    oldVote.startTime = new Date(Date.now() - 9 * 60 * 60 * 1000);
    
    expect(oldVote.isExpired()).toBe(true);
    expect(oldVote.shouldFail()).toBe(true);
  });

  test('should throw error when trying to vote on expired vote', () => {
    const oldVote = new Vote('bailan', '@testuser2', initiator);
    oldVote.startTime = new Date(Date.now() - 9 * 60 * 60 * 1000);
    
    expect(() => oldVote.addAgree(1)).toThrow('Vote has expired');
    expect(() => oldVote.addReject(1)).toThrow('Vote has expired');
  });

  test('should calculate time remaining correctly', () => {
    const timeRemaining = vote.getTimeRemaining();
    expect(timeRemaining).toBeGreaterThan(7.9);
    expect(timeRemaining).toBeLessThanOrEqual(8);
  });
});

describe('Helper Functions Tests', () => {
  test('getUserDisplayName should return nickname from map', () => {
    const user = { username: '@testuser1' };
    expect(getUserDisplayName(user)).toBe('TestUser1');
  });

  test('getUserDisplayName should add @ prefix if missing', () => {
    const user = { username: 'testuser1' };
    expect(getUserDisplayName(user)).toBe('TestUser1');
  });

  test('getUserDisplayName should use first_name if username missing', () => {
    const user = { first_name: 'testuser1' };
    expect(getUserDisplayName(user)).toBe('TestUser1');
  });

  test('getUserDisplayName should return original name if not in map', () => {
    const user = { username: '@unknownuser' };
    expect(getUserDisplayName(user)).toBe('@unknownuser');
  });
});

describe('Vote Integration Tests', () => {
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

  test('should handle successful vote scenario', async () => {
    const initiator = { id: 1, username: '@testuser1' };
    const targetUser = '@testuser2';
    
    // Create vote
    currentVote = new Vote('bailan', targetUser, initiator);
    currentVote.chatId = -1;
    currentVote.addAgree(initiator.id);
    
    // Simulate second agree vote
    currentVote.addAgree(2);
    
    expect(currentVote.shouldPass()).toBe(true);
    expect(currentVote.getAgreeCount()).toBe(2);
  });

  test('should handle failed vote scenario', async () => {
    const initiator = { id: 1, username: '@testuser1' };
    const targetUser = '@testuser2';
    
    // Create vote
    currentVote = new Vote('bailan', targetUser, initiator);
    currentVote.chatId = -1;
    currentVote.addAgree(initiator.id);
    
    // Simulate two reject votes
    currentVote.addReject(2);
    currentVote.addReject(3);
    
    expect(currentVote.shouldFail()).toBe(true);
    expect(currentVote.getRejectCount()).toBe(2);
  });
});
