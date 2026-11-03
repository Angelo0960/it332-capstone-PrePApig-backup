import { useEffect, useState } from 'react';
import { getOfflineStatus, offlineEvents } from '../services/offlineSync.js';

export default function useOfflineStatus() {
  const [state, setState] = useState({ online: navigator.onLine !== false, pending: 0 });
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const online = navigator.onLine !== false;
      let status;
      try { status = await getOfflineStatus(); }
      catch { status = { pending: 0, failed: 0, needsReview: 0 }; }
      if (active) setState({ online, pending: status.pending + status.failed + status.needsReview });
    };
    const onNetwork = () => { void refresh(); };
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
    window.addEventListener(offlineEvents.state, onNetwork);
    void refresh();
    return () => {
      active = false;
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      window.removeEventListener(offlineEvents.state, onNetwork);
    };
  }, []);
  return { isOnline: state.online, pendingSync: state.pending };
}
