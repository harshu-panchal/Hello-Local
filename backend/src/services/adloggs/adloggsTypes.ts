/**
 * Request/response shapes from "Adloggs Ordering Partner API Doc V2".
 * Where the document's field table and its JSON sample disagree on a type,
 * the JSON sample is followed and the choice is listed in
 * backend/docs/ADLOGGS_INTEGRATION.md for sandbox verification.
 */

export interface AdloggsAddressDetails {
  door_no?: string;
  street_name?: string;
  city_name: string;
  district_name?: string;
  state_name: string;
  country_name: string;
  pincode: string;
}

export interface AdloggsCreateOrderRequest {
  partner_order_id: string;
  partner_merchant_id?: string;
  partner_reference_id?: string;
  pickup_contact_name: string;
  pickup_contact_no: number;
  pickup_contact_email?: string;
  pickup_address: string;
  pickup_address_details: AdloggsAddressDetails;
  pickup_date_time: string; // "YYYY-MM-DD HH:mm"
  pickup_lat: number;
  pickup_long: number;
  delivery_contact_name?: string;
  delivery_contact_no: number;
  delivery_contact_email?: string;
  delivery_address: string;
  delivery_address_details: AdloggsAddressDetails;
  delivery_lat: number;
  delivery_long: number;
  pickup_otp?: number;
  delivery_otp?: number;
  return_otp?: number;
  order_category: "Food and Beverage" | "Grocery";
  order_total_price: string;
  order_total_weight_in_kg: string;
  items: Array<{ name: string; quantity: string; price: string }>;
  order_description?: string;
  utc_offset: number;
  payment_type: "Online" | "COD";
  collectible_amount: number;
}

export interface AdloggsCreateOrderResult {
  orderUuid: string;
  trackUrl?: string;
  partnerOrderId: string;
  /** Provider-reported booking fee (not a final invoice). */
  fee: number | null;
  distanceKm: number | null;
}

export interface AdloggsServiceabilityRequest {
  partner_merchant_id?: number;
  partner_order_id: string;
  pickup_lat: number;
  pickup_long: number;
  pickup_pincode: string;
  delivery_lat: number;
  delivery_long: number;
  delivery_pincode: string;
  utc_offset: number;
  payment_type: "Online" | "COD";
}

export type AdloggsServiceabilityResult =
  | { available: true; etaToPickupMin: number | null; distanceKm: number | null; estimatedPrice: number | null }
  | { available: false; code: string | null; message: string };

export interface AdloggsCurrentStatus {
  orderUuid: string;
  statusCode: number;
  isReturn: boolean | null;
  riderName: string | null;
  /** Not in the documented response; read only if the real API sends it (used for correlation). */
  partnerOrderId: string | null;
}

export type AdloggsCancelResult =
  | { cancelled: true }
  | { cancelled: false; reason: "ALREADY_PICKED_UP" | "ALREADY_DELIVERED" | "INVALID_ORDER_UUID" | "UNKNOWN_REJECTION"; message: string };

export type AdloggsWalletResult =
  | { state: "VERIFIED"; balance: string }
  | { state: "WALLET_NOT_ENABLED" };
