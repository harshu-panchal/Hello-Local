import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import AppSettings from "../../../models/AppSettings";
import PaymentMethod from "../../../models/PaymentMethod";
import Seller from "../../../models/Seller";
import {
  getInHouseDeliveryStatus,
  setInHouseDeliveryEnabled,
  isInHouseDeliveryError,
  IN_HOUSE_DELIVERY_DISABLED,
  IN_HOUSE_DELIVERY_DISABLED_MESSAGE,
  IN_HOUSE_DELIVERY_STATE_EVENT,
} from "../../../services/inHouseDeliveryService";
import { withdrawPendingCourierOffers } from "../../../services/orderNotificationService";
import {
  getDeliveryProviderState,
  setActiveDeliveryProvider,
  isDeliveryProviderError,
} from "../../../services/deliveryProviderService";
import {
  runInHouseDeliveryRecovery,
  requestInHouseDeliveryRecovery,
  type RecoveryResult,
} from "../../../services/inHouseDeliveryRecoveryService";

function recoverySummary(recovery: RecoveryResult | undefined): string {
  if (!recovery) return "";
  if (recovery.status === "skipped") return " Waiting-order recovery is already running or queued.";
  if (recovery.status === "aborted") return " Waiting-order recovery stopped because in-house delivery was switched off.";
  if (recovery.status === "failed") return " Waiting-order recovery failed and will be retried automatically.";
  const parts = [`${recovery.offered} waiting order${recovery.offered === 1 ? "" : "s"} re-offered to delivery partners`];
  if (recovery.noCouriers) parts.push(`${recovery.noCouriers} had no available courier`);
  if (recovery.failed) parts.push(`${recovery.failed} failed`);
  if (recovery.stale) parts.push(`${recovery.stale} older than 4h need manual action`);
  return ` ${parts.join("; ")}.`;
}

/**
 * Get app settings
 */
export const getAppSettings = asyncHandler(
  async (_req: Request, res: Response) => {
    let settings = await AppSettings.findOne();

    // Create default settings if none exist
    if (!settings) {
      settings = await AppSettings.create({
        appName: "Hello Local",
        contactEmail: "support@hellolocal.com",
        contactPhone: "1234567890",
      });
    }

    return res.status(200).json({
      success: true,
      message: "App settings fetched successfully",
      data: settings,
    });
  }
);

// Keys owned by dedicated, validated endpoints; never writable via PUT /admin/settings.
const PROTECTED_SETTING_ROOTS = ["inHouseDelivery", "deliveryProvider", "adloggsDiagnostics"];
const isInHouseDeliveryKey = (key: string) => PROTECTED_SETTING_ROOTS.some(root => key === root || key.startsWith(`${root}.`));

/** Remove protected delivery settings (in-house switch, provider selection) from a generic update, including operator forms like `$set`. */
export function stripInHouseDeliveryKeys(update: any): void {
  if (!update || typeof update !== "object") return;
  for (const key of Object.keys(update)) {
    if (isInHouseDeliveryKey(key)) delete update[key];
    else if (key.startsWith("$") && update[key] && typeof update[key] === "object") {
      for (const inner of Object.keys(update[key])) if (isInHouseDeliveryKey(inner)) delete update[key][inner];
    }
  }
}

/**
 * GET /admin/settings/in-house-delivery
 */
export const getInHouseDeliverySettings = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getInHouseDeliveryStatus();
  return res.status(200).json({ success: true, message: "In-house delivery settings fetched successfully", data });
});

/**
 * PUT /admin/settings/in-house-delivery   body: { enabled: boolean }
 *
 * Switching off stops NEW in-house assignments only (drain mode): deliveries
 * that already have a courier carry on to completion.
 */
