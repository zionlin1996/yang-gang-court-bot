const EnhancedBot = require('./src/bot');
const setup = require('./src/setup');
const db = require('./src/database');
const express = require('express');
const { NICKNAME_MAP, HELP_MESSAGE, RULES_MESSAGE } = require('./constants');
const nicknameOf = require('./src/libs/nicknameOf');
const formatUserRecord = require('./src/libs/formatUserRecord');
const parseMessage = require('./src/libs/parseMessage');
const voteManager = require('./src/votes');

require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new EnhancedBot(token, { mode: process.env.NODE_ENV });

// Bot commands
bot.handleCommand("/help", async (msg) => bot.respond(msg, HELP_MESSAGE));
bot.handleCommand("/rules", async (msg) => bot.respond(msg, RULES_MESSAGE));

bot.handleCommand("/records", async (msg) => {
  const { args } = parseMessage(msg);
  const targetUsername = args[0]?.trim();
  
  try {
    if (targetUsername) {
      if (!NICKNAME_MAP[targetUsername]) return bot.respond(msg, "無此用戶");

      const displayName = nicknameOf(targetUsername);
      const userRecord = await db.getUserRecord(displayName);
      
      if (userRecord) {
        const message = `${displayName} 的紀錄:\n${formatUserRecord(displayName, [userRecord])}`;
        await bot.respond(msg, message);
      } else {
        await bot.respond(msg, `找不到用戶${displayName}的紀錄`);
      }
    } else {
      // Show all records
      const allRecords = await db.getAllUserRecords();
      if (allRecords.length === 0) return bot.respond(msg, "目前沒有任何紀錄")
      
      let message = "";
      for (const record of allRecords) {
        const displayName = nicknameOf(record.userId);
        message += `${displayName} ${formatUserRecord(record.userId, [record])}\n`;
      }
      await bot.respond(msg, message);
    }
  } catch (error) {
    console.error('Error getting records:', error);
    await bot.respond(msg, "查詢紀錄時發生錯誤");
  }
});

bot.handleCommand("/vote", (msg) => voteManager.handleNewVote(msg, 'bailan'));
bot.handleCommand("/warn", (msg) => voteManager.handleNewVote(msg, 'warning'));
bot.handleCommand("/agree", (msg) => voteManager.handleVote(msg, true));
bot.handleCommand("/reject", (msg) => voteManager.handleVote(msg, false));
bot.handleCommand("/status", (msg) => voteManager.getStatus(msg));

bot.onMessage(async (msg) => {
  if (msg.text.startsWith('/')) return;
  if (msg.reply_to_message) {
    await voteManager.handleReplyVoting(msg);
  }
});

async function main() {
  // init database
  await db.init();

  // init express server
  const app = express();
  app.use(express.json());
  
  // set voteManager dependencies
  voteManager.use(bot, db);

  // setup express server & bot
  await setup({ app, bot }, { mode: process.env.NODE_ENV });
}

main();
