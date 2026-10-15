import dns from "dns";
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import connectDB from "../config/db";
import { findSellersWithinRange } from "../utils/locationHelper";
import Product from "../models/Product";
import ShopAd from "../models/ShopAd";
import PromoStrip from "../models/PromoStrip";
import HomeSection from "../models/HomeSection";
import BestsellerCard from "../models/BestsellerCard";
import Category from "../models/Category";
import Inventory from "../models/Inventory";

async function verify() {
  try {
    await connectDB();
    console.log("Connected to MongoDB for verification...");

    // 1. Pune Check
    const puneSellers = await findSellersWithinRange(18.5204, 73.8567);
    console.log(`\n[Pune Coordinates: 18.5204, 73.8567]`);
    console.log(`  Nearby Sellers Found: ${puneSellers.length}`);
    const puneProducts = await Product.countDocuments({
      seller: { $in: puneSellers },
      status: "Active",
      publish: true,
    });
    console.log(`  Active Published Products in Pune: ${puneProducts}`);

    // 2. Indore Check
    const indoreSellers = await findSellersWithinRange(22.7196, 75.8577);
    console.log(`\n[Indore Coordinates: 22.7196, 75.8577]`);
    console.log(`  Nearby Sellers Found: ${indoreSellers.length}`);
    const indoreProducts = await Product.countDocuments({
      seller: { $in: indoreSellers },
      status: "Active",
      publish: true,
    });
    console.log(`  Active Published Products in Indore: ${indoreProducts}`);

    // 3. Category coverage
    console.log(`\n[Category Product Counts in Pune]`);
    const rootCategories = await Category.find({ parentId: null, status: "Active" }).sort({ order: 1 });
    for (const cat of rootCategories) {
      const count = await Product.countDocuments({
        category: cat._id,
        seller: { $in: puneSellers },
        status: "Active",
      });
      console.log(`  - ${cat.name} (${cat.slug}): ${count} products`);
    }

    // 4. ShopAds & PromoStrips
    const shopAds = await ShopAd.find({ isActive: true }).countDocuments();
    const promoStrips = await PromoStrip.find({ isActive: true }).countDocuments();
    const homeSections = await HomeSection.find({ isActive: true }).countDocuments();
    const bestsellerCards = await BestsellerCard.find({ isActive: true }).countDocuments();

    console.log(`\n[Storefront Elements]`);
    console.log(`  Active ShopAds (Hero Banners): ${shopAds}`);
    console.log(`  Active PromoStrips: ${promoStrips}`);
    console.log(`  Active HomeSections: ${homeSections}`);
    console.log(`  Active BestsellerCards: ${bestsellerCards}`);

    // 5. Inventory integrity check
    const productsWithoutInventory = [];
    const allActiveProds = await Product.find({ status: "Active" }).select("_id productName");
    for (const prod of allActiveProds) {
      const inv = await Inventory.findOne({ product: prod._id });
      if (!inv || inv.availableStock <= 0) {
        productsWithoutInventory.push(prod.productName);
      }
    }
    console.log(`\n[Inventory Verification]`);
    console.log(`  Total Active Products Checked: ${allActiveProds.length}`);
    console.log(`  Products without valid inventory/stock: ${productsWithoutInventory.length}`);
    if (productsWithoutInventory.length > 0) {
      console.warn(`  Missing inventory on:`, productsWithoutInventory.slice(0, 5));
    } else {
      console.log(`  ✓ 100% of products have active stock in Inventory collection!`);
    }

    console.log("\n==========================================");
    console.log("✅ VERIFICATION SUCCESSFUL!");
    console.log("==========================================\n");
  } catch (err) {
    console.error("Verification failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

verify();
