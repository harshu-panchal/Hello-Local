import mongoose, { ClientSession } from "mongoose";
import AppSettings from "../models/AppSettings";
import SettingAuditLog from "../models/SettingAuditLog";
import { isTransactionRetryError } from "./inHouseDeliveryService";

/**
 * Global delivery provider selection (Phase 2).
 *
 * - One active provider for the whole platform (`deliveryProvider.active`).
 * - Selection is separate from the in-house ON/OFF switch: neither changes
 *   the other.
 * - A provider can only be selected when it is operational (configured AND
 *   enabled). Addlogs is listed but has no integration yet, so it is never
 *   configured, never selectable and never receives work.
 * - New delivery-dependent checkouts require the active provider to be
 *   operational; otherwise they are refused.
 * - Each online order records its provider when it is placed; later changes
 *   to the global selection never reroute existing orders.
 */

export const DELIVERY_PROVIDERS = ["IN_HOUSE", "ADDLOGS"] as const;
export type DeliveryProviderId = (typeof DELIVERY_PROVIDERS)[number];
export const DEFAULT_DELIVERY_PROVIDER: DeliveryProviderId = "IN_HOUSE";
export const DELIVERY_PROVIDER_SETTING = "deliveryProvider.active";

/**
 * Whether Adloggs may take LIVE customer orders. The client and workers exist
 * (Phase 6) but live activation is not authorised: sandbox verification,
 * webhook authentication and business approvals are still pending. A code
 * constant on purpose, so no stored setting, env flag or API key can make
 * Adloggs selectable. (Internal id stays "ADDLOGS" for stored data.)
 */
export const ADDLOGS_INTEGRATION_AVAILABLE = false;

export const DELIVERY_UNAVAILABLE = "DELIVERY_UNAVAILABLE";
export const DELIVERY_UNAVAILABLE_MESSAGE =
  "Delivery is temporarily unavailable, so new orders cannot be placed right now. Please try again later.";

export type ProviderStatus = "AVAILABLE" | "DISABLED" | "NOT_CONFIGURED";

export interface ProviderReadiness {
  id: DeliveryProviderId;
  label: string;
  /** Integration exists and has what it needs to run. */
  configured: boolean;
  /** Switched on by an admin. */
  enabled: boolean;
  /** Configured and enabled: may take new orders. */
  operational: boolean;
  status: ProviderStatus;
  reason?: string;
}