export const updateInHouseDeliverySettings = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : null;
  if (!keys || keys.length !== 1 || keys[0] !== "enabled" || typeof body.enabled !== "boolean") {
    return res.status(400).json({ success: false, message: "Request body must be exactly { \"enabled\": true | false }." });
  }
  try {
    const result = await setInHouseDeliveryEnabled(body.enabled, req.user?.userId);
    const io = req.app.get("io");
    let recovery: RecoveryResult | undefined;
    if (result.changed && io) {
      if (!result.enabled) withdrawPendingCourierOffers(io);
      const payload = {
        inHouseDeliveryEnabled: result.enabled,
        reason: result.enabled ? undefined : IN_HOUSE_DELIVERY_DISABLED,
        message: result.enabled ? undefined : IN_HOUSE_DELIVERY_DISABLED_MESSAGE,
      };
      io.to("delivery-notifications").emit(IN_HOUSE_DELIVERY_STATE_EVENT, payload);
      io.to("admin-notifications").emit(IN_HOUSE_DELIVERY_STATE_EVENT, payload);
    }
    // Re-offer orders that became ready while delivery was OFF. Only the request
    // that actually turned it ON runs this; repeats are no-ops (changed=false).
    if (result.changed && result.enabled) {
      try {
        recovery = await runInHouseDeliveryRecovery(io, { trigger: "admin-enable" });
      } catch (error) {
        console.error("Waiting-order recovery could not start; the worker will retry:", error);
      }
    }
    const data = await getInHouseDeliveryStatus();
    return res.status(200).json({
      success: true,
      message: !result.changed
        ? `In-house delivery is already ${result.enabled ? "enabled" : "disabled"}.`
        : result.enabled
          ? `In-house delivery enabled. New assignments can be made again.${recoverySummary(recovery)}`
          : "In-house delivery disabled. New assignments have stopped; already assigned deliveries can continue until completion.",
      data: { ...data, changed: result.changed, recovery },
    });
  } catch (error) {
    if (isInHouseDeliveryError(error)) {
      return res.status(error.statusCode).json({ success: false, message: error.message, reason: error.reason });
    }
    throw error;
  }
});

/**
 * POST /admin/settings/in-house-delivery/recover
 * Re-run the waiting-order recovery (e.g. after failures). Refused while OFF.
 */
export const retryInHouseDeliveryRecovery = asyncHandler(async (req: Request, res: Response) => {
  const requested = await requestInHouseDeliveryRecovery();
  if (!requested) {
    return res.status(409).json({ success: false, message: IN_HOUSE_DELIVERY_DISABLED_MESSAGE, reason: IN_HOUSE_DELIVERY_DISABLED });
  }
  const recovery = await runInHouseDeliveryRecovery(req.app.get("io"), { trigger: "admin-retry" });
  const data = await getInHouseDeliveryStatus();
  return res.status(200).json({
    success: true,
    message: `Waiting-order recovery ${recovery.status}.${recoverySummary(recovery)}`,
    data: { ...data, recovery },
  });
});

/**
 * GET /admin/settings/delivery-provider
 * Active global provider plus each provider's readiness.
 */
export const getDeliveryProviderSettings = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getDeliveryProviderState();
  return res.status(200).json({ success: true, message: "Delivery provider settings fetched successfully", data });
});

/**
 * PUT /admin/settings/delivery-provider   body: { provider: "IN_HOUSE" | "ADDLOGS" }
 * Only an operational provider can be selected. Existing orders keep the
 * provider they were placed with.
 */
export const updateDeliveryProviderSettings = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : null;
  if (!keys || keys.length !== 1 || keys[0] !== "provider" || typeof body.provider !== "string") {
    return res.status(400).json({ success: false, message: "Request body must be exactly { \"provider\": \"IN_HOUSE\" | \"ADDLOGS\" }." });
  }
  try {
    const { state, changed } = await setActiveDeliveryProvider(body.provider, req.user?.userId);
    if (changed) req.app.get("io")?.to("admin-notifications").emit("delivery-provider-state", state);
    const active = state.providers.find(provider => provider.id === state.activeProvider);
    return res.status(200).json({
      success: true,
      message: changed
        ? `${active?.label} is now the active delivery provider for new orders. Existing orders keep their current provider.`
        : `${active?.label} is already the active delivery provider.`,
      data: { ...state, changed },
    });
  } catch (error) {
    if (isDeliveryProviderError(error)) {
      return res.status(error.statusCode).json({ success: false, message: error.message, reason: error.reason });
    }
    throw error;
  }
});

/**
 * Update app settings
 */
