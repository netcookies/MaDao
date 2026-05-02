export function NotifIcon({ level }: { level: string }) {
  const symbol = level === 'error' ? '⊘' : level === 'warn' ? '?' : 'i';
  return <span className={`d-notif-icon ${level}`}>{symbol}</span>;
}