export class DeliveryProviderError extends Error {
  readonly statusCode: number;
  readonly reason: string;
  constructor(message: string, statusCode: number, reason: string) {
    super(message);
    this.name = "DeliveryProviderError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

export function isDeliveryProviderError(error: unknown): error is DeliveryProviderError {
  return error instanceof DeliveryProviderError;
}

export function isDeliveryProviderId(value: unknown): value is DeliveryProviderId {
  return typeof value === "string" && (DELIVERY_PROVIDERS as readonly string[]).includes(value);
}

/** Active provider from a settings document; missing/unknown values mean IN_HOUSE. */
export function activeProviderFrom(settings: any): DeliveryProviderId {
  const value = settings?.deliveryProvider?.active;
  return isDeliveryProviderId(value) ? value : DEFAULT_DELIVERY_PROVIDER;
}

/** Provider of an order. Online orders placed before Phase 2 have no field and are in-house. */
export function orderDeliveryProvider(order: any): DeliveryProviderId {
  return isDeliveryProviderId(order?.deliveryProvider) ? order.deliveryProvider : DEFAULT_DELIVERY_PROVIDER;
}

/** Query fragment matching orders handled by the in-house fleet (including legacy orders). */
export const IN_HOUSE_ORDER_FILTER = { deliveryProvider: { $in: [null, "IN_HOUSE"] } };

export function providerReadinessFrom(settings: any): ProviderReadiness[] {
  const inHouseEnabled = settings?.inHouseDelivery?.enabled !== false;
  return [
    {
      id: "IN_HOUSE",
      label: "In-House Delivery",
      configured: true,
      enabled: inHouseEnabled,
      operational: inHouseEnabled,
      status: inHouseEnabled ? "AVAILABLE" : "DISABLED",
      reason: inHouseEnabled ? undefined : "In-house delivery is switched off.",
    },
    {
      id: "ADDLOGS",
      label: "Adloggs",
      configured: ADDLOGS_INTEGRATION_AVAILABLE,
      enabled: false,
      operational: false,
      status: "NOT_CONFIGURED",
      reason: "Adloggs is not activated for live orders yet (sandbox verification, webhook authentication and approvals pending).",
    },
  ];
}

async function readSettings(session?: ClientSession) {
  const query = AppSettings.findOne({}).select("deliveryProvider inHouseDelivery.enabled").lean();
  if (session) query.session(session);
  return query;
}

export interface DeliveryProviderState {
  activeProvider: DeliveryProviderId;
  providers: ProviderReadiness[];
  /** Whether new delivery-dependent orders can be accepted right now. */
  deliveryAvailable: boolean;
  reason?: string;
  updatedAt?: Date;
  updatedBy?: string;
}

export function providerStateFrom(settings: any): DeliveryProviderState {
  const activeProvider = activeProviderFrom(settings);
  const providers = providerReadinessFrom(settings);
  const active = providers.find(provider => provider.id === activeProvider)!;
  return {
    activeProvider,
    providers,
    deliveryAvailable: active.operational,
    reason: active.operational ? undefined : `${active.label} is the active provider but is not available. ${active.reason || ""}`.trim(),
    updatedAt: settings?.deliveryProvider?.updatedAt,
    updatedBy: settings?.deliveryProvider?.updatedBy ? String(settings.deliveryProvider.updatedBy) : undefined,
  };
}

export async function getDeliveryProviderState(session?: ClientSession): Promise<DeliveryProviderState> {
  return providerStateFrom(await readSettings(session));
}

/**
 * Checkout gate: returns the provider a new delivery order is committed to,
 * or throws when no usable provider is available. Fails closed when the
 * settings cannot be read.
 */
export async function resolveProviderForNewOrder(session?: ClientSession): Promise<DeliveryProviderId> {
  let state: DeliveryProviderState;
  try {
    state = await getDeliveryProviderState(session);
  } catch (error) {
    if (session && isTransactionRetryError(error)) throw error;
    console.error("Delivery provider state could not be read:", error);
    throw new DeliveryProviderError(DELIVERY_UNAVAILABLE_MESSAGE, 503, DELIVERY_UNAVAILABLE);
  }
  if (!state.deliveryAvailable) throw new DeliveryProviderError(DELIVERY_UNAVAILABLE_MESSAGE, 503, DELIVERY_UNAVAILABLE);
  return state.activeProvider;
}

/**
 * Change the global provider. The target must be operational at the moment of
 * the change, checked inside the same transaction that writes it. The write is
 * conditional on the value read and audited atomically, so concurrent
 * selections (or a concurrent in-house toggle, which writes the same document)
 * serialize. Selecting the current provider is a no-op.
 */
export async function setActiveDeliveryProvider(provider: unknown, adminId?: string): Promise<{ state: DeliveryProviderState; changed: boolean }> {
  if (!isDeliveryProviderId(provider)) {
    throw new DeliveryProviderError(`Unknown delivery provider. Valid providers: ${DELIVERY_PROVIDERS.join(", ")}.`, 400, "INVALID_PROVIDER");
  }
  await AppSettings.getSettings();
  const session = await mongoose.startSession();
  try {
    const changed = (await session.withTransaction(async () => {
      const current: any = await AppSettings.findOne({}).select("deliveryProvider inHouseDelivery.enabled").session(session).lean();
      if (!current) throw new DeliveryProviderError("Settings are not initialised.", 500, "SETTINGS_MISSING");
      const previous = activeProviderFrom(current);
      if (previous === provider) return false;
      const target = providerReadinessFrom(current).find(entry => entry.id === provider)!;
      if (!target.configured) {
        throw new DeliveryProviderError(`${target.label} cannot be selected: it is not configured. ${target.reason || ""}`.trim(), 409, "PROVIDER_NOT_CONFIGURED");
      }
      if (!target.enabled) {
        throw new DeliveryProviderError(`${target.label} cannot be selected while it is disabled. Enable it first.`, 409, "PROVIDER_DISABLED");
      }
      const updatedBy = adminId && mongoose.Types.ObjectId.isValid(adminId) ? new mongoose.Types.ObjectId(adminId) : undefined;
      const storedPrevious = current.deliveryProvider?.active;
      const result = await AppSettings.updateOne(
        { _id: current._id, "deliveryProvider.active": isDeliveryProviderId(storedPrevious) ? storedPrevious : { $nin: DELIVERY_PROVIDERS } },
        { $set: { "deliveryProvider.active": provider, "deliveryProvider.updatedAt": new Date(), "deliveryProvider.updatedBy": updatedBy } },
        { session },
      );
      if (!result.modifiedCount) {
        throw new DeliveryProviderError("The delivery provider was changed by someone else. Reload and try again.", 409, "CONCURRENT_UPDATE");
      }
      await SettingAuditLog.create([{ setting: DELIVERY_PROVIDER_SETTING, previousValue: previous, newValue: provider, changedBy: updatedBy }], { session });
      return true;
    })) as boolean;
    return { state: await getDeliveryProviderState(), changed };
  } finally {
    await session.endSession();
  }
}
