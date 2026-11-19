import { useEffect, useState } from 'react';
import './ui.css';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const down = () => setOffline(true);
    const up = () => setOffline(false);
    window.addEventListener('offline', down);
    window.addEventListener('online', up);
    return () => {
      window.removeEventListener('offline', down);
      window.removeEventListener('online', up);
    };
  }, []);

  if (!offline) return null;
  return (
    <p role="status" className="offline-banner">
      You're offline. Changes will need a connection.
    </p>
  );
}
