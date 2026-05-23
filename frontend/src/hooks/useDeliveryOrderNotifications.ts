import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { OrderNotificationData } from '../services/api/delivery/deliveryOrderNotificationService';
import { acceptOrder, rejectOrder } from '../services/api/delivery/deliveryOrderNotificationService';
import { getSocketBaseURL } from '../services/api/config';

interface NotificationState {
    currentNotification: OrderNotificationData | null;
    notificationQueue: OrderNotificationData[];
    isConnected: boolean;
    error: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 2000;

/** Helper: advance to the next queued notification */
const advanceQueue = (prev: NotificationState): NotificationState => {
    const nextNotification = prev.notificationQueue[0] || null;
    return {
        ...prev,
        currentNotification: nextNotification,
        notificationQueue: prev.notificationQueue.slice(1),
    };
};

export const useDeliveryOrderNotifications = () => {
    const { isAuthenticated, user } = useAuth();
    const [state, setState] = useState<NotificationState>({
        currentNotification: null,
        notificationQueue: [],
        isConnected: false,
        error: null,
    });

    const socketRef = useRef<Socket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);

    /**
     * Track order IDs this delivery boy has already rejected (within this session).
     * Used to suppress re-notifications from the backend re-send logic on reconnect.
     * Persisted across re-renders via ref; not stored in DB (in-memory per session).
     */
    const rejectedOrderIdsRef = useRef<Set<string>>(new Set());

    const connectSocket = useCallback(() => {
        if (!isAuthenticated || user?.userType !== 'Delivery' || !user?.id) {
            return;
        }

        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        const token = localStorage.getItem('authToken');
        const socket = io(getSocketBaseURL(), {
            auth: { token },
            // polling first — works reliably behind nginx/reverse proxies;
            // socket.io auto-upgrades to WebSocket when the server supports it
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectionDelay: INITIAL_RECONNECT_DELAY,
            reconnectionDelayMax: 10000,
            timeout: 20000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('🔌 Delivery notification socket connected');
            reconnectAttemptsRef.current = 0;
            setState(prev => ({
                ...prev,
                isConnected: true,
                error: null,
            }));

            // Join delivery notification room
            socket.emit('join-delivery-notifications', user.id);
        });

        socket.on('joined-notifications-room', (data: any) => {
            console.log('✅ Successfully joined notifications room:', data);
        });

        socket.on('connect_error', (error) => {
            console.error('❌ Socket connection error:', error.message);
            setState(prev => ({
                ...prev,
                isConnected: false,
                error: `Connection failed: ${error.message}`,
            }));
        });

        socket.on('disconnect', (reason) => {
            console.warn('⚠️ Socket disconnected:', reason);
            setState(prev => ({
                ...prev,
                isConnected: false,
            }));
        });

        socket.on('new-order', (orderData: OrderNotificationData & { isPendingRenotification?: boolean }) => {
            console.log('📦 New order notification received:', orderData.orderId, orderData.isPendingRenotification ? '(re-notification)' : '(fresh)');

            setState(prev => {
                // ── 1. De-duplicate: the backend emits to both individual room and
                //      delivery-notifications broadcast, so the same orderId can arrive twice.
                if (prev.currentNotification?.orderId === orderData.orderId) {
                    console.log('⚠️ Duplicate ignored (already current):', orderData.orderId);
                    return prev;
                }
                if (prev.notificationQueue.some(n => n.orderId === orderData.orderId)) {
                    console.log('⚠️ Duplicate ignored (already queued):', orderData.orderId);
                    return prev;
                }

                // ── 2. For re-notifications from backend reconnect logic: skip orders
                //      this delivery boy already rejected in this session.
                if (orderData.isPendingRenotification && rejectedOrderIdsRef.current.has(orderData.orderId)) {
                    console.log('⏭️ Re-notification ignored — already rejected this order:', orderData.orderId);
                    return prev;
                }

                // If there's already a current notification, queue this one
                if (prev.currentNotification) {
                    return {
                        ...prev,
                        notificationQueue: [...prev.notificationQueue, orderData],
                    };
                }
                // Otherwise show immediately
                return {
                    ...prev,
                    currentNotification: orderData,
                };
            });
        });

        socket.on('order-accepted', (data: { orderId: string; acceptedBy: string }) => {
            console.log('✅ Order accepted:', data.orderId, 'by', data.acceptedBy);

            setState(prev => {
                if (prev.currentNotification?.orderId === data.orderId) {
                    return advanceQueue(prev);
                }
                return {
                    ...prev,
                    notificationQueue: prev.notificationQueue.filter(
                        notif => notif.orderId !== data.orderId
                    ),
                };
            });
        });

        socket.on('order-rejected-by-all', (data: { orderId: string }) => {
            console.log('❌ All delivery boys rejected order:', data.orderId);

            setState(prev => {
                if (prev.currentNotification?.orderId === data.orderId) {
                    return advanceQueue(prev);
                }
                return {
                    ...prev,
                    notificationQueue: prev.notificationQueue.filter(
                        notif => notif.orderId !== data.orderId
                    ),
                };
            });
        });

        // Handle order-rejection-acknowledged — dismiss from THIS delivery boy's UI
        socket.on('order-rejection-acknowledged', (data: { orderId: string }) => {
            console.log('✅ Rejection acknowledged for order:', data.orderId);
            // Notification was already dismissed optimistically in handleReject; this is
            // just a confirmation. No extra UI action needed.
        });

        socket.on('disconnect', (reason: any) => {
            console.log('❌ Delivery notification socket disconnected:', reason);
            setState(prev => ({ ...prev, isConnected: false }));

            if (reason === 'io server disconnect' || reason === 'io client disconnect') {
                return; // Don't auto-reconnect if intentionally disconnected
            }

            attemptReconnect();
        });

        socket.on('connect_error', (error: any) => {
            console.error('Socket connection error:', error);
            setState(prev => ({
                ...prev,
                isConnected: false,
                error: 'Failed to connect to notification server',
            }));

            attemptReconnect();
        });

        socket.on('error', (error: any) => {
            console.error('Socket error:', error);
            setState(prev => ({
                ...prev,
                error: 'Notification service error',
            }));
        });

        return socket;
    }, [isAuthenticated, user]);

