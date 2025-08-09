const MockDatabase = require('./mocks/mockDatabase');

describe('Database Tests', () => {
  let database;

  beforeEach(() => {
    database = new MockDatabase();
  });

  afterEach(() => {
    database.clear();
  });

  describe('Database Connection', () => {
    test('should initialize database connection', async () => {
      await database.init();
      expect(database.connected).toBe(true);
    });

    test('should close database connection', async () => {
      await database.init();
      await database.close();
      expect(database.connected).toBe(false);
    });
  });

  describe('User Records', () => {
    test('should create new user record for bailan', async () => {
      const userId = '@testuser';
      await database.saveUserRecord(userId, 'bailan');
      
      const record = await database.getUserRecord(userId);
      expect(record).toBeTruthy();
      expect(record.userId).toBe(userId);
      expect(record.bailanCount).toBe(1);
      expect(record.warningCount).toBe(0);
    });

    test('should create new user record for warning', async () => {
      const userId = '@testuser';
      await database.saveUserRecord(userId, 'warning');
      
      const record = await database.getUserRecord(userId);
      expect(record).toBeTruthy();
      expect(record.userId).toBe(userId);
      expect(record.bailanCount).toBe(0);
      expect(record.warningCount).toBe(1);
    });

    test('should increment bailan count for existing user', async () => {
      const userId = '@testuser';
      
      // Create initial record
      await database.saveUserRecord(userId, 'bailan');
      let record = await database.getUserRecord(userId);
      expect(record.bailanCount).toBe(1);
      
      // Increment bailan count
      await database.saveUserRecord(userId, 'bailan');
      record = await database.getUserRecord(userId);
      expect(record.bailanCount).toBe(2);
      expect(record.warningCount).toBe(0);
    });

    test('should convert two warnings to one bailan', async () => {
      const userId = '@testuser';
      
      // First warning
      await database.saveUserRecord(userId, 'warning');
      let record = await database.getUserRecord(userId);
      expect(record.bailanCount).toBe(0);
      expect(record.warningCount).toBe(1);
      
      // Second warning - should convert to bailan
      await database.saveUserRecord(userId, 'warning');
      record = await database.getUserRecord(userId);
      expect(record.bailanCount).toBe(1);
      expect(record.warningCount).toBe(0);
    });

    test('should return null for non-existent user', async () => {
      const record = await database.getUserRecord('@nonexistent');
      expect(record).toBeNull();
    });

    test('should get all user records sorted by update time', async () => {
      // Create multiple users with slight delay to ensure different timestamps
      await database.saveUserRecord('@user1', 'bailan');
      await new Promise(resolve => setTimeout(resolve, 1));
      await database.saveUserRecord('@user2', 'warning');
      await new Promise(resolve => setTimeout(resolve, 1));
      await database.saveUserRecord('@user3', 'bailan');
      
      const allRecords = await database.getAllUserRecords();
      expect(allRecords).toHaveLength(3);
      // Check that records are sorted by most recent first
      expect(allRecords[0].updatedAt >= allRecords[1].updatedAt).toBe(true);
      expect(allRecords[1].updatedAt >= allRecords[2].updatedAt).toBe(true);
    });
  });

  describe('Messages', () => {
    test('should save message', async () => {
      const chatId = '-1';
      const userId = '@testuser';
      const messageText = 'Hello world';
      
      await database.saveMessage(chatId, userId, messageText);
      
      const messageCount = await database.getUserMessageCount(userId);
      expect(messageCount).toBe(1);
      expect(database.getMessageCount()).toBe(1);
    });

    test('should count messages per user', async () => {
      const chatId = '-1';
      const userId1 = '@user1';
      const userId2 = '@user2';
      
      await database.saveMessage(chatId, userId1, 'Message 1');
      await database.saveMessage(chatId, userId1, 'Message 2');
      await database.saveMessage(chatId, userId2, 'Message 3');
      
      const user1Count = await database.getUserMessageCount(userId1);
      const user2Count = await database.getUserMessageCount(userId2);
      
      expect(user1Count).toBe(2);
      expect(user2Count).toBe(1);
    });
  });

  describe('Votes', () => {
    test('should save vote and return vote ID', async () => {
      const voteId = await database.saveVote('bailan', '@targetuser', '@initiator', '-1');
      
      expect(voteId).toBeTruthy();
      expect(typeof voteId).toBe('number');
      
      const vote = await database.getVote(voteId);
      expect(vote).toBeTruthy();
      expect(vote.voteType).toBe('bailan');
      expect(vote.targetUser).toBe('@targetuser');
      expect(vote.status).toBe('active');
    });

    test('should save vote responses', async () => {
      const voteId = await database.saveVote('bailan', '@targetuser', '@initiator', '-1');
      
      await database.saveVoteResponse(voteId, '@voter1', 'agree');
      await database.saveVoteResponse(voteId, '@voter2', 'reject');
      
      const responses = await database.getVoteResponses(voteId);
      expect(responses).toHaveLength(2);
      expect(responses[0].response).toBe('agree');
      expect(responses[1].response).toBe('reject');
    });

    test('should update vote status', async () => {
      const voteId = await database.saveVote('bailan', '@targetuser', '@initiator', '-1');
      
      await database.updateVoteStatus(voteId, 'completed');
      
      const vote = await database.getVote(voteId);
      expect(vote.status).toBe('completed');
    });

    test('should get active votes only', async () => {
      const voteId1 = await database.saveVote('bailan', '@target1', '@initiator', '-1');
      const voteId2 = await database.saveVote('warning', '@target2', '@initiator', '-1');
      
      // Mark one as completed
      await database.updateVoteStatus(voteId1, 'completed');
      
      const activeVotes = await database.getActiveVotes();
      expect(activeVotes).toHaveLength(1);
      expect(activeVotes[0].id).toBe(voteId2);
      expect(activeVotes[0].status).toBe('active');
    });

    test('should include responses in vote query', async () => {
      const voteId = await database.saveVote('bailan', '@targetuser', '@initiator', '-1');
      await database.saveVoteResponse(voteId, '@voter1', 'agree');
      
      const vote = await database.getVote(voteId);
      expect(vote.responses).toHaveLength(1);
      expect(vote.responses[0].response).toBe('agree');
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle user with multiple record types', async () => {
      const userId = '@complexuser';
      
      // Start with a warning
      await database.saveUserRecord(userId, 'warning');
      let record = await database.getUserRecord(userId);
      expect(record.bailanCount).toBe(0);
      expect(record.warningCount).toBe(1);
      
      // Add a bailan
      await database.saveUserRecord(userId, 'bailan');
      record = await database.getUserRecord(userId);
      expect(record.bailanCount).toBe(1);
      expect(record.warningCount).toBe(1);
      
      // Add another warning (should convert to bailan)
      await database.saveUserRecord(userId, 'warning');
      record = await database.getUserRecord(userId);
      expect(record.bailanCount).toBe(2);
      expect(record.warningCount).toBe(0);
    });

    test('should handle vote with multiple responses from same user', async () => {
      const voteId = await database.saveVote('bailan', '@targetuser', '@initiator', '-1');
      
      // User changes their mind
      await database.saveVoteResponse(voteId, '@voter1', 'agree');
      await database.saveVoteResponse(voteId, '@voter1', 'reject');
      
      const responses = await database.getVoteResponses(voteId);
      expect(responses).toHaveLength(2);
      // Both responses are stored (vote logic should handle duplicates)
    });
  });
});
