const NICKNAME_MAP = {
  "@Amao62626": "生毛",
  "@maxbillchung": "澄澄兒",
  "@yanglin1112": "暘暘兒",
}

const HELP_MESSAGE = `
指令:
• /help - 顯示說明文字
• /rules - 顯示群組規則
• /records <username> - 顯示白爛紀錄。如果沒有指定用戶，顯示所有人的紀錄
• /vote <username> - 投票是否白爛 (發起人自動同意，需要1票同意)
• /warn <username> - 投票是否醜一 (發起人自動同意，需要1票同意)。如果醜二，視為白爛一次
• /pardon <username> - 投票是否赦免 (發起人自動同意，需要1票同意)。成功後白爛 -1
• /agree - 同意目前投票
• /reject - 反對目前投票
• /status - 顯示目前投票狀態

自動投票功能:
• 回覆某人的訊息並輸入 "白爛+1" 或 "醜一" 即可自動開始投票
`;

const RULES_MESSAGE = `
禁聊不好笑的政治文 統神 白爛 遲到 甲片 甯芝蓶 羅傑白癡 gif 
禁分享影片自己不看
違規請麥香
`;

module.exports = {
  NICKNAME_MAP,
  HELP_MESSAGE,
  RULES_MESSAGE,
}