import { CartItem } from './cart';

export type OrderStatus =
  | 'Received'
  | 'Accepted'
  | 'Pending'
  | 'Processed'
  | 'Shipped'
  | 'Picked up'
  | 'On the way'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Rejected'
  | 'Returned'
  | 'Completed';

export interface OrderAddress {
  name: string;
  phone: string;
  flat: string;
  street: string;
  address?: string; // Add address field for backend compat
  city: string;
  state?: string;
  pincode: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  id?: string;
  _id?: string;
}

export interface OrderFees {
  platformFee?: number;
  deliveryFee?: number;
}

export interface Order {
  id: string;
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  fees: OrderFees;
  totalAmount: number;
  address: OrderAddress;
  status: OrderStatus;
  paymentMethod?: string;
  createdAt: string;
  tipAmount?: number;
  donationAmount?: number;
  gstin?: string;
  couponCode?: string;
  giftPackaging?: boolean;
}


