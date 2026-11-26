/**
 * Shipping weight per product unit (kg), used for partner-delivery (Adloggs)
 * bookings. Shared by every product create/update path (seller form, bulk
 * upload, master catalogue, admin screens) so they validate identically.
 */
export const SHIPPING_WEIGHT_MESSAGE = "Shipping weight must be a number between 0.001 and 1000 kg.";

/** null = empty (clears / not provided); "INVALID" = reject the request or row. */
export function normalizeShippingWeight(value: unknown): number | null | "INVALID" {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const weight = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(weight) || weight < 0.001 || weight > 1000) return "INVALID";
  return Math.round(weight * 1000) / 1000;
}
