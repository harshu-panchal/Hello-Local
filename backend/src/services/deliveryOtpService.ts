import crypto from 'crypto';
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

    // Brute-force guard. A 4-digit OTP has 10,000 values and this endpoint used
    // to accept unlimited guesses from the assigned courier. (#H-16)
    const MAX_DELIVERY_OTP_ATTEMPTS = 5;
    const attempts = (order as any).deliveryOtpAttempts || 0;
    if (attempts >= MAX_DELIVERY_OTP_ATTEMPTS) {
      throw new Error(
        'Too many incorrect attempts. Ask the customer to refresh their delivery OTP.',
      );
    }

    // Verify against the customer's OTP.
    //
    // A hardcoded master OTP ('9999') used to be accepted whenever NODE_ENV was
    // not exactly 'production', which defeated proof of delivery entirely.
    // There is no bypass. (#C-07)
    const submitted = String(otp).trim();
    if (!/^[0-9]{4}$/.test(submitted)) {
      throw new Error('Invalid OTP. Please check and try again.');
    }

    const a = Buffer.from(String(customerOtp), 'utf8');
    const b = Buffer.from(submitted, 'utf8');
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!matches) {
      await Order.updateOne({ _id: orderId }, { $inc: { deliveryOtpAttempts: 1 } });
      throw new Error('Invalid OTP. Please check and try again.');
    }

    // Mark order as delivered
    order.deliveryOtpVerified = true;
    (order as any).deliveryOtpAttempts = 0;
    order.status = 'Delivered';
    order.deliveryBoyStatus = 'Delivered';
    if (order.paymentMethod === 'COD') {
      order.paymentStatus = 'Paid';
    }
    order.deliveredAt = new Date();
    order.invoiceEnabled = true;
    await order.save();

    // Rotate the customer's delivery OTP.
    //
    // It is a single permanent code reused for every order, so once it leaked
    // (to a courier, over the phone, from a screenshot) it stayed valid forever.
    // Rotating on each successful delivery bounds that exposure to one order.
    // (#H-16)
    try {
      const customerId =
        order.customer && typeof order.customer === 'object' && '_id' in (order.customer as any)
          ? (order.customer as any)._id
          : order.customer;
      if (customerId) {
        await Customer.updateOne(
          { _id: customerId },
          { $set: { deliveryOtp: crypto.randomInt(1000, 10000).toString() } },
        );
      }
    } catch (rotateErr) {
      // Never fail a completed delivery because rotation failed.
      console.error('Failed to rotate customer delivery OTP:', rotateErr);
    }

    return {
      success: true,
      message: 'OTP verified successfully. Order marked as delivered.',
    };
  } catch (error: any) {
    console.error('Error verifying delivery OTP:', error);
    throw new Error(error.message || 'Failed to verify delivery OTP');
  }
}
