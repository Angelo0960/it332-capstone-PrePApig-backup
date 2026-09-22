import { usePWA } from '../hooks/usePWA';
import { Download, MonitorSmartphone, WifiOff, RefreshCw, X, Check } from 'lucide-react';

export const PWAInstallPrompt = ({ className = '' }) => {
  const { isInstallable, isInstalled, install } = usePWA();

  if (!isInstallable || isInstalled) return null;

  return (
    <div className={`fixed bottom-4 left-4 right-4 md:bottom-24 md:left-auto md:right-4 md:w-80 z-50 animate-slide-up ${className}`}>
      <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-green-100/80 rounded-full flex items-center justify-center flex-shrink-0">
            <MonitorSmartphone className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm">Install PrepAPig</h3>
            <p className="text-xs text-gray-600 mt-1">Add to home screen for offline access & faster loading</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsInstallable(false)}
              className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={install}
              className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold shadow-lg active:scale-95 transition-transform"
            >
              Install
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PWAUpdateBanner = ({ className = '' }) => {
  const { hasUpdate, update, dismissUpdate } = usePWA();

  if (!hasUpdate) return null;

  return (
    <div className={`fixed top-4 left-4 right-4 md:top-4 md:left-auto md:right-4 md:w-80 z-50 animate-slide-down ${className}`}>
      <div className="bg-blue-100/90 backdrop-blur-xl border border-blue-200/50 rounded-2xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100/80 rounded-full flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm">Update Available</h3>
            <p className="text-xs text-gray-600 mt-1">A new version of PrepAPig is ready</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={dismissUpdate}
              className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={update}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg active:scale-95 transition-transform"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PWAOfflineIndicator = ({ className = '' }) => {
  const { isOnline, isInstalled } = usePWA();

  if (isOnline || !isInstalled) return null;

  return (
    <div className={`fixed bottom-4 left-4 right-4 md:bottom-4 md:left-auto md:right-4 md:w-64 z-50 animate-slide-up ${className}`}>
      <div className="bg-orange-100/90 backdrop-blur-xl border border-orange-200/50 rounded-2xl shadow-2xl p-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-100/80 rounded-full flex items-center justify-center flex-shrink-0">
            <WifiOff className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-orange-800">You're offline</p>
            <p className="text-[10px] text-orange-600">Cached data available</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PWAAddToHomeButton = ({ className = '', variant = 'primary' }) => {
  const { isInstallable, isInstalled, install } = usePWA();

  if (!isInstallable || isInstalled) return null;

  const variants = {
    primary: 'bg-green-500 text-white',
    secondary: 'bg-white/30 text-gray-700 border border-white/40',
    outline: 'border-2 border-green-500 text-green-500 bg-transparent',
  };

  return (
    <button
      onClick={install}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold shadow-lg active:scale-95 transition-transform ${variants[variant]} ${className}`}
    >
      <Download className="w-4 h-4" />
      <span>Install App</span>
    </button>
  );
};

export const PWAStatus = ({ className = '' }) => {
  const { isInstalled, isOnline, hasUpdate } = usePWA();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
      <span className="text-xs text-gray-600">
        {isInstalled ? 'Installed' : 'Browser'}
        {hasUpdate && ' • Update ready'}
      </span>
    </div>
  );
};