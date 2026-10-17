// Deterministic local time for date logic (coupon dates, quiet hours, reminders).
module.exports = async () => {
  process.env.TZ = 'Europe/Warsaw';
};
