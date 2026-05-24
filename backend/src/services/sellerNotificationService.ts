import { Server as SocketIOServer } from 'socket.io';
import OrderItem from '../models/OrderItem';
import { sendNotificationToUser } from './firebaseAdmin';

/**
 * Notify all sellers involved in an order about a new order or status change
 */
export async function notifySellersOfOrderUpdate(
    io: SocketIOServer,
    order: any,
    type: 'NEW_ORDER' | 'STATUS_UPDATE' | 'ORDER_CANCELLED'
): Promise<void> {
    try {
        if (!io) {
            console.error('Socket.io server not provided to notifySellersOfOrderUpdate');
            return;
        }

        // Ensure we have order items
        let orderItems = order.items || [];

        // Check if we need to fetch full items from DB
        // We need to fetch if the first item is just an ID (missing 'productName' field)
        if (orderItems.length > 0 && !orderItems[0].productName) {
            orderItems = await OrderItem.find({ order: order._id });
        } else if (orderItems.length === 0 && order.total > 0) {
            // Fallback just in case items array is empty but it's a real order
            orderItems = await OrderItem.find({ order: order._id });
        }

        if (!orderItems || orderItems.length === 0) {
            console.log(`No items found for order ${order.orderNumber}, skipping seller notification.`);
            return;
        }

        const sellerIds: string[] = [...new Set<string>(orderItems.map((item: any) => {
            if (!item.seller) return '';
            return typeof item.seller === 'object' && item.seller._id 
                ? item.seller._id.toString() 
                : item.seller.toString();
        }).filter((id: string) => id !== ''))];

        console.log(`🔔 Notifying ${sellerIds.length} sellers about ${type} for order ${order.orderNumber}`);

        for (const sellerId of sellerIds) {
            // Get only items belonging to this seller
            const sellerSpecificItems = orderItems.filter((item: any) => item.seller.toString() === sellerId);

            const notificationData = {
                type,
                orderId: order._id,
                orderNumber: order.orderNumber,
                status: order.status,
                paymentStatus: order.paymentStatus,
                customer: {
                    name: order.customerName,
                    email: order.customerEmail,
                    phone: order.customerPhone,
                    address: order.deliveryAddress
                },
                items: sellerSpecificItems.map((item: any) => ({
                    productName: item.productName,
                    quantity: item.quantity,
                    price: item.unitPrice,
                    total: item.total,
                    variation: item.variation
                })),
                totalAmount: sellerSpecificItems.reduce((acc: number, item: any) => acc + item.total, 0),
                timestamp: new Date()
            };

            // Emit to seller-specific room
            io.to(`seller-${sellerId}`).emit('seller-notification', notificationData);
            console.log(`📤 Emitted notification to seller-${sellerId}`);

            // Send push notification
            let title = '🔔 Order Update';
            let body = `Order #${order.orderNumber} status is now ${order.status}`;

            if (type === 'NEW_ORDER') {
                title = '📦 New Order Received!';
                body = `You have a new order #${order.orderNumber} for ₹${notificationData.totalAmount.toLocaleString('en-IN')}`;
            } else if (type === 'ORDER_CANCELLED') {
                title = '❌ Order Cancelled';
                body = `Order #${order.orderNumber} has been cancelled`;
            }

            sendNotificationToUser(sellerId, 'Seller', {
                title,
                body,
                data: {
                    type,
                    orderId: order._id.toString(),
                    orderNumber: order.orderNumber
                }
            }).catch(err => console.error(`❌ Push notification failed for seller ${sellerId}:`, err));
        }

        // Also notify admin room in real-time for new orders
        if (type === 'NEW_ORDER') {
            const adminPayload = {
                type: 'NEW_ORDER',
                orderId: order._id,
                orderNumber: order.orderNumber,
                status: order.status,
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
                totalAmount: order.total || 0,
                customerName: order.customerName,
                timestamp: new Date(),
            };
            io.to('admin-notifications').emit('admin-notification', adminPayload);
            console.log(`📤 Emitted admin-notification for new order ${order.orderNumber}`);
        }
    } catch (error) {
        console.error('Error in notifySellersOfOrderUpdate:', error);
    }
}
