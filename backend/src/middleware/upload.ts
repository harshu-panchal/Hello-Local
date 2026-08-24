import multer from "multer";
import { Request } from "express";

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed file types
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

// Memory storage for multer (files will be stored in memory as buffers)
const storage = multer.memoryStorage();

// File filter for images
const imageFileFilter = (
  _req: Request,
  file: any,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`
      )
    );
  }
};

// File filter for documents (images + PDF)
const documentFileFilter = (
  _req: Request,
  file: any,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${ALLOWED_DOCUMENT_TYPES.join(", ")}`
      )
    );
  }
};

// Multer instance for single image upload
export const uploadSingleImage = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
  },
  fileFilter: imageFileFilter,
});

// Multer instance for multiple image uploads
export const uploadMultipleImages = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
  },
  fileFilter: imageFileFilter,
});

// Multer instance for document upload (image or PDF)
export const uploadDocument = multer({
  storage,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
  },
  fileFilter: documentFileFilter,
});

// Multer instance for multiple documents
export const uploadMultipleDocuments = multer({
  storage,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
  },
  fileFilter: documentFileFilter,
});

// Error handler middleware for multer errors
export const handleUploadError = (
  err: any,
  _req: Request,
  res: any,
  _next: any
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size exceeds the maximum allowed limit",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files uploaded",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field",
      });
    }
  }

  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  _next(err);
};

/**
 * Verify a file by its actual bytes, not by the Content-Type the client sent.
 *
 * Multer reports the MIME type the *uploader* declared, so the type filters
 * above are trivially bypassed by labelling any payload `image/png`. This reads
 * the magic number instead. (#H-11)
 *
 * @returns an error message, or null when the file is one of `allowed`.
 */
export function assertRealFileType(
  buffer: Buffer,
  allowed: Array<"image" | "pdf">
): string | null {
  if (!buffer || buffer.length < 12) return "File is empty or truncated";

  const hex = (n: number) => buffer.subarray(0, n).toString("hex").toUpperCase();
  const ascii = (from: number, to: number) => buffer.subarray(from, to).toString("ascii");

  const isJpeg = hex(3) === "FFD8FF";
  const isPng = hex(8) === "89504E470D0A1A0A";
  const isGif = ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
  const isWebp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  const isPdf = ascii(0, 5) === "%PDF-";

  const isImage = isJpeg || isPng || isGif || isWebp;

  if (allowed.includes("image") && isImage) return null;
  if (allowed.includes("pdf") && isPdf) return null;

  const names = allowed.map((a) => (a === "pdf" ? "PDF" : "image (JPEG, PNG, GIF, WebP)"));
  return `That file is not a valid ${names.join(" or ")}.`;
}
