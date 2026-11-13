import { Router } from "express";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  updateStock,
  updateProductStatus,
  bulkUpdateStock,
  getShops,
} from "../modules/seller/controllers/productController";
import { getBrands } from "../modules/admin/controllers/adminProductController";
import { authenticate, requireUserType } from "../middleware/auth";

import {
  downloadSampleTemplate,
  bulkUploadProducts,
} from "../modules/seller/controllers/sellerBulkProductController";
import {
  getMasterCatalogue,
  exportMasterCatalogueCsv,
  quickAddMasterProductToStore,
} from "../modules/seller/controllers/sellerMasterCatalogController";
import { uploadCsvFile } from "../middleware/upload";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all brands - sellers and admins need this for product creation
router.get("/brands", requireUserType("Seller", "Admin"), getBrands);

// Get all active shops - sellers and admins need this for shop-by-store-only products
router.get("/shops", requireUserType("Seller", "Admin"), getShops);

// Remaining routes require seller user type
router.use(requireUserType("Seller"));

// Download sample CSV template for bulk product upload (supports ?category=...)
router.get("/bulk-template", downloadSampleTemplate);

// Master Catalogue: browse, export CSV, and quick-add to seller store
router.get("/master-catalogue", getMasterCatalogue);
router.get("/master-catalogue/export", exportMasterCatalogueCsv);
router.post("/master-catalogue/add-to-store", quickAddMasterProductToStore);

// Bulk upload products from CSV file
router.post("/bulk-upload", uploadCsvFile.single("file"), bulkUploadProducts);

// Create product
router.post("/", createProduct);

// Get seller's products with filters
router.get("/", getProducts);

// Get product by ID
router.get("/:id", getProductById);

// Update product
router.put("/:id", updateProduct);

// Delete product
router.delete("/:id", deleteProduct);

// Update stock for a product variation
router.patch("/:id/variations/:variationId/stock", updateStock);

// Bulk update stock
router.patch("/bulk-stock-update", bulkUpdateStock);

// Update product status (publish, popular, dealOfDay)
router.patch("/:id/status", updateProductStatus);

export default router;
