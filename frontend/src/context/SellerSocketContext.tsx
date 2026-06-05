/**
 * SellerSocketContext
 *
 * Manages a SINGLE socket connection for the entire seller panel.
 * Both SellerLayout (popup alert) and SellerOrders (list refresh)
 * share the same connection through this context.
 *
 * Wrap the seller route tree with <SellerSocketProvider> in App.tsx.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getSocketBaseURL } from '../services/api/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SellerNotification {
  type: 'NEW_ORDER' | 'STATUS_UPDATE' | 'ORDER_CANCELLED';
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: {
      address: string;
      city: string;
      state?: string;
      pincode: string;
      landmark?: string;
    };
  };
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
    total: number;
    variation?: string;
  }>;
  totalAmount: number;
  timestamp: Date;
}

interface SellerSocketContextType {
  isConnected: boolean;
  lastNotification: SellerNotification | null;
  clearNotification: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SellerSocketContext = createContext<SellerSocketContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SellerSocketProvider({ children }: { children: ReactNode }) {
  const { user, token, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<SellerNotification | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Only connect for authenticated sellers
    if (!isAuthenticated || !token || !user || user.userType !== 'Seller') {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      // Clear any notification from a previous session so a fresh login (or a
      // different seller on the same SPA session) doesn't see a stale
      // accept/reject popup. (#first-login-notification)
      setLastNotification(null);
      return;
    }

    // Prevent double-connection on StrictMode double-invoke
    if (socketRef.current?.connected) return;

    const socketUrl = getSocketBaseURL();
    console.log('[SellerSocket] Connecting to', socketUrl);

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ [SellerSocket] Connected:', socket.id);
      setIsConnected(true);
      // Join the seller-specific room on every (re-)connect
      socket.emit('join-seller-room', user.id);
    });

    socket.on('joined-seller-room', (data: any) => {
      console.log('📦 [SellerSocket] Joined room for seller:', data.sellerId);
    });

    socket.on('seller-notification', (notification: SellerNotification) => {
      console.log('🔔 [SellerSocket] Notification received:', notification.type, notification.orderNumber);
      setLastNotification(notification);
    });

    socket.on('disconnect', (reason) => {
      console.warn('❌ [SellerSocket] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ [SellerSocket] Connection error:', err.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token, user?.id, user?.userType]);

  const clearNotification = useCallback(() => {
    setLastNotification(null);
  }, []);

  return (
    <SellerSocketContext.Provider value={{ isConnected, lastNotification, clearNotification }}>
      {children}
    </SellerSocketContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSellerSocketContext(): SellerSocketContextType {
  const ctx = useContext(SellerSocketContext);
  if (!ctx) {
    throw new Error('useSellerSocketContext must be used inside <SellerSocketProvider>');
  }
  return ctx;
}
