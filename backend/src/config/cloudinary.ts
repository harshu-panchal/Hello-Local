import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Validate configuration
if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn("⚠️  Cloudinary credentials not found in environment variables");
}

export default cloudinary;

// Folder structure constants
export const CLOUDINARY_FOLDERS = {
  PRODUCTS: "hellolocal/products",
  PRODUCT_GALLERY: "hellolocal/products/gallery",
  CATEGORIES: "hellolocal/categories",
  SUBCATEGORIES: "hellolocal/subcategories",
  COUPONS: "hellolocal/coupons",
  SELLERS: "hellolocal/sellers",
  SELLER_PROFILE: "hellolocal/sellers/profile",
  SELLER_DOCUMENTS: "hellolocal/sellers/documents",
  DELIVERY: "hellolocal/delivery",
  DELIVERY_DOCUMENTS: "hellolocal/delivery/documents",
  STORES: "hellolocal/stores",
  USERS: "hellolocal/users",
  ONBOARDING_DOCUMENTS: "hellolocal/onboarding/documents",
} as const;
