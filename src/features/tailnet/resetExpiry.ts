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