export const updateAppSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const updateData = req.body;
    updateData.updatedBy = req.user?.userId;
    // The in-house delivery switch is audited and changed only through
    // PUT /admin/settings/in-house-delivery. Settings screens send the whole
    // document back, so a stale copy here must not flip the fleet on or off.
    stripInHouseDeliveryKeys(updateData);

    console.log(`[DEBUG Settings] Incoming update payload:`, JSON.stringify(updateData.deliveryConfig, null, 2));

    let settings = await AppSettings.findOne();

    if (!settings) {
      settings = await AppSettings.create(updateData);
    } else {
      settings = await AppSettings.findOneAndUpdate({}, updateData, {
        new: true,
        runValidators: true,
      });
    }

    console.log(`[DEBUG Settings] Updated settings:`, JSON.stringify(settings?.deliveryConfig, null, 2));

    return res.status(200).json({
      success: true,
      message: "App settings updated successfully",
      data: settings,
    });
  }
);

/**
 * Get payment methods
 */
export const getPaymentMethods = asyncHandler(
  async (_req: Request, res: Response) => {
    const paymentMethods = await PaymentMethod.find().sort({ order: 1 });

    return res.status(200).json({
      success: true,
      message: "Payment methods fetched successfully",
      data: paymentMethods,
    });
  }
);

/**
 * Update payment methods
 */
export const updatePaymentMethods = asyncHandler(
  async (req: Request, res: Response) => {
    const { paymentMethods } = req.body; // Array of payment method objects

    if (!Array.isArray(paymentMethods)) {
      return res.status(400).json({
        success: false,
        message: "Payment methods array is required",
      });
    }

    // Update or create each payment method
    const updatePromises = paymentMethods.map((pm: any) =>
      PaymentMethod.findOneAndUpdate({ name: pm.name }, pm, {
        upsert: true,
        new: true,
        runValidators: true,
      })
    );

    await Promise.all(updatePromises);

    const updatedMethods = await PaymentMethod.find().sort({ order: 1 });

    return res.status(200).json({
      success: true,
      message: "Payment methods updated successfully",
      data: updatedMethods,
    });
  }
);

/**
 * Get SMS gateway settings
 */
export const getSMSGatewaySettings = asyncHandler(
  async (_req: Request, res: Response) => {
    const settings = await AppSettings.findOne().select("smsGateway");

    return res.status(200).json({
      success: true,
      message: "SMS gateway settings fetched successfully",
      data: settings?.smsGateway || null,
    });
  }
);

/**
 * Update SMS gateway settings
 */
export const updateSMSGatewaySettings = asyncHandler(
  async (req: Request, res: Response) => {
    const { smsGateway } = req.body;

    let settings = await AppSettings.findOne();

    if (!settings) {
      settings = await AppSettings.create({
        appName: "Hello Local",
        contactEmail: "support@hellolocal.com",
        contactPhone: "1234567890",
        smsGateway,
      });
    } else {
      settings.smsGateway = smsGateway;
      settings.updatedBy = req.user?.userId as any;
      await settings.save();
    }

    return res.status(200).json({
      success: true,
      message: "SMS gateway settings updated successfully",
      data: settings.smsGateway,
    });
  }
);

/**
 * Get default Admin Store settings
 */
export const getAdminStoreSettings = asyncHandler(
  async (_req: Request, res: Response) => {
    let adminSeller = await Seller.findOne({
      $or: [
        { email: "admin-store@hellolocal.com" },
        { mobile: "9999999999" },
        { category: "Admin" },
      ],
    });

    if (!adminSeller) {
      adminSeller = await Seller.create({
        sellerName: "Hello Local Admin",
        storeName: "Hello Local Admin Store",
        email: "admin-store@hellolocal.com",
        mobile: "9999999999",
        password: "AdminStore@123",
        address: "Admin Store Headquarters",
        city: "Navi Mumbai",
        serviceableArea: "Navi Mumbai, Mumbai",
        searchLocation: "Navi Mumbai",
        category: "Admin",
        commission: 0,
        status: "Approved",
        requireProductApproval: false,
        location: {
          type: "Point",
          coordinates: [72.8777, 19.076],
        },
        serviceRadiusKm: 10,
      });
    }

    const lat =
      adminSeller.location?.coordinates?.[1] ??
      (adminSeller.latitude ? parseFloat(adminSeller.latitude) : 19.076);
    const lng =
      adminSeller.location?.coordinates?.[0] ??
      (adminSeller.longitude ? parseFloat(adminSeller.longitude) : 72.8777);

    return res.status(200).json({
      success: true,
      message: "Admin store settings fetched successfully",
      data: {
        _id: adminSeller._id,
        sellerName: adminSeller.sellerName || "Hello Local Admin",
        storeName: adminSeller.storeName || "Hello Local Admin Store",
        email: adminSeller.email || "admin-store@hellolocal.com",
        mobile: adminSeller.mobile || "9999999999",
        address: adminSeller.address || "",
        city: adminSeller.city || "",
        serviceableArea: adminSeller.serviceableArea || "",
        searchLocation: adminSeller.searchLocation || "",
        latitude: lat,
        longitude: lng,
        serviceRadiusKm: adminSeller.serviceRadiusKm ?? 10,
        status: adminSeller.status,
      },
    });
  }
);

