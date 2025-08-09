const { NICKNAME_MAP } = require("../../constants");

const nicknameOf = (username) => {
  if (!username) return 'Unknown User';
  const normalizedUsername = username.startsWith('@') ? username : `@${username}`;
  return NICKNAME_MAP[normalizedUsername] || normalizedUsername;
}

module.exports = nicknameOf;

