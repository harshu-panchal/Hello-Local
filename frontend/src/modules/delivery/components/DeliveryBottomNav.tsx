import { Link, useLocation } from 'react-router-dom';

export default function DeliveryBottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/delivery') return location.pathname === '/delivery';
    if (path === '/delivery/orders') return location.pathname.startsWith('/delivery/orders');
    if (path === '/delivery/wallet') return location.pathname.startsWith('/delivery/wallet') || location.pathname.startsWith('/delivery/earnings');
    if (path === '/delivery/menu') return location.pathname === '/delivery/menu' || location.pathname === '/delivery/profile' || location.pathname === '/delivery/settings' || location.pathname === '/delivery/help' || location.pathname === '/delivery/about';
    return location.pathname === path;
  };

  const navItems = [
    {
      path: '/delivery',
      label: 'Home',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Grid of 9 squares */}
          <rect x="3" y="3" width="6" height="6" rx="1.5" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="11" y="3" width="6" height="6" rx="1.5" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="19" y="3" width="2" height="6" rx="1" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="3" y="11" width="6" height="6" rx="1.5" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="11" y="11" width="6" height="6" rx="1.5" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="19" y="11" width="2" height="6" rx="1" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="3" y="19" width="6" height="2" rx="1" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="11" y="19" width="6" height="2" rx="1" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
          <rect x="19" y="19" width="2" height="2" rx="1" fill={isActive('/delivery') ? '#e11d48' : '#94a3b8'} />
        </svg>
      ),
    },
    {
      path: '/delivery/orders',
      label: 'Orders',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Delivery truck with speed lines */}
          <path
            d="M2 17H4L5 12H19L20 17H22M2 17C2 18.1046 2.89543 19 4 19C5.10457 19 6 18.1046 6 17M2 17C2 15.8954 2.89543 15 4 15C5.10457 15 6 15.8954 6 17M22 17C22 18.1046 21.1046 19 20 19C18.8954 19 18 18.1046 18 17M22 17C22 15.8954 21.1046 15 20 15C18.8954 15 18 15.8954 18 17M6 17H18M5 12L4 7H2M20 12L21 7H22"
            stroke={isActive('/delivery/orders') ? '#e11d48' : '#94a3b8'}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path d="M8 10H10M12 10H14" stroke={isActive('/delivery/orders') ? '#e11d48' : '#94a3b8'} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      ),
    },
    {
      path: '/delivery/wallet',
      label: 'Wallet',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect
            x="2"
            y="5"
            width="20"
            height="14"
            rx="3"
            stroke={isActive('/delivery/wallet') ? '#e11d48' : '#94a3b8'}
            strokeWidth="2.2"
            fill="none"
          />
          <line
            x1="2"
            y1="10"
            x2="22"
            y2="10"
            stroke={isActive('/delivery/wallet') ? '#e11d48' : '#94a3b8'}
            strokeWidth="2.2"
          />
          <circle
            cx="17"
            cy="15"
            r="1.5"
            fill={isActive('/delivery/wallet') ? '#e11d48' : '#94a3b8'}
          />
        </svg>
      ),
    },
    {
      path: '/delivery/menu',
      label: 'Menu',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3 12H21M3 6H21M3 18H21"
            stroke={isActive('/delivery/menu') ? '#e11d48' : '#94a3b8'}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] z-40">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-all active:scale-95 ${
                active ? 'text-rose-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="transition-transform duration-150">
                {item.icon}
              </div>
              <span
                className={`text-[11px] mt-1 tracking-tight ${
                  active ? 'text-rose-600 font-black' : 'text-slate-500 font-semibold'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
