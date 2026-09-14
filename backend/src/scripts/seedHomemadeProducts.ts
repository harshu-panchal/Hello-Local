import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import Seller from "../models/Seller";
import Product from "../models/Product";
import Category from "../models/Category";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/hellolocal";

const SAMPLE_HOMEMADE_PRODUCTS = [
  {
    productName: "Khandeshi Thecha Pickle (Handcrafted)",
    smallDescription: "Authentic Maharashtrian garlic & green chilli crushed pickle made fresh in wooden mortar.",
    description: "Pure home recipe with zero preservatives. Traditional Kolhapur-style crushed green chillies and roasted garlic tempered in cold-pressed groundnut oil.",
    price: 220,
    discPrice: 199,
    stock: 50,
    foodType: "Veg",
    isHomemade: true,
    homemadeCategory: "food",
    homemadeSubcategory: "pickles-chutneys",
    mainImage: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
    ],
    pack: "250g jar",
    status: "Active",
    publish: true,
    popular: true,
  },
  {
    productName: "Dark Chocolate Fudge Cake (Fresh Baked)",
    smallDescription: "Moist dark chocolate fudge cake baked fresh upon order with pure cocoa.",
    description: "Prepared at home with organic flour, pure cocoa, and dark Belgian chocolate ganache. Baked fresh within hours of delivery.",
    price: 499,
    discPrice: 449,
    stock: 20,
    foodType: "Veg",
    isHomemade: true,
    homemadeCategory: "bakery",
    homemadeSubcategory: "cakes-pastries",
    mainImage: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80",
    ],
    pack: "500g",
    status: "Active",
    publish: true,
    popular: true,
  },
  {
    productName: "Pure Desi Ghee Besan Ladoo (Ghar Ka)",
    smallDescription: "Traditional besan ladoos roasted slowly in pure A2 bilona desi ghee.",
    description: "Slow roasted gram flour studded with crunchy roasted cashews, almonds, and aromatic green cardamom. Melt in mouth texture.",
    price: 280,
    discPrice: 250,
    stock: 40,
    foodType: "Veg",
    isHomemade: true,
    homemadeCategory: "food",
    homemadeSubcategory: "sweets-snacks",
    mainImage: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
    ],
    pack: "250g box",
    status: "Active",
    publish: true,
    popular: true,
  },
  {
    productName: "Handmade Macrame Boho Wall Hanging",
    smallDescription: "Artisanal boho wall tapestry handcrafted with 100% natural organic cotton cord.",
    description: "Hand-knotted intricate macrame tapestry mounted on natural polished driftwood. Adds warm bohemian charm to any room.",
    price: 650,
    discPrice: 590,
    stock: 15,
    foodType: "None",
    isHomemade: true,
    homemadeCategory: "handmade",
    homemadeSubcategory: "macrame-decor",
    mainImage: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80",
    ],
    pack: "1 Piece",
    status: "Active",
    publish: true,
    popular: false,
  },
  {
    productName: "Hand-Poured Lavender & Vanilla Soy Candle",
    smallDescription: "Soothing natural soy wax candle scented with pure therapeutic grade lavender essential oil.",
    description: "Clean burning natural soy wax with wooden crackling wick. Burns for up to 45 hours with a calming herbal aroma.",
    price: 380,
    discPrice: 349,
    stock: 30,
    foodType: "None",
    isHomemade: true,
    homemadeCategory: "lifestyle",
    homemadeSubcategory: "scented-candles",
    mainImage: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80",
    ],
    pack: "200g Jar",
    status: "Active",
    publish: true,
    popular: false,
  },
  {
    productName: "Cold-Pressed Raw Forest Honey (Unprocessed)",
    smallDescription: "Pure unfiltered wild forest honey harvested sustainably from natural beehives.",
    description: "Unpasteurized, rich in natural bee pollen and enzymes. 100% raw without sugar feeding or heating.",
    price: 390,
    discPrice: 360,
    stock: 25,
    foodType: "Veg",
    isHomemade: true,
    homemadeCategory: "natural",
    homemadeSubcategory: "raw-honey",
    mainImage: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
    galleryImages: [
      "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
    ],
    pack: "350g Glass Jar",
    status: "Active",
    publish: true,
    popular: true,
  },
];

async function seedHomemade() {
  try {
    console.log("Connecting to MongoDB:", MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to database successfully.");

    // Find an approved seller
    let seller = await Seller.findOne({ status: "Approved" });

    if (!seller) {
      console.log("No approved seller found. Creating demo Home Maker seller...");
      seller = await Seller.create({
        sellerName: "Aai's Home Kitchen",
        storeName: "Aai's Homemade Creations",
        email: "homemade.seller@example.com",
        password: "password123",
        mobile: "9876543210",
        status: "Approved",
        storeDescription: "Fresh authentic home-cooked delicacies, pickles & traditional sweets",
        city: "Indore",
        address: "South Tukoganj, Indore, Madhya Pradesh",
        serviceRadiusKm: 50,
        requireProductApproval: false,
        viewCustomerDetails: true,
        rating: 4.8,
        reviewsCount: 84,
        location: {
          type: "Point",
          coordinates: [75.876, 22.7196], // Indore center
        },
      });
      console.log("Created demo seller:", seller.storeName);
    } else {
      console.log("Using existing approved seller:", seller.storeName);
    }

    // Find or fallback to a category
    let defaultCategory = await Category.findOne({ status: "Active" });

    let createdCount = 0;
    for (const prod of SAMPLE_HOMEMADE_PRODUCTS) {
      const existing = await Product.findOne({
        productName: prod.productName,
        seller: seller._id,
      });

      if (!existing) {
        await Product.create({
          ...prod,
          seller: seller._id,
          category: defaultCategory ? defaultCategory._id : null,
          variations: [
            {
              name: "Standard Pack",
              title: prod.pack,
              value: prod.pack,
              price: prod.price,
              discPrice: prod.discPrice,
              stock: prod.stock,
              status: "Available",
            },
          ],
        });
        createdCount++;
        console.log(`Created homemade product: ${prod.productName}`);
      } else {
        // Ensure isHomemade flag is set
        existing.isHomemade = true;
        existing.homemadeCategory = prod.homemadeCategory;
        existing.homemadeSubcategory = prod.homemadeSubcategory;
        existing.publish = true;
        existing.status = "Active";
        await existing.save();
        console.log(`Updated existing product with isHomemade: ${prod.productName}`);
      }
    }

    console.log(`\nSeed completed! Created/Updated ${SAMPLE_HOMEMADE_PRODUCTS.length} homemade products.`);
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

seedHomemade();
