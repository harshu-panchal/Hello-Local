import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import CashCollection from "../../../models/CashCollection";
import Delivery from "../../../models/Delivery";
import Order from "../../../models/Order";

/**
 * Get all cash collections
 */
export const getCashCollections = asyncHandler(
    async (req: Request, res: Response) => {
        const {
            page = 1,
            limit = 10,
            deliveryBoyId,
            fromDate,
            toDate,
            search = "",
            sortBy = "collectedAt",
            sortOrder = "desc",
        } = req.query;

        const query: any = {};

        // Filter by delivery boy
        if (deliveryBoyId && deliveryBoyId !== "all") {
            query.deliveryBoy = deliveryBoyId;
        }

        // Date range filter
        if (fromDate || toDate) {
            query.collectedAt = {};
            if (fromDate) {
                const fDate = new Date(fromDate as string);
                fDate.setHours(0, 0, 0, 0);
                query.collectedAt.$gte = fDate;
            }
            if (toDate) {
                const tDate = new Date(toDate as string);
                tDate.setHours(23, 59, 59, 999);
                query.collectedAt.$lte = tDate;
            }
        }

        // Search query
        if (search && typeof search === "string" && search.trim() !== "") {
            const searchStr = search.trim();
            const [matchingBoys, matchingOrders] = await Promise.all([
                Delivery.find({
                    $or: [
                        { name: { $regex: searchStr, $options: "i" } },
                        { mobile: { $regex: searchStr, $options: "i" } },
                    ],
                }).select("_id"),
                Order.find({
                    orderNumber: { $regex: searchStr, $options: "i" },
                }).select("_id"),
            ]);

            const boyIds = matchingBoys.map((b) => b._id);
            const orderIds = matchingOrders.map((o) => o._id);

            query.$or = [
                { deliveryBoy: { $in: boyIds } },
                { order: { $in: orderIds } },
                { remark: { $regex: searchStr, $options: "i" } },
            ];
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const sort: any = {};
        sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

        const [collections, total] = await Promise.all([
            CashCollection.find(query)
                .populate("deliveryBoy", "name mobile")
                .populate("order", "orderNumber total")
                .populate("collectedBy", "name")
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit as string)),
            CashCollection.countDocuments(query),
        ]);

        // Transform data to match frontend expectations
        const transformedCollections = collections.map((collection: any) => ({
            _id: collection._id,
            deliveryBoyId: collection.deliveryBoy?._id,
            deliveryBoyName: collection.deliveryBoy?.name || "Unknown",
            orderId: collection.order?._id,
            orderNumber:
                collection.order?.orderNumber ||
                (collection.order?._id ? String(collection.order._id).slice(-6) : "-"),
            total: collection.order?.total || 0,
            amount: collection.amount,
            remark: collection.remark,
            collectedAt: collection.collectedAt,
            collectedBy: collection.collectedBy?.name || "Unknown",
        }));

        return res.status(200).json({
            success: true,
            message: "Cash collections fetched successfully",
            data: transformedCollections,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                pages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    }
);

/**
 * Get cash collection by ID
 */
export const getCashCollectionById = asyncHandler(
    async (req: Request, res: Response) => {
        const { id } = req.params;

        const collection = await CashCollection.findById(id)
            .populate("deliveryBoy", "name mobile")
            .populate("order", "orderNumber total")
            .populate("collectedBy", "name");

        if (!collection) {
            return res.status(404).json({
                success: false,
                message: "Cash collection not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Cash collection fetched successfully",
            data: collection,
        });
    }
);

/**
 * Create cash collection
 */
export const createCashCollection = asyncHandler(
    async (req: Request, res: Response) => {
        const { deliveryBoyId, amount, remark } = req.body;

        const requested = Math.round(Number(amount) * 100) / 100;
        if (!deliveryBoyId || !Number.isFinite(requested) || requested <= 0) {
            return res.status(400).json({
                success: false,
                message: "A valid delivery partner ID and positive amount are required",
            });
        }

        try {
            const { settleCourierCodDebt } = await import("../../../services/codSettlementService");
            const settlement = await settleCourierCodDebt({
                deliveryBoyId,
                amount: requested,
                source: "CASH",
                reference: `ADMIN-COLL-${deliveryBoyId}-${Date.now()}`,
                remark: remark,
                adminId: req.user?.userId,
            });

            const populatedCollection = await CashCollection.findOne({
                deliveryBoy: deliveryBoyId,
            })
                .sort({ createdAt: -1 })
                .populate("deliveryBoy", "name mobile")
                .populate("order", "orderNumber total")
                .populate("collectedBy", "name");

            return res.status(201).json({
                success: true,
                message: "Cash collection created and settled successfully",
                data: populatedCollection || settlement,
            });
        } catch (err: any) {
            return res.status(err.statusCode || 400).json({
                success: false,
                message: err.message || "Failed to process cash collection",
            });
        }
    }
);

/**
 * Update cash collection
 */
export const updateCashCollection = asyncHandler(
    async (_req: Request, res: Response) => {
        return res.status(400).json({
            success: false,
            message: "Settled cash collections are immutable financial audit records. To adjust courier debt, perform a new cash collection entry.",
        });
    }
);

/**
 * Delete cash collection
 */
export const deleteCashCollection = asyncHandler(
    async (_req: Request, res: Response) => {
        return res.status(400).json({
            success: false,
            message: "Settled cash collections cannot be deleted. All cash collections are permanent ledger records.",
        });
    }
);

