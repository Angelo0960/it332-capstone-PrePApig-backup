import { useNavigate } from 'react-router-dom';
import { Home, Package, Syringe, TrendingUp } from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Home', icon: Home, activeColor: 'purple' },
  { path: '/feeds', label: 'Feeds', icon: Package, activeColor: 'blue' },
  { path: '/vaccination', label: 'Vaccination', icon: Syringe, activeColor: 'pink' },
  { path: '/reports', label: 'Reports', icon: TrendingUp, activeColor: 'green' },
];

export default function BottomNav({ active = '' }) {
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/20 backdrop-blur-xl border-t border-white/30 px-4 py-3 shadow-2xl z-50">
      <div className="flex items-center justify-around md:justify-center md:gap-8 lg:gap-16">
        {navItems.map((item) => {
          const isActive = active === item.label;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-1"
            >
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-[6px_6px_12px_rgba(0,0,0,0.1),-6px_-6px_12px_rgba(255,255,255,0.8)] active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-3px_-3px_6px_rgba(255,255,255,0.8)] ${
                  isActive
                    ? `bg-gradient-to-br from-${item.activeColor}-400 to-${item.activeColor}-500`
                    : 'bg-white/40 backdrop-blur-sm'
                }`}
              >
                <item.icon
                  className={`w-6 h-6 ${isActive ? 'text-white' : 'text-gray-500'}`}
                />
              </div>
              <span
                className={`text-xs ${
                  isActive
                    ? `font-semibold text-${item.activeColor}-600`
                    : 'text-gray-600'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}