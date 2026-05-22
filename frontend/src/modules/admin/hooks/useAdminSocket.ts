import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../../context/AuthContext';
import { getSocketBaseURL } from '../../../services/api/config';

export interface AdminSocketNotification {
    type: 'NEW_ORDER' | 'STATUS_UPDATE' | 'ORDER_CANCELLED';
    orderId: string;
    orderNumber: string;
    status: string;
    paymentMethod?: string;
    paymentStatus?: string;
    totalAmount: number;
    customerName?: string;
    timestamp: Date;
}

/**
 * Connects the admin panel to the backend socket server and listens for
 * real-time admin notifications (new orders, status changes, etc.).
 */
export const useAdminSocket = (onNotification?: (n: AdminSocketNotification) => void) => {
    const { user, token, isAuthenticated } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    // Stable ref so the socket listener always calls the latest callback
    const callbackRef = useRef(onNotification);
    useEffect(() => {
        callbackRef.current = onNotification;
    });

    useEffect(() => {
        if (!isAuthenticated || !token || !user || user.userType !== 'Admin') {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                setIsConnected(false);
            }
            return;
        }

        const socket = io(getSocketBaseURL(), {
            auth: { token },
            // polling first — reliable behind nginx; upgrades to WebSocket automatically
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Admin socket connected:', socket.id);
            setIsConnected(true);
            // Join admin-notifications room on every (re-)connect
            socket.emit('join-admin-room');
        });

        socket.on('joined-admin-room', (data: any) => {
            console.log('🛡️  Joined admin notifications room:', data);
        });

        socket.on('admin-notification', (notification: AdminSocketNotification) => {
            console.log('🔔 Admin notification received:', notification);
            callbackRef.current?.(notification);
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Admin socket disconnected:', reason);
            setIsConnected(false);
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Admin socket connection error:', err.message);
            setIsConnected(false);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [isAuthenticated, token, user?.id, user?.userType]);

    return { isConnected, socket: socketRef.current };
};
