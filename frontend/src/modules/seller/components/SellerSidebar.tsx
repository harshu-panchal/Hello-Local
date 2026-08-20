import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  SELLER_NAV_ITEMS,
  isNavItemActive,
  isSubmenuActive,
} from "../config/sellerNavigation";

interface SellerSidebarProps {
  onClose?: () => void;
}

export default function SellerSidebar({ onClose }: SellerSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(["/seller/product"]));
  const navRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Wheel listener to guarantee smooth trackpad, touchpad gestures, and mousewheel scrolling
  // and prevent external scroll libraries (e.g. Lenis) from intercepting gesture events.
  useEffect(() => {
    const nav = navRef.current;
    const aside = asideRef.current;
    if (!nav || !aside) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent parent / window scroll-hijacking libraries from preventing this event
      e.stopPropagation();
      e.stopImmediatePropagation();

      // If wheel occurred over the aside (such as header) outside nav, manually scroll nav
      if (!nav.contains(e.target as Node) && e.deltaY !== 0) {
        nav.scrollTop += e.deltaY;
      }
    };

    aside.addEventListener("wheel", handleWheel, { capture: true, passive: true });

    return () => {
      aside.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  // Touch drag state to ensure touch screen and touchpad gesture compatibility
  const touchStartY = useRef<number | null>(null);
  const touchStartScrollTop = useRef<number>(0);

  const handleNavigation = (path: string) => {
    navigate(path);
    // Close sidebar on mobile after navigation
    if (onClose && window.innerWidth < 1024) {
      onClose();
    }
  };

  const toggleMenu = (path: string) => {
    setExpandedMenus((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const isExpanded = (path: string) => {
    return (
      expandedMenus.has(path) ||
      isSubmenuActive(
        location.pathname,
        SELLER_NAV_ITEMS.find((item) => item.path === path)?.submenuItems
      )
    );
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length === 1 && navRef.current) {
      touchStartY.current = e.touches[0].clientY;
      touchStartScrollTop.current = navRef.current.scrollTop;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (touchStartY.current !== null && navRef.current && e.touches.length === 1) {
      const deltaY = touchStartY.current - e.touches[0].clientY;
      navRef.current.scrollTop = touchStartScrollTop.current + deltaY;
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  return (
    <aside
      ref={asideRef}
      data-lenis-prevent="true"
      data-lenis-prevent-wheel="true"
      data-lenis-prevent-touch="true"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "pan-y" }}
      className="w-64 bg-[#2D1B69] border-r border-[#1F104F] h-full max-h-screen flex flex-col shadow-xl overflow-hidden"
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-purple-900/60 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-400 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            HL
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold text-base tracking-tight leading-none">Seller Panel</span>
            <span className="text-[10px] text-purple-300 font-medium tracking-wide uppercase mt-1">Hello Local</span>
          </div>
        </div>
        {/* Close button - only show on mobile */}
        <button
          onClick={onClose}
          className="p-2 text-purple-200 hover:text-white transition-colors lg:hidden rounded-lg hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close menu">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <path
              d="M18 6L6 18M6 6L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Navigation Scrollable Menu */}
      <nav
        ref={navRef}
        data-lenis-prevent="true"
        data-lenis-prevent-wheel="true"
        data-lenis-prevent-touch="true"
        style={{
          touchAction: "pan-y",
          WebkitOverflowScrolling: "touch",
        }}
        className="flex-1 min-h-0 py-3 overflow-y-auto overflow-x-hidden seller-sidebar-nav"
      >
        <style>{`
          .seller-sidebar-nav {
            touch-action: pan-y;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-y: auto;
          }
          .seller-sidebar-nav::-webkit-scrollbar {
            width: 6px;
          }
          .seller-sidebar-nav::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.15);
          }
          .seller-sidebar-nav::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.35);
            border-radius: 9999px;
          }
          .seller-sidebar-nav::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.6);
          }
          /* For Firefox */
          .seller-sidebar-nav {
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.35) rgba(0, 0, 0, 0.15);
          }
        `}</style>

        <ul className="space-y-1 px-2.5 sm:px-3 pb-24" style={{ touchAction: "pan-y" }}>
          {SELLER_NAV_ITEMS.map((item) => {
            const expanded = isExpanded(item.path);
            const active =
              isNavItemActive(location.pathname, item.path) ||
              isSubmenuActive(location.pathname, item.submenuItems);

            return (
              <li key={item.path} style={{ touchAction: "pan-y" }}>
                <button
                  style={{ touchAction: "pan-y" }}
                  onClick={() => {
                    if (item.hasSubmenu && item.submenuItems) {
                      toggleMenu(item.path);
                    } else {
                      handleNavigation(item.path);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all min-h-[44px] ${
                    active
                      ? "bg-purple-600 text-white shadow-sm font-semibold"
                      : "text-purple-100/90 hover:bg-white/10 hover:text-white active:bg-white/15"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.icon && (
                      <span className={`flex-shrink-0 ${active ? "text-white" : "text-purple-300"}`}>{item.icon}</span>
                    )}
                    <span className="text-xs sm:text-sm truncate">
                      {item.label}
                    </span>
                  </div>
                  {item.hasSubmenu && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className={`transition-transform flex-shrink-0 ml-2 ${
                        expanded ? "rotate-180" : ""
                      } ${active ? "text-white" : "text-purple-300"}`}
                    >
                      <path
                        d="M6 9L12 15L18 9"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                {item.hasSubmenu && item.submenuItems && expanded && (
                  <ul className="mt-1 space-y-1 ml-4 border-l border-purple-500/30 pl-2" style={{ touchAction: "pan-y" }}>
                    {item.submenuItems.map((subItem) => {
                      const subActive =
                        location.pathname === subItem.path ||
                        location.pathname.startsWith(subItem.path + "/");
                      return (
                        <li key={subItem.path} style={{ touchAction: "pan-y" }}>
                          <button
                            style={{ touchAction: "pan-y" }}
                            onClick={() => handleNavigation(subItem.path)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all min-h-[40px] ${
                              subActive
                                ? "bg-purple-500/80 text-white font-medium shadow-xs"
                                : "text-purple-200/80 hover:bg-white/10 hover:text-white active:bg-white/15"
                            }`}
                          >
                            <span className="flex-shrink-0">
                              {subItem.icon}
                            </span>
                            <span className="text-xs sm:text-sm">
                              {subItem.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
