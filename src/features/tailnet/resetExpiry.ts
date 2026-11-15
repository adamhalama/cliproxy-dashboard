export function resetExpiryCountdown(expires: number, now: number): string {
  const remaining = expires - now;
  if (remaining <= 0) return 'Expired';
  const minutes = Math.floor(remaining / 60000);
  if (minutes < 1) return 'Expires in <1m';
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Expires in ${hours}h ${minutes % 60}m`;
  return `Expires in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Quota windows reset within a week, so the weekday and local time identify the moment. */
export function resetWeekday(resets: number): string {
  const date = new Date(resets);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${weekdays[date.getDay()]} ${hours}:${minutes}`;
}

/** Local day, month, year, and time for a reset credit's expiry. */
export function formatResetExpiry(expires: number): string {
  const date = new Date(expires);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()}.${date.getMonth() + 1}. ${date.getFullYear()} ${hours}:${minutes}`;
}
