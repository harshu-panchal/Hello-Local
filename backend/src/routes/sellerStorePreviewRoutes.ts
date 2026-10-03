import { Router } from "express";
import {
  getStorePreview,
  quickUpdatePrice,
  togglePublish,
  toggleFeature,
  reorderProducts,
} from "../modules/seller/controllers/sellerStorePreviewController";

const router = Router();

router.get("/", getStorePreview);
router.patch("/products/reorder", reorderProducts);
router.patch("/products/:id/price", quickUpdatePrice);
router.patch("/products/:id/toggle-publish", togglePublish);
router.patch("/products/:id/toggle-feature", toggleFeature);

export default router;
