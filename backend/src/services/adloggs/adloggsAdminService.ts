import mongoose from "mongoose";
import AppSettings from "../../models/AppSettings";
import Seller from "../../models/Seller";
import { AdloggsClient } from "./adloggsClient";
import { adloggsCapabilities } from "./adloggsConfig";
import { AdloggsError } from "./adloggsErrors";
import { ADLOGGS_ORDER_CATEGORIES } from "./adloggsPayload";

/**
 * Admin-only Adloggs operations. Nothing here returns or logs the API key,
 * books a delivery or moves money. The connectivity test uses the documented
 * non-booking wallet-balance endpoint.
 */

export async function getAdloggsAdminStatus() {
  const client = new AdloggsClient();
  const config = client.config();
  const capabilities = adloggsCapabilities(config);
  const settings: any = await AppSettings.findOne({}).select("adloggsDiagnostics").lean();
  const diagnostics = settings?.adloggsDiagnostics ?? {};
  return {
    environment: config.environment,
    integrationEnabled: config.integrationEnabled,
    apiKeyConfigured: config.hasApiKey,
    capabilities,
    connectivity: {
      verified: diagnostics.lastConnectivityOk === true,
      lastCheckedAt: diagnostics.lastConnectivityCheckAt ?? null,
      lastError: diagnostics.lastConnectivityError ?? null,
    },
    wallet: diagnostics.wallet ?? null,
  };
}

export type WalletView =
  | { state: "NOT_CONFIGURED"; message: string }
  | { state: "UNAVAILABLE"; message: string; lastVerified: { balance?: string; retrievedAt: Date } | null }
  | { state: "WALLET_NOT_ENABLED"; retrievedAt: Date }
  | { state: "VERIFIED"; balance: string; currency: "INR"; retrievedAt: Date };

/** Fetch the wallet balance (also serves as the connectivity test). Never fabricates a balance. */
export async function checkAdloggsWallet(client = new AdloggsClient(), now = new Date()): Promise<WalletView> {
  if (!adloggsCapabilities(client.config()).apiAccessAllowed) {
    return { state: "NOT_CONFIGURED", message: "Adloggs is not enabled for API access in this environment." };
  }
  try {
    const result = await client.getWalletBalance();
    const wallet = result.state === "VERIFIED" ? { state: "VERIFIED", balance: result.balance, retrievedAt: now } : { state: "WALLET_NOT_ENABLED", retrievedAt: now };
    await AppSettings.updateOne({}, { $set: { "adloggsDiagnostics.lastConnectivityCheckAt": now, "adloggsDiagnostics.lastConnectivityOk": true,
      "adloggsDiagnostics.wallet": wallet }, $unset: { "adloggsDiagnostics.lastConnectivityError": "" } });
    return result.state === "VERIFIED"
      ? { state: "VERIFIED", balance: result.balance, currency: "INR", retrievedAt: now }
      : { state: "WALLET_NOT_ENABLED", retrievedAt: now };
  } catch (error) {
    const message = error instanceof AdloggsError ? `${error.kind}: ${error.message}` : "Wallet balance unavailable.";
    await AppSettings.updateOne({}, { $set: { "adloggsDiagnostics.lastConnectivityCheckAt": now, "adloggsDiagnostics.lastConnectivityOk": false,
      "adloggsDiagnostics.lastConnectivityError": message.slice(0, 300) } });
    const previous: any = await AppSettings.findOne({}).select("adloggsDiagnostics.wallet").lean();
    const last = previous?.adloggsDiagnostics?.wallet;
    return { state: "UNAVAILABLE", message, lastVerified: last?.state === "VERIFIED" ? { balance: last.balance, retrievedAt: last.retrievedAt } : null };
  }
}

/**
 * Admin sets a seller's Adloggs pickup profile from verified information.
 * Validated strictly; nothing is inferred.
 */