/**
 * Update default Admin Store settings
 */
export const updateAdminStoreSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      sellerName,
      storeName,
      email,
      mobile,
      address,
      city,
      serviceableArea,
      searchLocation,
      latitude,
      longitude,
      serviceRadiusKm,
    } = req.body;

    let adminSeller = await Seller.findOne({
      $or: [
        { email: "admin-store@hellolocal.com" },
        { mobile: "9999999999" },
        { category: "Admin" },
      ],
    });

    const updateData: any = {};
    if (sellerName !== undefined) updateData.sellerName = String(sellerName).trim();
    if (storeName !== undefined) updateData.storeName = String(storeName).trim();
    if (email !== undefined) updateData.email = String(email).trim().toLowerCase();
    if (mobile !== undefined) updateData.mobile = String(mobile).trim();
    if (address !== undefined) updateData.address = String(address).trim();
    if (city !== undefined) updateData.city = String(city).trim();
    if (serviceableArea !== undefined) updateData.serviceableArea = String(serviceableArea).trim();
    if (searchLocation !== undefined) updateData.searchLocation = String(searchLocation).trim();
    if (serviceRadiusKm !== undefined) updateData.serviceRadiusKm = Math.max(0.1, Number(serviceRadiusKm) || 10);

    // Update coordinates if provided
    if (
      latitude !== undefined &&
      longitude !== undefined &&
      !isNaN(Number(latitude)) &&
      !isNaN(Number(longitude))
    ) {
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      updateData.latitude = String(latNum);
      updateData.longitude = String(lngNum);
      updateData.location = {
        type: "Point",
        coordinates: [lngNum, latNum], // GeoJSON order: [longitude, latitude]
      };
    }

    if (!adminSeller) {
      adminSeller = await Seller.create({
        sellerName: updateData.sellerName || "Hello Local Admin",
        storeName: updateData.storeName || "Hello Local Admin Store",
        email: updateData.email || "admin-store@hellolocal.com",
        mobile: updateData.mobile || "9999999999",
        password: "AdminStore@123",
        address: updateData.address || "Admin Store Headquarters",
        city: updateData.city || "Navi Mumbai",
        serviceableArea: updateData.serviceableArea || "Navi Mumbai, Mumbai",
        searchLocation: updateData.searchLocation || "Navi Mumbai",
        category: "Admin",
        commission: 0,
        status: "Approved",
        requireProductApproval: false,
        location: updateData.location || {
          type: "Point",
          coordinates: [72.8777, 19.076],
        },
        serviceRadiusKm: updateData.serviceRadiusKm ?? 10,
      });
    } else {
      adminSeller = await Seller.findByIdAndUpdate(adminSeller._id, updateData, {
        new: true,
        runValidators: true,
      });
    }

    const lat =
      adminSeller?.location?.coordinates?.[1] ??
      (adminSeller?.latitude ? parseFloat(adminSeller.latitude) : 19.076);
    const lng =
      adminSeller?.location?.coordinates?.[0] ??
      (adminSeller?.longitude ? parseFloat(adminSeller.longitude) : 72.8777);

    return res.status(200).json({
      success: true,
      message: "Admin store settings updated successfully",
      data: {
        _id: adminSeller?._id,
        sellerName: adminSeller?.sellerName,
        storeName: adminSeller?.storeName,
        email: adminSeller?.email,
        mobile: adminSeller?.mobile,
        address: adminSeller?.address,
        city: adminSeller?.city,
        serviceableArea: adminSeller?.serviceableArea,
        searchLocation: adminSeller?.searchLocation,
        latitude: lat,
        longitude: lng,
        serviceRadiusKm: adminSeller?.serviceRadiusKm,
        status: adminSeller?.status,
      },
    });
  }
);
