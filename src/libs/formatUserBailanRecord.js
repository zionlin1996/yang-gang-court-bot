
function formatUserBailanRecord(userId, records) {
  const user = records.find(r => r.userId === userId);
  if (!user) return "無紀錄";
  
  const bailanCount = user.bailanCount || 0;
  const warningCount = user.warningCount || 0;
  
  return bailanCount.toString() + (warningCount > 0 ? ` + 醜一` : '');
}

module.exports = formatUserBailanRecord;