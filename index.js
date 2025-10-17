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

bot.setMyCommands([
  { command: 'help', description: '顯示說明' },
  { command: 'rules', description: '顯示裁決規則' },
  { command: 'records', description: '查詢紀錄，可加 @使用者' },
  { command: 'vote', description: '對某人發起「白爛」投票（加 @使用者）' },
  { command: 'warn', description: '對某人發起「醜一」投票（加 @使用者）' },
  { command: 'pardon', description: '對某人發起「赦免」投票（加 @使用者）' },
  { command: 'agree', description: '同意目前進行中的投票' },
  { command: 'reject', description: '反對目前進行中的投票' },
  { command: 'status', description: '查看目前投票狀態' }
], { scope: { type: 'all_group_chats' } })
.catch((err) => {
  console.warn('Failed to register group commands:', err?.message || err);
});


// Bot commands
bot.handleCommand("/help", async (msg) => bot.respond(msg, HELP_MESSAGE));
bot.handleCommand("/rules", async (msg) => bot.respond(msg, RULES_MESSAGE));

bot.handleCommand("/records", async (msg) => {
  const { args } = parseMessage(msg);
  const targetUsername = args[0]?.trim();
  
  try {
    if (targetUsername) {
      if (!NICKNAME_MAP[targetUsername]) return bot.respond(msg, "無此用戶");

      const userRecord = await db.getUserRecord(targetUsername);

      const displayName = nicknameOf(targetUsername);
      if (userRecord) {
        const message = `${displayName} 的紀錄: ${formatUserRecord(userRecord)}`;
        await bot.respond(msg, message);
      } else {
        await bot.respond(msg, `找不到用戶${displayName}的紀錄`);
      }
    } else {
      // Show all records
      const allRecords = await db.getAllUserRecords();
      if (allRecords.length === 0) return bot.respond(msg, "目前沒有任何紀錄")
      
      const message = allRecords.map(record => `${nicknameOf(record.userId)} ${formatUserRecord(record)}`).join('\n');
      await bot.respond(msg, message);
    }
  } catch (error) {
    console.error('Error getting records:', error);
    await bot.respond(msg, "查詢紀錄時發生錯誤");
  }
});

bot.handleCommand("/vote", (msg) => voteManager.handleNewVote(msg, 'bailan'));
bot.handleCommand("/warn", (msg) => voteManager.handleNewVote(msg, 'warning'));
bot.handleCommand("/pardon", (msg) => voteManager.handleNewVote(msg, 'pardon'));
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
