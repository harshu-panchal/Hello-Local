import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../../context/AuthContext';
import { getSocketBaseURL } from '../../../services/api/config';

export interface SellerNotification {
    type: 'NEW_ORDER' | 'STATUS_UPDATE';
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

export const useSellerSocket = (onNotificationReceived?: (notification: SellerNotification) => void) => {
    const { user, token, isAuthenticated } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    // Keep a stable ref to the latest callback so the socket listener never goes stale
    const callbackRef = useRef(onNotificationReceived);
    useEffect(() => {
        callbackRef.current = onNotificationReceived;
    });

    useEffect(() => {
        if (!isAuthenticated || !token || !user || user.userType !== 'Seller') {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
                setIsConnected(false);
            }
            return;
        }

        const socketUrl = getSocketBaseURL();
        const socket = io(socketUrl, {
            auth: { token },
            // polling first — always works behind nginx/reverse proxies;
            // socket.io will upgrade to WebSocket automatically when available
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Seller socket connected:', socket.id);
            setIsConnected(true);
            // Re-join seller room on every (re-)connect
            socket.emit('join-seller-room', user.id);
        });

        socket.on('joined-seller-room', (data: any) => {
            console.log('📦 Joined seller notification room:', data.sellerId);
        });

        socket.on('seller-notification', (notification: SellerNotification) => {
            console.log('🔔 Seller notification received:', notification);
            // Always call the LATEST version of the callback via ref — no stale closure
            callbackRef.current?.(notification);
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Seller socket disconnected:', reason);
            setIsConnected(false);
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Seller socket connection error:', err.message);
            setIsConnected(false);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [isAuthenticated, token, user?.id, user?.userType]);

    return { socket: socketRef.current, isConnected };
};