export async function updateSellerAdloggsProfile(sellerId: string, body: any): Promise<{ ok: boolean; message: string; status?: number }> {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) return { ok: false, message: "Invalid seller id.", status: 400 };
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : null;
  const allowed = ["pickupPincode", "pickupState", "adloggsOrderCategory"];
  if (!keys || !keys.length || keys.some(key => !allowed.includes(key))) return { ok: false, message: `Only ${allowed.join(", ")} can be set.`, status: 400 };
  const set: Record<string, string> = {};
  if ("pickupPincode" in body) {
    if (typeof body.pickupPincode !== "string" || !/^[1-9][0-9]{5}$/.test(body.pickupPincode)) return { ok: false, message: "pickupPincode must be a 6-digit Indian pincode.", status: 400 };
    set.pickupPincode = body.pickupPincode;
  }
  if ("pickupState" in body) {
    if (typeof body.pickupState !== "string" || !body.pickupState.trim() || body.pickupState.length > 100) return { ok: false, message: "pickupState is required (max 100 characters).", status: 400 };
    set.pickupState = body.pickupState.trim();
  }
  if ("adloggsOrderCategory" in body) {
    if (!(ADLOGGS_ORDER_CATEGORIES as readonly string[]).includes(body.adloggsOrderCategory)) return { ok: false, message: `adloggsOrderCategory must be one of: ${ADLOGGS_ORDER_CATEGORIES.join(", ")}.`, status: 400 };
    set.adloggsOrderCategory = body.adloggsOrderCategory;
  }
  const result = await Seller.updateOne({ _id: sellerId }, { $set: set }, { runValidators: true });
  return result.matchedCount ? { ok: true, message: "Seller Adloggs pickup profile updated." } : { ok: false, message: "Seller not found.", status: 404 };
}

/**
 * Phase 7: which Hello Local data is still missing before Adloggs bookings can
 * be prepared (admin readiness summary). Read-only; makes no provider calls.
 */
export async function getAdloggsDataReadiness(limit = 20) {
  const Product = (await import("../../models/Product")).default;
  const sellerBase = { status: "Approved" };
  const missingSeller = { ...sellerBase, $or: [
    { pickupPincode: { $in: [null, ""] } }, { pickupState: { $in: [null, ""] } }, { adloggsOrderCategory: { $in: [null, ""] } },
  ] };
  const productBase = { status: "Active", publish: true };
  const missingWeight = { ...productBase, $or: [{ shippingWeightKg: { $exists: false } }, { shippingWeightKg: null }] };
  const [sellersTotal, sellersMissing, sellerRows, productsTotal, productsMissing, bySeller] = await Promise.all([
    Seller.countDocuments(sellerBase),
    Seller.countDocuments(missingSeller),
    Seller.find(missingSeller).select("storeName pickupPincode pickupState adloggsOrderCategory").limit(limit).lean(),
    Product.countDocuments(productBase),
    Product.countDocuments(missingWeight),
    Product.aggregate([{ $match: missingWeight }, { $group: { _id: "$seller", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: limit }]),
  ]);
  const names = new Map((await Seller.find({ _id: { $in: bySeller.map((row: any) => row._id) } }).select("storeName").lean())
    .map((seller: any) => [String(seller._id), seller.storeName]));
  const config = new AdloggsClient().config();
  return {
    policy: { pickupWindowConfigured: config.pickupWindowMinutes !== null },
    sellers: {
      approved: sellersTotal, missingPickupDetails: sellersMissing,
      examples: sellerRows.map((seller: any) => ({ id: String(seller._id), storeName: seller.storeName ?? "",
        missing: [!seller.pickupPincode && "pickup pincode", !seller.pickupState && "pickup state", !seller.adloggsOrderCategory && "goods category"].filter(Boolean) })),
    },
    products: {
      activePublished: productsTotal, missingShippingWeight: productsMissing,
      bySeller: bySeller.map((row: any) => ({ sellerId: String(row._id), storeName: names.get(String(row._id)) ?? "", count: row.count })),
    },
  };
}
