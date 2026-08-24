import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Tax from "../../../models/Tax";
import Product from "../../../models/Product";

/**
 * Get all taxes
 */
export const getTaxes = asyncHandler(async (req: Request, res: Response) => {
    const {
        page = 1,
        limit = 10,
        search = "",
        status,
        sortBy = "createdAt",
        sortOrder = "desc",
    } = req.query;

    const query: any = {};

    // Search filter
    if (search && typeof search === "string" && search.trim()) {
        const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.name = { $regex: escapedSearch, $options: "i" };
    }

    // Status filter
    if (status) {
        query.status = status;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const [taxes, total] = await Promise.all([
        Tax.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit as string)),
        Tax.countDocuments(query),
    ]);

    return res.status(200).json({
        success: true,
        message: "Taxes fetched successfully",
        data: taxes,
        pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string)),
        },
    });
});

/**
 * Get tax by ID
 */
export const getTaxById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const tax = await Tax.findById(id);

    if (!tax) {
        return res.status(404).json({
            success: false,
            message: "Tax not found",
        });
    }

    return res.status(200).json({
        success: true,
        message: "Tax fetched successfully",
        data: tax,
    });
});

/**
 * Create a new tax
 */
export const createTax = asyncHandler(async (req: Request, res: Response) => {
    const { name, percentage } = req.body;
    const trimmedName = (name || "").trim();

    if (!trimmedName || percentage === undefined) {
        return res.status(400).json({
            success: false,
            message: "Tax title and percentage are required",
        });
    }

    if (trimmedName.length < 2) {
        return res.status(400).json({
            success: false,
            message: "Tax title must be at least 2 characters",
        });
    }

    // Case-insensitive duplicate check
    const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingTax = await Tax.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    });
    if (existingTax) {
        return res.status(400).json({
            success: false,
            message: "A tax rate with this title already exists",
        });
    }

    const tax = await Tax.create({
        name: trimmedName,
        percentage,
    });

    return res.status(201).json({
        success: true,
        message: "Tax created successfully",
        data: tax,
    });
});

/**
 * Update tax
 */
export const updateTax = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, percentage, status } = req.body;

    const tax = await Tax.findById(id);

    if (!tax) {
        return res.status(404).json({
            success: false,
            message: "Tax not found",
        });
    }

    // Check if name is being changed and if it conflicts with another tax
    if (name) {
        const trimmedName = name.trim();
        if (trimmedName.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Tax title must be at least 2 characters",
            });
        }
        const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const existingTax = await Tax.findOne({
            _id: { $ne: id },
            name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        });
        if (existingTax) {
            return res.status(400).json({
                success: false,
                message: "A tax rate with this title already exists",
            });
        }
        tax.name = trimmedName;
    }

    if (percentage !== undefined) {
        tax.percentage = percentage;
    }

    if (status) {
        tax.status = status;
    }

    await tax.save();

    return res.status(200).json({
        success: true,
        message: "Tax updated successfully",
        data: tax,
    });
});

/**
 * Update tax status
 */
export const updateTaxStatus = asyncHandler(
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !["Active", "Inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Valid status is required (Active or Inactive)",
            });
        }

        const tax = await Tax.findById(id);

        if (!tax) {
            return res.status(404).json({
                success: false,
                message: "Tax not found",
            });
        }

        tax.status = status;
        await tax.save();

        return res.status(200).json({
            success: true,
            message: "Tax status updated successfully",
            data: tax,
        });
    }
);

/**
 * Delete tax
 */
export const deleteTax = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const tax = await Tax.findById(id);

    if (!tax) {
        return res.status(404).json({
            success: false,
            message: "Tax not found",
        });
    }

    // Referential integrity check: check if any products are using this tax rate
    const productCount = await Product.countDocuments({
        $or: [
            { tax: tax.name },
            { tax: id },
        ],
    });

    if (productCount > 0) {
        return res.status(400).json({
            success: false,
            message: `Cannot delete tax "${tax.name}" because it is currently assigned to ${productCount} active product(s)`,
        });
    }

    await Tax.findByIdAndDelete(id);

    return res.status(200).json({
        success: true,
        message: "Tax deleted successfully",
    });
});
