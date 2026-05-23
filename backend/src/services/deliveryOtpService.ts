import Order from '../models/Order';
import Customer from '../models/Customer';

/**
 * Generate delivery OTP is no longer needed for regular orders.
 * Customer has a permanent deliveryOtp that is generated on account creation.
 * This function is kept for backward compatibility but does nothing meaningful now.
 */
export async function generateDeliveryOtp(orderId: string): Promise<{ success: boolean; message: string }> {
  try {
    const order = await Order.findById(orderId).populate('customer');

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'Delivered') {
      throw new Error('Order is already delivered');
    }

    // No longer generate per-order OTP - customer has permanent deliveryOtp
    let customerOtp: string | undefined;

    if (order.customer && typeof order.customer === 'object' && 'deliveryOtp' in order.customer) {
      customerOtp = (order.customer as any).deliveryOtp;
    } else if (order.customer) {
      // If not populated, fetch customer
      const customer = await Customer.findById(order.customer);
      customerOtp = customer?.deliveryOtp;
    }

    if (customerOtp) {
      // Dynamically import to avoid circular dependencies
      const { sendNotificationToUser } = await import('./firebaseAdmin');
      const customerId = typeof order.customer === 'object' && 'id' in (order.customer as any) 
                         ? (order.customer as any).id 
                         : order.customer.toString();
                         
      sendNotificationToUser(
        customerId,
        'Customer',
        {
          title: 'Delivery Partner Arrived',
          body: `Your delivery partner is here. Your Delivery OTP is ${customerOtp}.`,
          data: { type: 'DELIVERY_OTP', orderId: order._id.toString() }
        }
      ).catch(err => console.error('Failed to send OTP push notification to customer:', err));
    }

    console.log(`[Delivery OTP] Using customer's permanent delivery OTP for order ${orderId}`);

    return {
      success: true,
      message: 'Customer has been notified of their Delivery OTP. Ask them to share it.',
    };
  } catch (error: any) {
    console.error('Error in generateDeliveryOtp:', error);
    throw new Error(error.message || 'Failed to process delivery OTP request');
  }
}

/**
 * Verify delivery OTP using customer's permanent OTP
 */
export async function verifyDeliveryOtp(orderId: string, otp: string): Promise<{ success: boolean; message: string }> {
  try {
    const order = await Order.findById(orderId).populate('customer');

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'Delivered') {
      throw new Error('Order is already delivered');
    }

    // Get customer's permanent delivery OTP
    let customerOtp: string | undefined;

    if (order.customer && typeof order.customer === 'object' && 'deliveryOtp' in order.customer) {
      customerOtp = (order.customer as any).deliveryOtp;
    } else if (order.customer) {
      // If not populated, fetch customer
      const customer = await Customer.findById(order.customer);
      customerOtp = customer?.deliveryOtp;
    }

    if (!customerOtp) {
      throw new Error('Customer delivery OTP not found. Please contact support.');
    }

    // Verify OTP against customer's permanent OTP
    // Developer bypass for testing
    const isMockOtp = (process.env.NODE_ENV !== 'production' || process.env.USE_MOCK_OTP === 'true') && otp === '9999';
    if (!isMockOtp && customerOtp !== otp) {
      throw new Error('Invalid OTP. Please check and try again.');
    }

    // Mark order as delivered
    order.deliveryOtpVerified = true;
    order.status = 'Delivered';
    order.deliveryBoyStatus = 'Delivered';
    if (order.paymentMethod === 'COD') {
      order.paymentStatus = 'Paid';
    }
    order.deliveredAt = new Date();
    order.invoiceEnabled = true;
    await order.save();

    return {
      success: true,
      message: 'OTP verified successfully. Order marked as delivered.',
    };
  } catch (error: any) {
    console.error('Error verifying delivery OTP:', error);
    throw new Error(error.message || 'Failed to verify delivery OTP');
  }
}
