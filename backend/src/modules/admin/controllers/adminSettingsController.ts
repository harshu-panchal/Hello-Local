import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import AppSettings from "../../../models/AppSettings";
import PaymentMethod from "../../../models/PaymentMethod";
import Seller from "../../../models/Seller";

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

/**
 * Update app settings
 */
export const updateAppSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const updateData = req.body;
    updateData.updatedBy = req.user?.userId;

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
