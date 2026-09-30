import { Request, Response } from "express";
import Supplier from "../../../models/Supplier";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get all suppliers for the authenticated seller with search and category filtering
 */
export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { search, category, status } = req.query;

  const query: any = { seller: sellerId };

  if (status && status !== "ALL") {
    query.status = status;
  }

  if (category && category !== "All Categories") {
    query.category = category;
  }

  if (search && typeof search === "string" && search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");
    query.$or = [
      { name: searchRegex },
      { companyName: searchRegex },
      { phone: searchRegex },
      { category: searchRegex },
    ];
  }

  const suppliers = await Supplier.find(query).sort({ updatedAt: -1 });

  // Get distinct categories for filter pills
  const categories = await Supplier.find({ seller: sellerId }).distinct("category");

  return res.status(200).json({
    success: true,
    data: suppliers,
    categories: categories.filter(Boolean),
    total: suppliers.length,
  });
});

/**
 * Create a new supplier
 */
export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { name, companyName, phone, email, category, address, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Supplier name is required",
    });
  }

  if (!phone || !phone.trim()) {
    return res.status(400).json({
      success: false,
      message: "Supplier phone number is required",
    });
  }

  const supplier = await Supplier.create({
    seller: sellerId,
    name: name.trim(),
    companyName: companyName ? companyName.trim() : "",
    phone: phone.trim(),
    email: email ? email.trim() : "",
    category: category ? category.trim() : "General",
    address: address ? address.trim() : "",
    notes: notes ? notes.trim() : "",
    status: "ACTIVE",
  });

  return res.status(201).json({
    success: true,
    message: "Supplier created successfully",
    data: supplier,
  });
});

/**
 * Update an existing supplier
 */
export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  const { name, companyName, phone, email, category, address, notes, status } = req.body;

  const supplier = await Supplier.findOne({ _id: id, seller: sellerId });

  if (!supplier) {
    return res.status(404).json({
      success: false,
      message: "Supplier not found",
    });
  }

  if (name !== undefined) supplier.name = name.trim();
  if (companyName !== undefined) supplier.companyName = companyName.trim();
  if (phone !== undefined) supplier.phone = phone.trim();
  if (email !== undefined) supplier.email = email.trim();
  if (category !== undefined) supplier.category = category.trim();
  if (address !== undefined) supplier.address = address.trim();
  if (notes !== undefined) supplier.notes = notes.trim();
  if (status !== undefined) supplier.status = status;

  await supplier.save();

  return res.status(200).json({
    success: true,
    message: "Supplier updated successfully",
    data: supplier,
  });
});

/**
 * Delete a supplier
 */
export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;

  const supplier = await Supplier.findOneAndDelete({ _id: id, seller: sellerId });

  if (!supplier) {
    return res.status(404).json({
      success: false,
      message: "Supplier not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Supplier deleted successfully",
  });
});
