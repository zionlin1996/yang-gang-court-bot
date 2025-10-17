function parseMessage(msg) {
  const commandToken = msg.text.split(' ')[0];
  const [command] = commandToken.split('@');
  const args = msg.text.split(' ').slice(1);
  const chatId = msg.chat.id;
  const id = msg.message_id;
  const userId = msg.from.username || msg.from.first_name;
  const initiator = msg.from;
  return {
    id,
    chatId,
    command,
    args,
    userId,
    initiator,
  };
}

module.exports = parseMessage;