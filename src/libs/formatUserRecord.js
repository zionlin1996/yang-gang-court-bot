function formatUserRecord(user) {
  if (!user) return "無紀錄";
  
  const bailanCount = user.bailanCount || 0;
  const warningCount = user.warningCount || 0;
  
  return bailanCount.toString() + (warningCount > 0 ? ` + 醜一` : '');
}

module.exports = formatUserRecord;