    const attemptReconnect = useCallback(() => {
        reconnectAttemptsRef.current += 1;

        if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
            console.log('❌ Max reconnection attempts reached');
            setState(prev => ({
                ...prev,
                error: 'Unable to connect. Please refresh the page.',
            }));
            return;
        }

        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

        reconnectTimeoutRef.current = setTimeout(() => {
            disconnectSocket();
            connectSocket();
        }, delay);
    }, [connectSocket]);

    const disconnectSocket = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
    }, []);

    /**
     * Accept an order.
     * On ANY outcome (success or failure), the notification is cleared from the UI.
     * Success  → navigate to the order detail page.
     * Failure  → dismiss silently (order may have been taken by another delivery boy).
     */
    const handleAccept = useCallback(async (orderId: string, navigate?: (path: string) => void) => {
        if (!socketRef.current || !user?.id) {
            // No socket — dismiss immediately so the card doesn't get stuck
            setState(prev => advanceQueue(prev));
            return { success: false, message: 'Not connected or user not found' };
        }

        try {
            const result = await acceptOrder(socketRef.current, orderId, user.id);

            if (result.success) {
                // Dismiss card and navigate to order detail
                setState(prev => advanceQueue(prev));
                if (navigate) {
                    navigate(`/delivery/orders/${orderId}`);
                }
            } else {
                // Dismiss silently for ALL failures:
                //   • "Order already assigned to another delivery boy" — taken, nothing to do
                //   • "Order notification not found" — stale state, already cleaned up
                //   • "You have already rejected this order" — shouldn't happen, dismiss anyway
                //   • Any other error — dismiss rather than confusing the delivery boy
                console.warn(`⚠️ Accept failed for order ${orderId}: ${result.message} — auto-dismissing.`);
                setState(prev => advanceQueue(prev));
            }

            return result;
        } catch (error: any) {
            console.error('Error accepting order:', error);
            setState(prev => advanceQueue(prev));
            return { success: false, message: error.message || 'Failed to accept order' };
        }
    }, [user]);

    /**
     * Reject an order.
     * The notification is dismissed IMMEDIATELY (optimistic UI) before the socket call
     * so the delivery boy never sees a "Processing…" spinner.
     * The order ID is stored in rejectedOrderIdsRef so it won't reappear on reconnect.
     */
    const handleReject = useCallback(async (orderId: string) => {
        if (!socketRef.current || !user?.id) {
            // No socket — still dismiss and track locally
            rejectedOrderIdsRef.current.add(orderId);
            setState(prev => advanceQueue(prev));
            return { success: false, message: 'Not connected or user not found', allRejected: false };
        }

        // Track locally BEFORE the socket call so reconnect logic can filter it out
        rejectedOrderIdsRef.current.add(orderId);

        // Optimistic dismiss — card disappears immediately
        setState(prev => advanceQueue(prev));

        try {
            const result = await rejectOrder(socketRef.current, orderId, user.id);
            return result;
        } catch (error: any) {
            console.error('Failed to reject order in background:', error);
            return { success: false, message: error.message || 'Failed to reject order', allRejected: false };
        }
    }, [user]);

    const clearCurrentNotification = useCallback(() => {
        setState(prev => advanceQueue(prev));
    }, []);

    useEffect(() => {
        if (!isAuthenticated || user?.userType !== 'Delivery' || !user?.id) {
            disconnectSocket();
            return;
        }

        connectSocket();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            disconnectSocket();
        };
    }, [isAuthenticated, user, connectSocket, disconnectSocket]);

    return {
        currentNotification: state.currentNotification,
        notificationQueue: state.notificationQueue,
        isConnected: state.isConnected,
        error: state.error,
        acceptOrder: handleAccept,
        rejectOrder: handleReject,
        clearNotification: clearCurrentNotification,
        socket: socketRef.current,
    };
};
