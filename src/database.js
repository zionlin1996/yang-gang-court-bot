const { PrismaClient } = require('@prisma/client');

/**
 * Prisma database manager for the bot
 */
class Database {
  constructor() {
    this.prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
  }

  /**
   * Initialize the database connection
   */
  async init() {
    try {
      // Test the connection
      await this.prisma.$connect();
      console.log('Prisma database connected');
    } catch (error) {
      console.error('Error connecting to database:', error.message);
      throw error;
    }
  }

  /**
   * Save or update user record
   */
  async saveUserRecord(userId, type) {
    try {
      // Check if user exists
      const existingUser = await this.prisma.userRecord.findUnique({
        where: { userId },
      });

      if (existingUser) {
        // Update existing user
        if (type === 'bailan') {
          await this.prisma.userRecord.update({
            where: { userId },
            data: {
              bailanCount: existingUser.bailanCount + 1,
            },
          });
        } else if (type === 'warning') {
          const newWarningCount = existingUser.warningCount + 1;
          
          // If warning count reaches 2, convert to bailan and reset warning count
          if (newWarningCount >= 2) {
            await this.prisma.userRecord.update({
              where: { userId },
              data: {
                warningCount: 0,
                bailanCount: existingUser.bailanCount + 1,
              },
            });
          } else {
            await this.prisma.userRecord.update({
              where: { userId },
              data: {
                warningCount: newWarningCount,
              },
            });
          }
        }
      } else {
        // Create new user
        const bailanCount = type === 'bailan' ? 1 : 0;
        const warningCount = type === 'warning' ? 1 : 0;
        
        await this.prisma.userRecord.create({
          data: {
            userId,
            bailanCount,
            warningCount,
          },
        });
      }
    } catch (error) {
      console.error('Error saving user record:', error);
      throw error;
    }
  }

  /**
   * Get user record
   */
  async getUserRecord(userId) {
    try {
      return await this.prisma.userRecord.findUnique({
        where: { userId },
      });
    } catch (error) {
      console.error('Error getting user record:', error);
      return null;
    }
  }

  /**
   * Get all user records
   */
  async getAllUserRecords() {
    try {
      return await this.prisma.userRecord.findMany({
        orderBy: {
          updatedAt: 'desc',
        },
      });
    } catch (error) {
      console.error('Error getting all user records:', error);
      return [];
    }
  }

  /**
   * Save message
   */
  async saveMessage(chatId, userId, messageText) {
    try {
      await this.prisma.message.create({
        data: {
          chatId,
          userId,
          messageText,
        },
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  }

  /**
   * Get message count for user
   */
  async getUserMessageCount(userId) {
    try {
      const count = await this.prisma.message.count({
        where: { userId },
      });
      return count;
    } catch (error) {
      console.error('Error getting user message count:', error);
      return 0;
    }
  }

  /**
   * Save vote
   */
  async saveVote(voteType, targetUser, initiatorId, chatId) {
    try {
      const vote = await this.prisma.vote.create({
        data: {
          voteType,
          targetUser,
          initiatorId,
          chatId,
        },
      });
      return vote.id;
    } catch (error) {
      console.error('Error saving vote:', error);
      throw error;
    }
  }

  /**
   * Save vote response
   */
  async saveVoteResponse(voteId, voterId, response) {
    try {
      await this.prisma.voteResponse.create({
        data: {
          voteId,
          voterId,
          response,
        },
      });
    } catch (error) {
      console.error('Error saving vote response:', error);
      throw error;
    }
  }

  /**
   * Get vote responses
   */
  async getVoteResponses(voteId) {
    try {
      return await this.prisma.voteResponse.findMany({
        where: { voteId },
        include: {
          vote: true,
        },
      });
    } catch (error) {
      console.error('Error getting vote responses:', error);
      return [];
    }
  }

  /**
   * Get vote by ID
   */
  async getVote(voteId) {
    try {
      return await this.prisma.vote.findUnique({
        where: { id: voteId },
        include: {
          responses: true,
        },
      });
    } catch (error) {
      console.error('Error getting vote:', error);
      return null;
    }
  }

  /**
   * Update vote status
   */
  async updateVoteStatus(voteId, status) {
    try {
      await this.prisma.vote.update({
        where: { id: voteId },
        data: { status },
      });
    } catch (error) {
      console.error('Error updating vote status:', error);
      throw error;
    }
  }

  /**
   * Get active votes
   */
  async getActiveVotes() {
    try {
      return await this.prisma.vote.findMany({
        where: { status: 'active' },
        include: {
          responses: true,
        },
        orderBy: {
          startTime: 'desc',
        },
      });
    } catch (error) {
      console.error('Error getting active votes:', error);
      return [];
    }
  }

  /**
   * Close database connection
   */
  async close() {
    try {
      await this.prisma.$disconnect();
      console.log('Database connection closed');
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
  }
}

const db = new Database();

module.exports = db;