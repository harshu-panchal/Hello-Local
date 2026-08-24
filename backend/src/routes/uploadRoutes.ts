import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, requireUserType } from "../middleware/auth";
import {
  uploadSingleImage,
  uploadMultipleImages,
  uploadDocument,
  uploadMultipleDocuments,
  handleUploadError,
  assertRealFileType,
} from "../middleware/upload";
import {
  uploadImageFromBuffer,
  uploadDocumentFromBuffer,
  deleteImage,
} from "../services/cloudinaryService";
import { CLOUDINARY_FOLDERS } from "../config/cloudinary";
import { asyncHandler } from "../utils/asyncHandler";
import Product from "../models/Product";
import Seller from "../models/Seller";

const router = Router();

/**
 * Folder allow-list.
 *
 * The folder used to be taken straight from the request body, letting a caller
 * write anywhere in the Cloudinary namespace. (#M-15)
 */
const ALLOWED_FOLDERS = new Set<string>(Object.values(CLOUDINARY_FOLDERS));

function resolveFolder(requested: unknown, fallback: string): string {
  const f = typeof requested === "string" ? requested.trim() : "";
  return ALLOWED_FOLDERS.has(f) ? f : fallback;
}

/**
 * Onboarding uploads are open by necessity (a seller has no token until they
 * register), so they are tightly rate limited instead. They used to be entirely
 * unauthenticated AND unlimited — anyone could push 5 x 10MB per request into
 * the account, indefinitely. (#H-11)
 */
const onboardingUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    success: false,
    message: "Too many uploads from this address. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === "OPTIONS",
});

// ─── Authenticated image uploads (Admin / Seller) ────────────────────────────
router.post(
  "/image",
  authenticate,
  requireUserType("Admin", "Seller"),
  uploadSingleImage.single("image"),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    const typeError = assertRealFileType(file.buffer, ["image"]);
    if (typeError) {
      return res.status(400).json({ success: false, message: typeError });
    }

    const folder = resolveFolder(req.body.folder, CLOUDINARY_FOLDERS.PRODUCTS);
    const result = await uploadImageFromBuffer(file.buffer, {
      folder,
      resourceType: "image",
    });

    return res.status(200).json({ success: true, data: result });
  }),
);

router.post(
  "/images",
  authenticate,
  requireUserType("Admin", "Seller"),
  uploadMultipleImages.array("images", 10),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    const files = (req as any).files as any[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "No image files provided" });
    }

    for (const f of files) {
      const typeError = assertRealFileType(f.buffer, ["image"]);
      if (typeError) {
        return res.status(400).json({ success: false, message: typeError });
      }
    }

    const folder = resolveFolder(req.body.folder, CLOUDINARY_FOLDERS.PRODUCTS);
    const results = await Promise.all(
      files.map((file) =>
        uploadImageFromBuffer(file.buffer, { folder, resourceType: "image" }),
      ),
    );

    return res.status(200).json({ success: true, data: results });
  }),
);

// ─── Onboarding document uploads (public, rate limited) ──────────────────────
router.post(
  "/document",
  onboardingUploadLimiter,
  uploadDocument.single("document"),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: "No document file provided" });
    }

    // The declared MIME type comes from the client and is not evidence of
    // anything; the bytes are checked instead. (#H-11)
    const typeError = assertRealFileType(file.buffer, ["image", "pdf"]);
    if (typeError) {
      return res.status(400).json({ success: false, message: typeError });
    }

    const userType = (req as any).user?.userType;
    const folder =
      userType === "Delivery"
        ? CLOUDINARY_FOLDERS.DELIVERY_DOCUMENTS
        : userType === "Seller"
          ? CLOUDINARY_FOLDERS.SELLER_DOCUMENTS
          : CLOUDINARY_FOLDERS.ONBOARDING_DOCUMENTS;

    const isImage = file.mimetype.startsWith("image/");

    try {
      const result = await uploadDocumentFromBuffer(file.buffer, {
        folder,
        resourceType: isImage ? "image" : "raw",
      });
      return res.status(200).json({ success: true, data: result });
    } catch (uploadErr: any) {
      console.error("Document upload failed:", uploadErr?.message || uploadErr);
      return res.status(500).json({ success: false, message: "Document upload failed" });
    }
  }),
);

router.post(
  "/documents",
  onboardingUploadLimiter,
  uploadMultipleDocuments.array("documents", 5),
  handleUploadError,
  asyncHandler(async (req: Request, res: Response) => {
    const files = (req as any).files as any[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "No document files provided" });
    }

    for (const f of files) {
      const typeError = assertRealFileType(f.buffer, ["image", "pdf"]);
      if (typeError) {
        return res.status(400).json({ success: false, message: typeError });
      }
    }

    const userType = (req as any).user?.userType;
    const folder =
      userType === "Delivery"
        ? CLOUDINARY_FOLDERS.DELIVERY_DOCUMENTS
        : userType === "Seller"
          ? CLOUDINARY_FOLDERS.SELLER_DOCUMENTS
          : CLOUDINARY_FOLDERS.ONBOARDING_DOCUMENTS;

    const results = await Promise.all(
      files.map((file) =>
        uploadDocumentFromBuffer(file.buffer, {
          folder,
          resourceType: file.mimetype.startsWith("image/") ? "image" : "raw",
        }),
      ),
    );

    return res.status(200).json({ success: true, data: results });
  }),
);

/**
 * Delete an asset.
 *
 * A seller could previously delete ANY public id — another seller's product
 * photos, an admin banner, anything. Deletion is now Admin-only, or a seller
 * acting on an image that is actually referenced by one of their own products.
 * (#H-12)
 *
 * The path is a wildcard because Cloudinary public ids contain slashes, which a
 * single `:publicId` segment could never match.
 */
router.delete(
  "/*",
  authenticate,
  requireUserType("Admin", "Seller"),
  asyncHandler(async (req: Request, res: Response) => {
    const publicId = decodeURIComponent(String((req.params as any)[0] || "")).replace(/^\/+/, "");

    if (!publicId) {
      return res.status(400).json({ success: false, message: "Public ID is required" });
    }

    if (req.user!.userType === "Seller") {
      const sellerId = req.user!.userId;

      // The asset must belong to something this seller owns.
      const ownsViaProduct = await Product.exists({
        seller: sellerId,
        $or: [
          { mainImage: { $regex: publicId, $options: "i" } },
          { galleryImages: { $regex: publicId, $options: "i" } },
        ],
      });

      const ownsViaProfile = await Seller.exists({
        _id: sellerId,
        $or: [
          { logo: { $regex: publicId, $options: "i" } },
          { storeBanner: { $regex: publicId, $options: "i" } },
          { profile: { $regex: publicId, $options: "i" } },
          { idProof: { $regex: publicId, $options: "i" } },
          { addressProof: { $regex: publicId, $options: "i" } },
        ],
      });

      if (!ownsViaProduct && !ownsViaProfile) {
        return res.status(403).json({
          success: false,
          message: "You can only delete images attached to your own listings.",
        });
      }
    }

    await deleteImage(publicId);

    return res.status(200).json({ success: true, message: "Image deleted successfully" });
  }),
);

export default router;
