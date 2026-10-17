import dns from "dns";
// Set reliable DNS servers for MongoDB Atlas SRV lookups on Windows
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import connectDB from "../config/db";
import Seller from "../models/Seller";
import HeaderCategory from "../models/HeaderCategory";
import Category from "../models/Category";
import SubCategory from "../models/SubCategory";
import Product from "../models/Product";
import Inventory from "../models/Inventory";
import ShopAd from "../models/ShopAd";
import PromoStrip from "../models/PromoStrip";
import HomeSection from "../models/HomeSection";
import BestsellerCard from "../models/BestsellerCard";
import LowestPricesProduct from "../models/LowestPricesProduct";
import Shop from "../models/Shop";
import { cache } from "../utils/cache";

// High-resolution, reliable Unsplash CDN images
const IMAGES = {
  // Category images
  fruitsVeg: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=600&q=80",
  attaRice: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
  cookingOil: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80",
  snacks: "https://images.unsplash.com/photo-1621996346565-e3d5d6281699?auto=format&fit=crop&w=600&q=80",
  dairy: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
  bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  vegFood: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
  nonVegFood: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80",
  pizzaBurger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
  beauty: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80",
  fashion: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&q=80",
  wedding: "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&w=600&q=80",
  saadi: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=600&q=80",
  homemadePickle: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
  homemadeSweets: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=600&q=80",
  homemadeCrafts: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80",

  // Specific Product Images
  tomato: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
  onion: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80",
  potato: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80",
  coriander: "https://images.unsplash.com/photo-1525607551316-4a8e16d1f9ba?auto=format&fit=crop&w=600&q=80",
  apple: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
  banana: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=600&q=80",
  orange: "https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=600&q=80",
  spinach: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=600&q=80",
  lemon: "https://images.unsplash.com/photo-1533038590840-1cde6e668a91?auto=format&fit=crop&w=600&q=80",

  atta: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  rice: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
  toorDal: "https://images.unsplash.com/photo-1585994192701-f1a505c817ea?auto=format&fit=crop&w=600&q=80",
  moongDal: "https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=600&q=80",
  besan: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  poha: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",

  mustardOil: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80",
  sunflowerOil: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80",
  desiGhee: "https://images.unsplash.com/photo-1631451095765-2c91616fc9e6?auto=format&fit=crop&w=600&q=80",
  turmericPowder: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=600&q=80",
  rockSalt: "https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?auto=format&fit=crop&w=600&q=80",

  bhujia: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80",
  chips: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80",
  biscuits: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80",
  cookies: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=600&q=80",
  noodles: "https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=600&q=80",

  milk: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
  paneer: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80",
  eggs: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80",
  butter: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80",
  cheese: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=600&q=80",

  cake: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80",
  pastry: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
  bread: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  croissant: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",

  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
  fries: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80",

  shahiPaneer: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
  dalTadka: "https://images.unsplash.com/photo-1585994192701-f1a505c817ea?auto=format&fit=crop&w=600&q=80",
  biryani: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80",
  butterChicken: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80",

  sareeSilk: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=600&q=80",
  sareeBanarasi: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80",
  sareeParty: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80",
  lehenga: "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&w=600&q=80",
  kurta: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80",

  faceSerum: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80",
  shampoo: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&w=600&q=80",
  lipstick: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=600&q=80",
  moisturizer: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80",

  handbag: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80",
  sneakers: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
  tshirt: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80",

  candle: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80",
  honey: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=600&q=80",
  pickle: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
  ladoo: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=600&q=80",
  brownie: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80",
  macrame: "https://images.unsplash.com/photo-1513519247388-193454204627?auto=format&fit=crop&w=600&q=80",
};

async function seedRichStorefront() {
  try {
    await connectDB();
    console.log("Connected to MongoDB for Rich Storefront Seeding...");

    // ==========================================
    // 1. SETUP & APPROVE SELLERS ACROSS KEY CITIES
    // ==========================================
    console.log("\n--- STEP 1: Configuring Multi-City Approved Sellers ---");

    // 1a. INDORE SELLER 1: Hello Local Vendor Store
    const indoreSeller1 = await Seller.findOneAndUpdate(
      { storeName: "Hello Local Vendor Store" },
      {
        storeName: "Hello Local Vendor Store",
        sellerName: "Vendor Indore",
        category: "Grocery & Supermarket",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 100,
        address: "South Tukoganj, Indore, Madhya Pradesh 452001",
        city: "Indore",
        location: {
          type: "Point",
          coordinates: [75.857726, 22.719569],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Indore Seller 1: ${indoreSeller1.storeName} (${indoreSeller1._id})`);

    // 1b. INDORE SELLER 2: Testseller
    const indoreSeller2 = await Seller.findOneAndUpdate(
      { storeName: "Testseller" },
      {
        storeName: "Testseller",
        sellerName: "Test Seller Admin",
        mobile: "9302841832",
        email: "sggs@gmail.comm",
        category: "Bakery, Fast Food & Sweets",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 100,
        address: "RNT Marg, South Tukoganj, Indore, Madhya Pradesh 452001",
        city: "Indore",
        location: {
          type: "Point",
          coordinates: [75.871491, 22.717208],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Indore Seller 2: ${indoreSeller2.storeName} (${indoreSeller2._id})`);

    // 1c. INDORE SELLER 3: Indore Fashion & Organic Mart
    const indoreSeller3 = await Seller.findOneAndUpdate(
      { email: "priyank@gmail.com" },
      {
        storeName: "Indore Fashion & Organic Mart",
        sellerName: "Priyank Patel",
        mobile: "8305357624",
        email: "priyank@gmail.com",
        category: "Fashion, Ethnic Wear & Beauty",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 100,
        address: "Corporate House, RNT Marg, South Tukoganj, Indore, MP 452001",
        city: "Indore",
        location: {
          type: "Point",
          coordinates: [75.871689, 22.717265],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Indore Seller 3: ${indoreSeller3.storeName} (${indoreSeller3._id})`);

    // 1d. PUNE SELLER: Dedicated Pune Hub (Default location in Frontend is Pune: 18.5204, 73.8567)
    const puneSeller = await Seller.findOneAndUpdate(
      { email: "pune-hub@hellolocal.com" },
      {
        storeName: "Hello Local Express Pune",
        sellerName: "Pune Hub Manager",
        mobile: "9820011223",
        email: "pune-hub@hellolocal.com",
        category: "All-in-One Supermarket",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 100,
        address: "FC Road, Shivajinagar, Pune, Maharashtra 411005",
        city: "Pune",
        location: {
          type: "Point",
          coordinates: [73.856744, 18.52043],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Pune Seller: ${puneSeller.storeName} (${puneSeller._id})`);

    // 1e. MUMBAI SELLER: Demo Fresh Mart
    const mumbaiSeller = await Seller.findOneAndUpdate(
      { email: "demoseller@hellolocal.in" },
      {
        storeName: "Demo Fresh Mart Mumbai",
        sellerName: "Demo Seller",
        mobile: "9000000001",
        email: "demoseller@hellolocal.in",
        category: "Grocery & Supermarket",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 100,
        address: "Hill Road, Bandra West, Mumbai, Maharashtra 400050",
        city: "Mumbai",
        location: {
          type: "Point",
          coordinates: [72.8777, 19.076],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Mumbai Seller: ${mumbaiSeller.storeName} (${mumbaiSeller._id})`);

    // 1f. DELHI SELLER: Delhi Super Mart & Organics
    const delhiSeller = await Seller.findOneAndUpdate(
      { email: "sahud5643@gmail.com" },
      {
        storeName: "Delhi Super Mart & Organics",
        sellerName: "Deepak Sahu",
        mobile: "9667905364",
        email: "sahud5643@gmail.com",
        category: "Grocery & Vegetables",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 100,
        address: "Connaught Place, New Delhi, Delhi 110001",
        city: "Delhi",
        location: {
          type: "Point",
          coordinates: [77.141008, 28.704208],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`✓ Delhi Seller: ${delhiSeller.storeName} (${delhiSeller._id})`);


    // ==========================================
    // 2. HEADER CATEGORIES & CATEGORIES RESOLUTION
    // ==========================================
    console.log("\n--- STEP 2: Resolving HeaderCategories & Categories ---");
    const headerCategoryDocs = await HeaderCategory.find({ status: "Published" }).lean();
    const headerMap = new Map<string, mongoose.Types.ObjectId>();
    for (const h of headerCategoryDocs) {
      headerMap.set(h.slug, h._id as mongoose.Types.ObjectId);
    }

    const categoriesData = [
      {
        name: "Fruits & Vegetables",
        slug: "fruits-vegetables",
        image: IMAGES.fruitsVeg,
        headerSlug: "grocery",
        order: 1,
        subcategories: ["Fresh Vegetables", "Fresh Fruits", "Organic Greens"],
      },
      {
        name: "Atta, Rice & Dal",
        slug: "atta-rice-dal",
        image: IMAGES.attaRice,
        headerSlug: "grocery",
        order: 2,
        subcategories: ["Chakki Atta & Flours", "Premium Basmati Rice", "Pulses & Dals"],
      },
      {
        name: "Cooking Oils & Ghee",
        slug: "cooking-oils-ghee",
        image: IMAGES.cookingOil,
        headerSlug: "grocery",
        order: 3,
        subcategories: ["Mustard & Sunflower Oil", "Pure Desi Ghee", "Spices & Masalas"],
      },
      {
        name: "Snacks & Munchies",
        slug: "snacks-munchies",
        image: IMAGES.snacks,
        headerSlug: "grocery",
        order: 4,
        subcategories: ["Namkeen & Bhujia", "Chips & Crisps", "Biscuits & Cookies"],
      },
      {
        name: "Dairy & Eggs",
        slug: "dairy-eggs",
        image: IMAGES.dairy,
        headerSlug: "dairy",
        order: 5,
        subcategories: ["Fresh Milk & Paneer", "Farm Fresh Eggs", "Butter & Cheese"],
      },
      {
        name: "Bakery & Cakes",
        slug: "bakery-cakes",
        image: IMAGES.bakery,
        headerSlug: "bakery",
        order: 6,
        subcategories: ["Celebration Cakes & Pastries", "Fresh Artisanal Breads", "Cookies & Rusks"],
      },
      {
        name: "Veg Food Delights",
        slug: "veg-food-delights",
        image: IMAGES.vegFood,
        headerSlug: "food",
        order: 7,
        subcategories: ["Shahi Paneer & Curries", "Dal Tadka & Rice", "Tandoori Starters"],
      },
      {
        name: "Non Veg Delights",
        slug: "non-veg-delights",
        image: IMAGES.nonVegFood,
        headerSlug: "food",
        order: 8,
        subcategories: ["Butter Chicken & Biryani", "Mutton Rogan Josh", "Tandoori Chicken Special"],
      },
      {
        name: "Pizza & Burgers",
        slug: "pizza-burgers",
        image: IMAGES.pizzaBurger,
        headerSlug: "fast-food",
        order: 9,
        subcategories: ["Gourmet Cheese Pizzas", "Loaded Crispy Burgers", "French Fries & Wraps"],
      },
      {
        name: "Beauty & Cosmetics",
        slug: "beauty-cosmetics",
        image: IMAGES.beauty,
        headerSlug: "beauty",
        order: 10,
        subcategories: ["Skincare & Lotions", "Hair Care & Shampoos", "Makeup Essentials"],
      },
      {
        name: "Fashion & Lifestyle",
        slug: "fashion-lifestyle",
        image: IMAGES.fashion,
        headerSlug: "fashion",
        order: 11,
        subcategories: ["Casual Wear & Tops", "Handbags & Clutches", "Footwear & Sandals"],
      },
      {
        name: "Wedding & Ethnic Wear",
        slug: "wedding-ethnic-wear",
        image: IMAGES.wedding,
        headerSlug: "wedding",
        order: 12,
        subcategories: ["Bridal Lehengas & Sherwanis", "Designer Kurtas & Dupattas"],
      },
      {
        name: "Saadi & Sarees",
        slug: "saadi-sarees",
        image: IMAGES.saadi,
        headerSlug: "fashion",
        order: 13,
        subcategories: ["Banarasi Silk Sarees", "Chanderi Silk Sarees", "Party Wear Georgette Sarees"],
      },
      {
        name: "Pickles & Chutneys",
        slug: "pickles-chutneys",
        image: IMAGES.homemadePickle,
        headerSlug: "food",
        order: 14,
        subcategories: ["Khandeshi Thecha & Chutneys", "Traditional Mango Pickles"],
      },
      {
        name: "Homemade Bakes & Sweets",
        slug: "homemade-bakes-sweets",
        image: IMAGES.homemadeSweets,
        headerSlug: "bakery",
        order: 15,
        subcategories: ["Pure Ghee Besan Ladoo", "Artisanal Chocolates & Brownies"],
      },
      {
        name: "Handmade Living & Crafts",
        slug: "handmade-living-crafts",
        image: IMAGES.homemadeCrafts,
        headerSlug: "grocery",
        order: 16,
        subcategories: ["Scented Soy Wax Candles", "Macrame Boho Wall Decor", "Raw Forest Honey"],
      },
    ];

    const categoryModelMap = new Map<string, any>();
    const subcategoryModelMap = new Map<string, any>();

    for (const catDef of categoriesData) {
      const headerCatId = headerMap.get(catDef.headerSlug);

      const categoryDoc = await Category.findOneAndUpdate(
        { slug: catDef.slug },
        {
          name: catDef.name,
          slug: catDef.slug,
          image: catDef.image,
          order: catDef.order,
          status: "Active",
          headerCategoryId: headerCatId || null,
          parentId: null,
        },
        { upsert: true, new: true }
      );
      categoryModelMap.set(catDef.slug, categoryDoc);

      for (let sIdx = 0; sIdx < catDef.subcategories.length; sIdx++) {
        const subName = catDef.subcategories[sIdx];
        const subDoc = await SubCategory.findOneAndUpdate(
          { name: subName, category: categoryDoc._id },
          {
            name: subName,
            category: categoryDoc._id,
            image: catDef.image,
            order: sIdx + 1,
          },
          { upsert: true, new: true }
        );
        subcategoryModelMap.set(`${catDef.slug}::${subName}`, subDoc);

        const childCatSlug = `${catDef.slug}-${subName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        await Category.findOneAndUpdate(
          { slug: childCatSlug },
          {
            name: subName,
            slug: childCatSlug,
            image: catDef.image,
            order: sIdx + 1,
            status: "Active",
            headerCategoryId: headerCatId || null,
            parentId: categoryDoc._id,
          },
          { upsert: true, new: true }
        );
      }
    }
    console.log(`✓ Configured ${categoryModelMap.size} root categories and all subcategories.`);


    // ==========================================
    // 3. MASTER CATALOG PRODUCT DEFINITIONS
    // ==========================================
    console.log("\n--- STEP 3: Defining Full Catalog of 110+ Products ---");

    interface CatalogItem {
      productName: string;
      categorySlug: string;
      subcategoryName: string;
      primarySeller: "indore1" | "indore2" | "indore3";
      price: number;
      mrp: number;
      mainImage: string;
      pack: string;
      foodType: "Veg" | "Non-Veg" | "None";
      rating: number;
      reviewsCount: number;
      description: string;
      isHomemade?: boolean;
      homemadeCategory?: string;
    }

    const catalogItems: CatalogItem[] = [
      // --- FRUITS & VEGETABLES ---
      {
        productName: "Fresh Red Hybrid Tomatoes",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Vegetables",
        primarySeller: "indore1",
        price: 38,
        mrp: 50,
        mainImage: IMAGES.tomato,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 142,
        description: "Firm, farm-picked ripe red hybrid tomatoes sourced directly from local vegetable mandis.",
      },
      {
        productName: "Fresh Nashik Red Onions",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Vegetables",
        primarySeller: "indore1",
        price: 35,
        mrp: 45,
        mainImage: IMAGES.onion,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 110,
        description: "Crisp, pungent Grade-A Nashik red onions with long shelf life, perfect for curries and salads.",
      },
      {
        productName: "New Crop Jyoti Potatoes",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Vegetables",
        primarySeller: "indore1",
        price: 28,
        mrp: 35,
        mainImage: IMAGES.potato,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.6,
        reviewsCount: 95,
        description: "Earthy, firm potatoes ideal for boiling, frying, and making delicious aloo parathas.",
      },
      {
        productName: "Farm Fresh Green Coriander",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Organic Greens",
        primarySeller: "indore1",
        price: 15,
        mrp: 20,
        mainImage: IMAGES.coriander,
        pack: "100 g bunch",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 64,
        description: "Hydroponically grown fresh aromatic green coriander leaves washed and bunched.",
      },
      {
        productName: "Shimla Royal Crisp Apples",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Fruits",
        primarySeller: "indore1",
        price: 140,
        mrp: 180,
        mainImage: IMAGES.apple,
        pack: "1 kg (4-5 pcs)",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 88,
        description: "Sweet, crunchy and juicy red royal apples directly harvested from Himachal orchards.",
      },
      {
        productName: "Robusta Fresh Bananas",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Fruits",
        primarySeller: "indore1",
        price: 45,
        mrp: 60,
        mainImage: IMAGES.banana,
        pack: "Pack of 6",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 75,
        description: "Naturally ripened, nutrient-dense sweet Robusta bananas packed with potassium and energy.",
      },
      {
        productName: "Nagpur Sweet Mandarins / Oranges",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Fruits",
        primarySeller: "indore1",
        price: 85,
        mrp: 110,
        mainImage: IMAGES.orange,
        pack: "1 kg (5-6 pcs)",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 52,
        description: "Zesty, rich in Vitamin-C Nagpur juicy sweet oranges, hand-graded for peak freshness.",
      },
      {
        productName: "Hydroponic Baby Spinach (Palak)",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Organic Greens",
        primarySeller: "indore1",
        price: 24,
        mrp: 32,
        mainImage: IMAGES.spinach,
        pack: "250 g bunch",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 67,
        description: "Tender, clean and iron-rich organic baby spinach leaves, pesticide-free.",
      },
      {
        productName: "Fresh Juicy Yellow Lemons",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Vegetables",
        primarySeller: "indore1",
        price: 25,
        mrp: 35,
        mainImage: IMAGES.lemon,
        pack: "Pack of 4 (approx 150g)",
        foodType: "Veg",
        rating: 4.6,
        reviewsCount: 43,
        description: "Thin-skinned, extremely juicy fresh local lemons bursting with tangy citric goodness.",
      },

      // --- ATTA, RICE & DAL ---
      {
        productName: "Farm Fresh Sharbati Wheat Atta",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Chakki Atta & Flours",
        primarySeller: "indore1",
        price: 229,
        mrp: 260,
        mainImage: IMAGES.atta,
        pack: "5 kg",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 184,
        description: "100% pure stone-ground Madhya Pradesh Sharbati whole wheat chakki atta for ultra soft rotis.",
      },
      {
        productName: "Daawat Rozana Gold Basmati Rice",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Premium Basmati Rice",
        primarySeller: "indore1",
        price: 99,
        mrp: 135,
        mainImage: IMAGES.rice,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 125,
        description: "Aromatic long-grain premium Rozana basmati rice perfect for daily pulao and steamed rice.",
      },
      {
        productName: "Tata Sampann High Protein Toor Dal",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Pulses & Dals",
        primarySeller: "indore1",
        price: 165,
        mrp: 195,
        mainImage: IMAGES.toorDal,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 142,
        description: "Unpolished, naturally processed rich toor dal with maximum nutrient and protein retention.",
      },
      {
        productName: "Organic Yellow Moong Dal Mogar",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Pulses & Dals",
        primarySeller: "indore1",
        price: 135,
        mrp: 160,
        mainImage: IMAGES.moongDal,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 89,
        description: "Easy-to-digest yellow split moong dal, rich in dietary fiber and light on stomach.",
      },
      {
        productName: "Fortune Fine Chana Dal Besan",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Chakki Atta & Flours",
        primarySeller: "indore1",
        price: 65,
        mrp: 80,
        mainImage: IMAGES.besan,
        pack: "500 g",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 76,
        description: "100% pure 5-step unpolished chana dal besan, perfect for crispy pakoras, dhoklas, and ladoos.",
      },
      {
        productName: "Authentic Indore Ujjaini Poha",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Chakki Atta & Flours",
        primarySeller: "indore1",
        price: 48,
        mrp: 60,
        mainImage: IMAGES.poha,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 160,
        description: "Original thick-flake famous Indore poha that turns fluffy, soft, and never mushy when steamed.",
      },

      // --- COOKING OILS & GHEE ---
      {
        productName: "Fortune Kachi Ghani Pure Mustard Oil",
        categorySlug: "cooking-oils-ghee",
        subcategoryName: "Mustard & Sunflower Oil",
        primarySeller: "indore1",
        price: 145,
        mrp: 180,
        mainImage: IMAGES.mustardOil,
        pack: "1 Litre Pouch",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 134,
        description: "Cold-pressed traditional kachi ghani mustard oil with strong natural pungency and antioxidants.",
      },
      {
        productName: "Saffola Gold Pro Healthy Blend Oil",
        categorySlug: "cooking-oils-ghee",
        subcategoryName: "Mustard & Sunflower Oil",
        primarySeller: "indore1",
        price: 175,
        mrp: 215,
        mainImage: IMAGES.sunflowerOil,
        pack: "1 Litre Bottle",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 98,
        description: "Dual-seed technology blended oil with LOSORB technology ensuring lower oil absorption in cooking.",
      },
      {
        productName: "Amul Pure Desi Buffalo Ghee",
        categorySlug: "cooking-oils-ghee",
        subcategoryName: "Pure Desi Ghee",
        primarySeller: "indore1",
        price: 580,
        mrp: 650,
        mainImage: IMAGES.desiGhee,
        pack: "1 Litre Tin",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 210,
        description: "Granular, aromatic pure ghee prepared from rich fresh milk cream with rich golden granules.",
      },
      {
        productName: "Catch Natural Himalayan Pink Rock Salt",
        categorySlug: "cooking-oils-ghee",
        subcategoryName: "Spices & Masalas",
        primarySeller: "indore1",
        price: 55,
        mrp: 75,
        mainImage: IMAGES.rockSalt,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 62,
        description: "Mineral-rich pink sendha namak rock salt containing 84 essential trace minerals.",
      },
      {
        productName: "Everest Selam Turmeric Powder (Haldi)",
        categorySlug: "cooking-oils-ghee",
        subcategoryName: "Spices & Masalas",
        primarySeller: "indore1",
        price: 36,
        mrp: 45,
        mainImage: IMAGES.turmericPowder,
        pack: "200 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 88,
        description: "High curcumin value unadulterated bright golden turmeric powder for authentic Indian taste.",
      },

      // --- SNACKS & MUNCHIES ---
      {
        productName: "Haldiram's Famous Aloo Bhujia",
        categorySlug: "snacks-munchies",
        subcategoryName: "Namkeen & Bhujia",
        primarySeller: "indore1",
        price: 48,
        mrp: 55,
        mainImage: IMAGES.bhujia,
        pack: "200 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 156,
        description: "Classic crisp, mildly spiced mint-flavoured potato and gram flour namkeen.",
      },
      {
        productName: "Lay's Classic Salted Potato Chips",
        categorySlug: "snacks-munchies",
        subcategoryName: "Chips & Crisps",
        primarySeller: "indore1",
        price: 20,
        mrp: 20,
        mainImage: IMAGES.chips,
        pack: "50 g",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 112,
        description: "Crispy farm-grown potato slices gently seasoned with pure salt for timeless snacking.",
      },
      {
        productName: "Britannia Good Day Cashew Cookies",
        categorySlug: "snacks-munchies",
        subcategoryName: "Biscuits & Cookies",
        primarySeller: "indore1",
        price: 35,
        mrp: 40,
        mainImage: IMAGES.cookies,
        pack: "200 g (Family Pack)",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 94,
        description: "Rich buttery cookies generously studded with crunchy roasted cashew nuts.",
      },
      {
        productName: "Maggi 2-Minute Masala Instant Noodles",
        categorySlug: "snacks-munchies",
        subcategoryName: "Chips & Crisps",
        primarySeller: "indore1",
        price: 56,
        mrp: 60,
        mainImage: IMAGES.noodles,
        pack: "Pack of 4 (280 g)",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 220,
        description: "The nation's favorite spiced noodles with iconic tastemaker made from 10 signature spices.",
      },
      {
        productName: "Parle-G Gold Glucose Biscuits",
        categorySlug: "snacks-munchies",
        subcategoryName: "Biscuits & Cookies",
        primarySeller: "indore1",
        price: 30,
        mrp: 35,
        mainImage: IMAGES.biscuits,
        pack: "1 kg Mega Pack",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 180,
        description: "Wholesome wheat and milk glucose biscuits, India's favorite chai dunking companion.",
      },

      // --- DAIRY & EGGS ---
      {
        productName: "Amul Taaza Homogenised Toned Milk",
        categorySlug: "dairy-eggs",
        subcategoryName: "Fresh Milk & Paneer",
        primarySeller: "indore1",
        price: 70,
        mrp: 74,
        mainImage: IMAGES.milk,
        pack: "1 Litre",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 240,
        description: "Fresh pasteurised toned milk with wholesome calcium and proteins for the whole family.",
      },
      {
        productName: "Fresh Indore Malai Paneer",
        categorySlug: "dairy-eggs",
        subcategoryName: "Fresh Milk & Paneer",
        primarySeller: "indore1",
        price: 99,
        mrp: 120,
        mainImage: IMAGES.paneer,
        pack: "200 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 178,
        description: "Soft, melt-in-the-mouth cottage cheese crafted from pure full-cream buffalo milk.",
      },
      {
        productName: "Farm Fresh Brown Organic Eggs",
        categorySlug: "dairy-eggs",
        subcategoryName: "Farm Fresh Eggs",
        primarySeller: "indore1",
        price: 52,
        mrp: 65,
        mainImage: IMAGES.eggs,
        pack: "Pack of 6",
        foodType: "Non-Veg",
        rating: 4.8,
        reviewsCount: 114,
        description: "Naturally laid country eggs rich in Omega-3 and natural deep yellow yolk.",
      },
      {
        productName: "Amul Pasteurised Salted Butter",
        categorySlug: "dairy-eggs",
        subcategoryName: "Butter & Cheese",
        primarySeller: "indore1",
        price: 58,
        mrp: 60,
        mainImage: IMAGES.butter,
        pack: "100 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 195,
        description: "The utterly butterly delicious creamy salted butter, churned from fresh cow milk cream.",
      },
      {
        productName: "Amul Processed Cheese Slices",
        categorySlug: "dairy-eggs",
        subcategoryName: "Butter & Cheese",
        primarySeller: "indore1",
        price: 135,
        mrp: 155,
        mainImage: IMAGES.cheese,
        pack: "200 g (10 Slices)",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 86,
        description: "Creamy, melt-in-the-pan cheese slices for instant grilled sandwiches and burger toppings.",
      },

      // --- BAKERY & CAKES (Testseller) ---
      {
        productName: "Belgian Dark Truffle Celebration Cake",
        categorySlug: "bakery-cakes",
        subcategoryName: "Celebration Cakes & Pastries",
        primarySeller: "indore2",
        price: 549,
        mrp: 650,
        mainImage: IMAGES.cake,
        pack: "500 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 82,
        description: "Decadent rich layered chocolate cake covered in glossy Dutch truffle ganache.",
      },
      {
        productName: "Red Velvet Cream Cheese Pastry",
        categorySlug: "bakery-cakes",
        subcategoryName: "Celebration Cakes & Pastries",
        primarySeller: "indore2",
        price: 95,
        mrp: 120,
        mainImage: IMAGES.pastry,
        pack: "Pack of 1 (120 g)",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 46,
        description: "Moist crimson sponge slice paired with velvety smooth Philadelphia cream cheese frosting.",
      },
      {
        productName: "Artisanal Multigrain Sourdough Bread",
        categorySlug: "bakery-cakes",
        subcategoryName: "Fresh Artisanal Breads",
        primarySeller: "indore2",
        price: 85,
        mrp: 110,
        mainImage: IMAGES.bread,
        pack: "400 g",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 58,
        description: "Naturally fermented sourdough with toasted sunflower seeds, flaxseeds, and rolled oats.",
      },
      {
        productName: "French Flaky Butter Croissant",
        categorySlug: "bakery-cakes",
        subcategoryName: "Fresh Artisanal Breads",
        primarySeller: "indore2",
        price: 75,
        mrp: 95,
        mainImage: IMAGES.croissant,
        pack: "Pack of 2",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 39,
        description: "Laminated golden pastry dough baked to crisp, buttery perfection with 36 flaky layers.",
      },

      // --- PIZZA & BURGERS (Testseller) ---
      {
        productName: "Overloaded Farmhouse Veg Pizza",
        categorySlug: "pizza-burgers",
        subcategoryName: "Gourmet Cheese Pizzas",
        primarySeller: "indore2",
        price: 279,
        mrp: 349,
        mainImage: IMAGES.pizza,
        pack: "Regular 8 inch",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 98,
        description: "Loaded with fresh mozzarella, capsicum, sweet corn, mushrooms, and black olives on thin crust.",
      },
      {
        productName: "Smoky BBQ Paneer Burger",
        categorySlug: "pizza-burgers",
        subcategoryName: "Loaded Crispy Burgers",
        primarySeller: "indore2",
        price: 149,
        mrp: 189,
        mainImage: IMAGES.burger,
        pack: "1 pc",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 65,
        description: "Crispy grilled paneer patty topped with crunchy iceberg lettuce, melted cheese, and smoky sauce.",
      },
      {
        productName: "Crispy Peri Peri French Fries",
        categorySlug: "pizza-burgers",
        subcategoryName: "French Fries & Wraps",
        primarySeller: "indore2",
        price: 99,
        mrp: 130,
        mainImage: IMAGES.fries,
        pack: "Large (150 g)",
        foodType: "Veg",
        rating: 4.6,
        reviewsCount: 79,
        description: "Golden crispy skin-on potato fries dusted with authentic African bird's eye peri peri seasoning.",
      },

      // --- VEG FOOD DELIGHTS (Testseller) ---
      {
        productName: "Royal Shahi Paneer Handi",
        categorySlug: "veg-food-delights",
        subcategoryName: "Shahi Paneer & Curries",
        primarySeller: "indore2",
        price: 230,
        mrp: 280,
        mainImage: IMAGES.shahiPaneer,
        pack: "Serves 1-2 (450 ml)",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 135,
        description: "Rich Mughlai cottage cheese gravy blended with cashew paste, cream, and aromatic saffron.",
      },
      {
        productName: "Dal Tadka with Jeera Basmati",
        categorySlug: "veg-food-delights",
        subcategoryName: "Dal Tadka & Rice",
        primarySeller: "indore2",
        price: 180,
        mrp: 220,
        mainImage: IMAGES.dalTadka,
        pack: "Meal Box",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 94,
        description: "Yellow lentils tempered with ghee, dry red chillies, and garlic served with aromatic jeera rice.",
      },

      // --- NON VEG DELIGHTS (Testseller) ---
      {
        productName: "Old Delhi Murgh Butter Chicken",
        categorySlug: "non-veg-delights",
        subcategoryName: "Butter Chicken & Biryani",
        primarySeller: "indore2",
        price: 299,
        mrp: 360,
        mainImage: IMAGES.butterChicken,
        pack: "Serves 2 (500 ml)",
        foodType: "Non-Veg",
        rating: 4.9,
        reviewsCount: 148,
        description: "Tender tandoori roasted chicken pieces simmered in silky tomato butter makhani gravy.",
      },
      {
        productName: "Hyderabadi Dum Chicken Biryani",
        categorySlug: "non-veg-delights",
        subcategoryName: "Butter Chicken & Biryani",
        primarySeller: "indore2",
        price: 260,
        mrp: 320,
        mainImage: IMAGES.biryani,
        pack: "Serves 1-2 with Raita",
        foodType: "Non-Veg",
        rating: 4.8,
        reviewsCount: 172,
        description: "Kachi yakhni style long grain basmati rice cooked on slow steam with tender marinated chicken.",
      },

      // --- HOMEMADE CULINARY (Pickles, Sweets, Crafts) ---
      {
        productName: "Khandeshi Thecha Pickle (Handcrafted)",
        categorySlug: "pickles-chutneys",
        subcategoryName: "Khandeshi Thecha & Chutneys",
        primarySeller: "indore2",
        price: 199,
        mrp: 240,
        mainImage: IMAGES.pickle,
        pack: "250 g jar",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Pickles & Chutneys",
        rating: 4.9,
        reviewsCount: 88,
        description: "Fiery green chilli and garlic paste pounded traditionally in stone mortar with cold-pressed peanut oil.",
      },
      {
        productName: "Traditional Khatta-Meetha Mango Pickle",
        categorySlug: "pickles-chutneys",
        subcategoryName: "Traditional Mango Pickles",
        primarySeller: "indore2",
        price: 180,
        mrp: 220,
        mainImage: IMAGES.pickle,
        pack: "300 g jar",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Pickles & Chutneys",
        rating: 4.8,
        reviewsCount: 65,
        description: "Sun-ripened raw mango chunks seasoned with roasted fenugreek, mustard, and organic jaggery.",
      },
      {
        productName: "Pure Desi Ghee Besan Ladoo (Ghar Ka)",
        categorySlug: "homemade-bakes-sweets",
        subcategoryName: "Pure Ghee Besan Ladoo",
        primarySeller: "indore2",
        price: 250,
        mrp: 299,
        mainImage: IMAGES.ladoo,
        pack: "250 g box (6 pcs)",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Homemade Bakes & Sweets",
        rating: 4.9,
        reviewsCount: 92,
        description: "Slow roasted gram flour ladoos with desi bilona cow ghee, cardamoms, and slivered almonds.",
      },
      {
        productName: "Fudgy Belgian Dark Chocolate Brownie Box",
        categorySlug: "homemade-bakes-sweets",
        subcategoryName: "Artisanal Chocolates & Brownies",
        primarySeller: "indore2",
        price: 220,
        mrp: 280,
        mainImage: IMAGES.brownie,
        pack: "Pack of 4",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Homemade Bakes & Sweets",
        rating: 4.8,
        reviewsCount: 71,
        description: "Fudgy, gooey artisanal walnut chocolate brownies baked freshly in home small-batches.",
      },
      {
        productName: "Hand-Poured Lavender & Vanilla Soy Candle",
        categorySlug: "handmade-living-crafts",
        subcategoryName: "Scented Soy Wax Candles",
        primarySeller: "indore3",
        price: 349,
        mrp: 499,
        mainImage: IMAGES.candle,
        pack: "200 g glass jar",
        foodType: "None",
        isHomemade: true,
        homemadeCategory: "Handmade Living & Crafts",
        rating: 4.9,
        reviewsCount: 58,
        description: "100% natural soy wax aromatherapy candle with pure French lavender essential oils and wooden wick.",
      },
      {
        productName: "Cold-Pressed Raw Forest Honey (Unprocessed)",
        categorySlug: "handmade-living-crafts",
        subcategoryName: "Raw Forest Honey",
        primarySeller: "indore3",
        price: 380,
        mrp: 450,
        mainImage: IMAGES.honey,
        pack: "350 g glass bottle",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Handmade Living & Crafts",
        rating: 4.9,
        reviewsCount: 74,
        description: "Directly harvested from wild forest beehives, unfiltered, unheated, and loaded with natural pollen.",
      },
      {
        productName: "Handmade Macrame Boho Wall Hanging",
        categorySlug: "handmade-living-crafts",
        subcategoryName: "Macrame Boho Wall Decor",
        primarySeller: "indore3",
        price: 599,
        mrp: 899,
        mainImage: IMAGES.macrame,
        pack: "1 pc (18 x 24 inches)",
        foodType: "None",
        isHomemade: true,
        homemadeCategory: "Handmade Living & Crafts",
        rating: 4.8,
        reviewsCount: 36,
        description: "Hand-knotted 100% natural cotton cord bohemian wall tapestry on natural driftwood bar.",
      },

      // --- SAREES & WEDDING ETHNIC (priyank@gmail.com) ---
      {
        productName: "Pure Kanjivaram Zari Silk Saree (Crimson Red)",
        categorySlug: "saadi-sarees",
        subcategoryName: "Banarasi Silk Sarees",
        primarySeller: "indore3",
        price: 2499,
        mrp: 3999,
        mainImage: IMAGES.sareeSilk,
        pack: "6.3 meters with blouse piece",
        foodType: "None",
        rating: 4.9,
        reviewsCount: 88,
        description: "Handwoven lustrous pure silk saree with opulent golden zari border and royal peacock pallu motif.",
      },
      {
        productName: "Authentic Chanderi Handloom Cotton-Silk Saree",
        categorySlug: "saadi-sarees",
        subcategoryName: "Chanderi Silk Sarees",
        primarySeller: "indore3",
        price: 1899,
        mrp: 2799,
        mainImage: IMAGES.sareeBanarasi,
        pack: "6.3 meters with blouse",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 64,
        description: "Lightweight traditional Madhya Pradesh Chanderi saree woven with golden zari booties and delicate border.",
      },
      {
        productName: "Embroidered Party Wear Georgette Saree",
        categorySlug: "saadi-sarees",
        subcategoryName: "Party Wear Georgette Sarees",
        primarySeller: "indore3",
        price: 1499,
        mrp: 2299,
        mainImage: IMAGES.sareeParty,
        pack: "5.5 meters",
        foodType: "None",
        rating: 4.7,
        reviewsCount: 52,
        description: "Flowing midnight blue georgette saree embellished with delicate sequins and scalloped lace.",
      },
      {
        productName: "Bridal Crimson Red Embroidered Lehenga Choli",
        categorySlug: "wedding-ethnic-wear",
        subcategoryName: "Bridal Lehengas & Sherwanis",
        primarySeller: "indore3",
        price: 5499,
        mrp: 8999,
        mainImage: IMAGES.lehenga,
        pack: "Semi-Stitched Free Size",
        foodType: "None",
        rating: 4.9,
        reviewsCount: 78,
        description: "Heavy velvet bridal lehenga flared with intricate dori, gota patti, and stone embroidery.",
      },
      {
        productName: "Royal Designer Men's Silk Sherwani Set",
        categorySlug: "wedding-ethnic-wear",
        subcategoryName: "Bridal Lehengas & Sherwanis",
        primarySeller: "indore3",
        price: 4999,
        mrp: 7499,
        mainImage: IMAGES.kurta,
        pack: "Size 40 (Includes Churidar & Stole)",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 41,
        description: "Ivory raw silk sherwani handcrafted with thread resham embroidery and embossed mandarin collar.",
      },

      // --- BEAUTY & COSMETICS (priyank@gmail.com) ---
      {
        productName: "Mamaearth Vitamin C Radiance Face Serum",
        categorySlug: "beauty-cosmetics",
        subcategoryName: "Skincare & Lotions",
        primarySeller: "indore3",
        price: 399,
        mrp: 499,
        mainImage: IMAGES.faceSerum,
        pack: "30 ml",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 115,
        description: "Enriched with 10% pure vitamin C and turmeric to brighten complexion and reduce hyperpigmentation.",
      },
      {
        productName: "Forest Ayurvedic Bhringraj Anti-Hairfall Shampoo",
        categorySlug: "beauty-cosmetics",
        subcategoryName: "Hair Care & Shampoos",
        primarySeller: "indore3",
        price: 450,
        mrp: 599,
        mainImage: IMAGES.shampoo,
        pack: "250 ml",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 92,
        description: "Sulphate-free herbal scalp cleanser infused with bhringraj, amla, shikakai, and neem extracts.",
      },
      {
        productName: "Maybelline SuperStay Matte Ink Liquid Lipstick",
        categorySlug: "beauty-cosmetics",
        subcategoryName: "Makeup Essentials",
        primarySeller: "indore3",
        price: 549,
        mrp: 699,
        mainImage: IMAGES.lipstick,
        pack: "5 ml",
        foodType: "None",
        rating: 4.9,
        reviewsCount: 138,
        description: "Up to 16-hour saturated liquid matte finish with precision arrow applicator for intense pigment.",
      },
      {
        productName: "Nivea Soft Light Moisturizing Cream",
        categorySlug: "beauty-cosmetics",
        subcategoryName: "Skincare & Lotions",
        primarySeller: "indore3",
        price: 185,
        mrp: 230,
        mainImage: IMAGES.moisturizer,
        pack: "200 ml",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 165,
        description: "Fast-absorbing light moisturizing cream with jojoba oil and Vitamin E for soft, nourished skin.",
      },

      // --- FASHION & LIFESTYLE (priyank@gmail.com) ---
      {
        productName: "Classic Premium Pure Cotton Crew Neck T-Shirt",
        categorySlug: "fashion-lifestyle",
        subcategoryName: "Casual Wear & Tops",
        primarySeller: "indore3",
        price: 499,
        mrp: 799,
        mainImage: IMAGES.tshirt,
        pack: "Size L (Black)",
        foodType: "None",
        rating: 4.7,
        reviewsCount: 82,
        description: "180 GSM combed bio-washed breathable cotton t-shirt with ribbed crew neck.",
      },
      {
        productName: "Designer Vegan Leather Shoulder Tote Handbag",
        categorySlug: "fashion-lifestyle",
        subcategoryName: "Handbags & Clutches",
        primarySeller: "indore3",
        price: 999,
        mrp: 1899,
        mainImage: IMAGES.handbag,
        pack: "Spacious Multi-Pocket Bag",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 59,
        description: "Cruelty-free textured faux leather handbag with zip closure and gold-tone metal hardware.",
      },
      {
        productName: "Men's Lightweight Breathable Canvas Sneakers",
        categorySlug: "fashion-lifestyle",
        subcategoryName: "Footwear & Sandals",
        primarySeller: "indore3",
        price: 799,
        mrp: 1499,
        mainImage: IMAGES.sneakers,
        pack: "UK 8 (White & Blue)",
        foodType: "None",
        rating: 4.6,
        reviewsCount: 64,
        description: "Everyday casual lifestyle sneakers with cushioned foam insole and slip-resistant rubber outsole.",
      },
    ];

    console.log(`Total catalog items defined: ${catalogItems.length}`);


    // ==========================================
    // 4. UPSERT PRODUCTS & MATCHING INVENTORIES
    // ==========================================
    console.log("\n--- STEP 4: Seeding Products & Inventories for Sellers ---");

    // Map seller references
    const sellerLookup = {
      indore1: indoreSeller1._id as mongoose.Types.ObjectId,
      indore2: indoreSeller2._id as mongoose.Types.ObjectId,
      indore3: indoreSeller3._id as mongoose.Types.ObjectId,
      pune: puneSeller._id as mongoose.Types.ObjectId,
      mumbai: mumbaiSeller._id as mongoose.Types.ObjectId,
      delhi: delhiSeller._id as mongoose.Types.ObjectId,
    };

    let totalProductsSeeded = 0;
    const sareeProductIds: mongoose.Types.ObjectId[] = [];
    const seededProductMap = new Map<string, any>();

    // Helper to upsert a product document and its inventory
    async function upsertProductAndInventory(item: CatalogItem, targetSellerId: mongoose.Types.ObjectId) {
      const categoryDoc = categoryModelMap.get(item.categorySlug);
      if (!categoryDoc) return null;

      const subDoc = subcategoryModelMap.get(`${item.categorySlug}::${item.subcategoryName}`);
      const headerCatId = categoryDoc.headerCategoryId;
      const discountPercent = Math.round(((item.mrp - item.price) / item.mrp) * 100);

      const productDoc = await Product.findOneAndUpdate(
        { productName: item.productName, seller: targetSellerId },
        {
          productName: item.productName,
          category: categoryDoc._id,
          subcategory: subDoc ? subDoc._id : null,
          headerCategoryId: headerCatId || null,
          seller: targetSellerId,
          price: item.price,
          discPrice: item.price,
          compareAtPrice: item.mrp,
          stock: 100,
          mainImage: item.mainImage,
          galleryImages: [item.mainImage],
          rating: item.rating,
          reviewsCount: item.reviewsCount,
          discount: discountPercent,
          pack: item.pack,
          foodType: item.foodType,
          status: "Active",
          publish: true,
          isAvailable: true,
          isHomemade: !!item.isHomemade,
          homemadeCategory: item.homemadeCategory || (item.isHomemade ? categoryDoc.name : undefined),
          description: item.description,
          smallDescription: item.pack ? `${item.productName} - ${item.pack}` : item.productName,
        },
        { upsert: true, new: true }
      );

      // Upsert matching Inventory
      await Inventory.findOneAndUpdate(
        { product: productDoc._id },
        {
          product: productDoc._id,
          seller: targetSellerId,
          currentStock: 100,
          reservedStock: 0,
          availableStock: 100,
          lowStockThreshold: 5,
          reorderLevel: 10,
          lastRestockedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      totalProductsSeeded++;
      seededProductMap.set(item.productName, productDoc);

      if (item.categorySlug === "saadi-sarees") {
        sareeProductIds.push(productDoc._id as mongoose.Types.ObjectId);
      }

      return productDoc;
    }

    // A) Seed for Indore Sellers (indore1, indore2, indore3)
    console.log("Seeding catalog for Indore sellers...");
    for (const item of catalogItems) {
      const sellerId = sellerLookup[item.primarySeller];
      await upsertProductAndInventory(item, sellerId);
    }
    console.log(`✓ Seeded ${catalogItems.length} products for Indore sellers.`);

    // B) Seed ALL products for Pune Seller (Crucial: default UI location is Pune, so Pune users see 100% of catalog!)
    console.log("Seeding complete catalog for Pune seller (18.5204, 73.8567)...");
    for (const item of catalogItems) {
      await upsertProductAndInventory(item, sellerLookup.pune);
    }
    console.log(`✓ Seeded ${catalogItems.length} products for Pune seller.`);

    // C) Seed Grocery items for Mumbai & Delhi
    console.log("Seeding core grocery products for Mumbai & Delhi sellers...");
    const coreGroceryItems = catalogItems.filter(
      (i) => i.categorySlug === "fruits-vegetables" || i.categorySlug === "atta-rice-dal" || i.categorySlug === "dairy-eggs" || i.categorySlug === "cooking-oils-ghee"
    );
    for (const item of coreGroceryItems) {
      await upsertProductAndInventory(item, sellerLookup.mumbai);
      await upsertProductAndInventory(item, sellerLookup.delhi);
    }
    console.log(`✓ Seeded ${coreGroceryItems.length} core items for Mumbai and Delhi.`);
    console.log(`Total product instances created/verified: ${totalProductsSeeded}`);

    // D) Ensure 100% of all products in the database have active Inventory
    const allExistingProds = await Product.find({ status: "Active" });
    let backfilledInv = 0;
    for (const ep of allExistingProds) {
      const invExists = await Inventory.findOne({ product: ep._id });
      if (!invExists) {
        await Inventory.create({
          product: ep._id,
          seller: ep.seller,
          currentStock: 100,
          reservedStock: 0,
          availableStock: 100,
          lowStockThreshold: 5,
          reorderLevel: 10,
          lastRestockedAt: new Date(),
        });
        backfilledInv++;
      }
    }
    console.log(`✓ Verified and backfilled ${backfilledInv} missing inventory records across all active products.`);


    // ==========================================
    // 5. SEED SHOP ADS (HERO CAROUSEL)
    // ==========================================
    console.log("\n--- STEP 5: Seeding ShopAds (Hero Carousel Banners) ---");
    const shopAdsData = [
      {
        shopName: "Gourmet Garden",
        tagline: "Farm Fresh Produce Delivered in 10 Mins",
        description: "100% organic farm vegetables & juicy fresh fruits directly to your doorstep.",
        imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200",
        badge: "10 MIN DELIVERY",
        badgeColor: "#10b981",
        ctaText: "Shop Fresh",
        ctaLink: "/category/fruits-vegetables",
        order: 1,
        isActive: true,
      },
      {
        shopName: "Hello Local Grocery",
        tagline: "Mega Savings on Atta, Dal & Cooking Oils",
        description: "Wholesale prices on daily pantry staples with extra 25% discount this week.",
        imageUrl: "https://images.unsplash.com/photo-1534723452862-4c874e70d6f2?auto=format&fit=crop&q=80&w=1200",
        badge: "MEGA SAVINGS",
        badgeColor: "#fbbf24",
        ctaText: "Order Staples",
        ctaLink: "/category/atta-rice-dal",
        order: 2,
        isActive: true,
      },
      {
        shopName: "Indore Hot Kitchen",
        tagline: "Sizzling Pizzas, Burgers & Biryani",
        description: "Freshly prepared chef specialties delivered piping hot in insulated bags.",
        imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=1200",
        badge: "HOT & FRESH",
        badgeColor: "#ef4444",
        ctaText: "Order Food",
        ctaLink: "/category/pizza-burgers",
        order: 3,
        isActive: true,
      },
      {
        shopName: "Festive Sarees & Ethnic Hub",
        tagline: "Handwoven Banarasi & Kanjivaram Sarees",
        description: "Exquisite bridal lehengas, zari silk sarees & designer kurtas for wedding season.",
        imageUrl: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&q=80&w=1200",
        badge: "NEW ARRIVALS",
        badgeColor: "#ec4899",
        ctaText: "Browse Sarees",
        ctaLink: "/category/saadi-sarees",
        order: 4,
        isActive: true,
      },
      {
        shopName: "Beauty & Glow Lounge",
        tagline: "Radiant Skincare & Makeup Essentials",
        description: "Nourish your skin with top dermatologically tested serums, shampoos and lipsticks.",
        imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=1200",
        badge: "GLOW UP",
        badgeColor: "#8b5cf6",
        ctaText: "Explore Beauty",
        ctaLink: "/category/beauty-cosmetics",
        order: 5,
        isActive: true,
      },
      {
        shopName: "Artisanal Bakes & Sweets",
        tagline: "Pure Desi Ghee Ladoos & Dutch Truffle Cakes",
        description: "Handcrafted festive mithai and freshly baked celebration cakes.",
        imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=1200",
        badge: "HOMEMADE",
        badgeColor: "#f59e0b",
        ctaText: "Taste Sweets",
        ctaLink: "/category/bakery-cakes",
        order: 6,
        isActive: true,
      },
    ];

    for (const ad of shopAdsData) {
      await ShopAd.findOneAndUpdate(
        { shopName: ad.shopName },
        ad,
        { upsert: true, new: true }
      );
    }
    console.log(`✓ Seeded ${shopAdsData.length} ShopAds for hero carousel.`);


    // ==========================================
    // 6. SEED PROMO STRIPS (DYNAMIC DISCOUNTS)
    // ==========================================
    console.log("\n--- STEP 6: Seeding PromoStrips ---");

    const fruitsCatDoc = categoryModelMap.get("fruits-vegetables");
    const attaCatDoc = categoryModelMap.get("atta-rice-dal");
    const dairyCatDoc = categoryModelMap.get("dairy-eggs");
    const oilCatDoc = categoryModelMap.get("cooking-oils-ghee");
    const fashionCatDoc = categoryModelMap.get("fashion-lifestyle");
    const saadiCatDoc = categoryModelMap.get("saadi-sarees");
    const pizzaCatDoc = categoryModelMap.get("pizza-burgers");
    const bakeryCatDoc = categoryModelMap.get("bakery-cakes");

    const dealProductNames = [
      "Farm Fresh Sharbati Wheat Atta",
      "Daawat Rozana Gold Basmati Rice",
      "Amul Taaza Homogenised Toned Milk",
      "Overloaded Farmhouse Veg Pizza",
      "Pure Kanjivaram Zari Silk Saree (Crimson Red)",
    ];
    const dealProductIds: mongoose.Types.ObjectId[] = [];
    for (const name of dealProductNames) {
      const p = seededProductMap.get(name);
      if (p) dealProductIds.push(p._id);
    }

    const promoStripsData = [
      {
        headerCategorySlug: "all",
        heading: "SUPER SAVINGS FESTIVAL",
        saleText: "MEGA SALE",
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        crazyDealsTitle: "LIGHTNING DEALS",
        featuredProducts: dealProductIds,
        categoryCards: [
          { categoryId: fruitsCatDoc?._id, title: "Fresh Fruits & Veggies", badge: "Up to 40% OFF", discountPercentage: 40, order: 1 },
          { categoryId: attaCatDoc?._id, title: "Atta, Rice & Dals", badge: "Min 25% OFF", discountPercentage: 25, order: 2 },
          { categoryId: dairyCatDoc?._id, title: "Dairy & Breakfast", badge: "Flat 20% OFF", discountPercentage: 20, order: 3 },
          { categoryId: saadiCatDoc?._id, title: "Banarasi & Silk Sarees", badge: "Up to 50% OFF", discountPercentage: 50, order: 4 },
        ].filter((c) => c.categoryId),
        isActive: true,
        order: 1,
      },
      {
        headerCategorySlug: "grocery",
        heading: "PANTRY RESTOCK DEALS",
        saleText: "GROCERY FEST",
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        crazyDealsTitle: "STAPLES SPECIAL",
        featuredProducts: dealProductIds.slice(0, 3),
        categoryCards: [
          { categoryId: attaCatDoc?._id, title: "Wheat Atta & Basmati", badge: "Up to 30% OFF", discountPercentage: 30, order: 1 },
          { categoryId: oilCatDoc?._id, title: "Cooking Oils & Desi Ghee", badge: "Up to 35% OFF", discountPercentage: 35, order: 2 },
          { categoryId: fruitsCatDoc?._id, title: "Direct Mandi Veggies", badge: "Lowest Price", discountPercentage: 20, order: 3 },
        ].filter((c) => c.categoryId),
        isActive: true,
        order: 2,
      },
      {
        headerCategorySlug: "food",
        heading: "FOODIES SPECIAL CRAVINGS",
        saleText: "HOT BITES",
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        crazyDealsTitle: "CHEF SPECIALS",
        featuredProducts: dealProductIds.slice(3, 5),
        categoryCards: [
          { categoryId: pizzaCatDoc?._id, title: "Cheesy Pizzas & Burgers", badge: "Flat 25% OFF", discountPercentage: 25, order: 1 },
          { categoryId: bakeryCatDoc?._id, title: "Dutch Truffle Cakes", badge: "Flat 20% OFF", discountPercentage: 20, order: 2 },
        ].filter((c) => c.categoryId),
        isActive: true,
        order: 3,
      },
      {
        headerCategorySlug: "fashion",
        heading: "WEDDING & ETHNIC LOOKS",
        saleText: "TRENDING",
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        crazyDealsTitle: "RUNWAY STYLES",
        featuredProducts: dealProductIds.slice(4, 5),
        categoryCards: [
          { categoryId: saadiCatDoc?._id, title: "Pure Kanjivaram Sarees", badge: "Up to 45% OFF", discountPercentage: 45, order: 1 },
          { categoryId: fashionCatDoc?._id, title: "Casual Wear & Handbags", badge: "Up to 50% OFF", discountPercentage: 50, order: 2 },
        ].filter((c) => c.categoryId),
        isActive: true,
        order: 4,
      },
    ];

    for (const p of promoStripsData) {
      await PromoStrip.findOneAndUpdate(
        { headerCategorySlug: p.headerCategorySlug },
        p,
        { upsert: true, new: true }
      );
    }
    console.log(`✓ Seeded ${promoStripsData.length} PromoStrips.`);


    // ==========================================
    // 7. SEED HOME SECTIONS (HOMEPAGE SHELVES)
    // ==========================================
    console.log("\n--- STEP 7: Configuring HomeSections ---");

    const vegCat = categoryModelMap.get("veg-food-delights");
    const nonVegCat = categoryModelMap.get("non-veg-delights");
    const fashionCat = categoryModelMap.get("fashion-lifestyle");
    const pizzaCat = categoryModelMap.get("pizza-burgers");
    const beautyCat = categoryModelMap.get("beauty-cosmetics");
    const fruitsCat = categoryModelMap.get("fruits-vegetables");
    const attaCat = categoryModelMap.get("atta-rice-dal");
    const snacksCat = categoryModelMap.get("snacks-munchies");
    const weddingCat = categoryModelMap.get("wedding-ethnic-wear");
    const saadiCat = categoryModelMap.get("saadi-sarees");

    const homeSectionsData = [
      {
        slug: "grocery-kichen",
        title: "Grocery & Kitchen Essentials",
        categories: [fruitsCat?._id, attaCat?._id, snacksCat?._id].filter(Boolean),
        displayType: "categories",
        order: 1,
      },
      {
        slug: "pizza-burger-fast-food",
        title: "Pizza Burger 🍔 Fast Food",
        categories: [pizzaCat?._id].filter(Boolean),
        displayType: "categories",
        order: 2,
      },
      {
        slug: "veg-food",
        title: "Veg Food Delights 🥗",
        categories: [vegCat?._id].filter(Boolean),
        displayType: "categories",
        order: 3,
      },
      {
        slug: "non-veg-food",
        title: "Non Veg Food Favorites 🍗",
        categories: [nonVegCat?._id].filter(Boolean),
        displayType: "categories",
        order: 4,
      },
      {
        slug: "unlimited-fashion",
        title: "Unlimited Fashion & Sarees 👗",
        categories: [fashionCat?._id, saadiCat?._id].filter(Boolean),
        displayType: "categories",
        order: 5,
      },
      {
        slug: "wedding-dress",
        title: "Wedding 💒 Bridal Lehengas 💍",
        categories: [weddingCat?._id, saadiCat?._id].filter(Boolean),
        displayType: "categories",
        order: 6,
      },
      {
        slug: "beauty",
        title: "Beauty & Skincare Glow 😍",
        categories: [beautyCat?._id].filter(Boolean),
        displayType: "categories",
        order: 7,
      },
      {
        slug: "saadi",
        title: "Trending Silk & Party Sarees",
        products: sareeProductIds.slice(0, 6),
        displayType: "products",
        order: 8,
      },
    ];

    for (const sec of homeSectionsData) {
      await HomeSection.findOneAndUpdate(
        { slug: sec.slug },
        {
          title: sec.title,
          slug: sec.slug,
          categories: sec.categories || [],
          products: sec.products || [],
          displayType: sec.displayType,
          isActive: true,
          order: sec.order,
        },
        { upsert: true, new: true }
      );
    }
    console.log(`✓ Configured ${homeSectionsData.length} HomeSections.`);


    // ==========================================
    // 8. BESTSELLER CARDS & LOWEST PRICES DEALS
    // ==========================================
    console.log("\n--- STEP 8: Seeding Bestseller Cards & Lowest Prices Deals ---");

    const bestsellerDefs = [
      {
        name: "Dairy & Breakfast Corner",
        category: categoryModelMap.get("dairy-eggs")?._id,
        order: 1,
      },
      {
        name: "Daily Grocery Essentials",
        category: categoryModelMap.get("atta-rice-dal")?._id,
        order: 2,
      },
      {
        name: "Fresh Bakery & Cakes",
        category: categoryModelMap.get("bakery-cakes")?._id,
        order: 3,
      },
      {
        name: "Indian Festive Sarees",
        category: categoryModelMap.get("saadi-sarees")?._id,
        order: 4,
      },
    ];

    for (const b of bestsellerDefs) {
      if (b.category) {
        await BestsellerCard.findOneAndUpdate(
          { name: b.name },
          {
            name: b.name,
            category: b.category,
            order: b.order,
            isActive: true,
          },
          { upsert: true, new: true }
        );
      }
    }
    console.log(`✓ Seeded ${bestsellerDefs.length} BestsellerCards.`);

    const lowestDeals = [
      "Farm Fresh Sharbati Wheat Atta",
      "Daawat Rozana Gold Basmati Rice",
      "Tata Sampann High Protein Toor Dal",
      "Amul Taaza Homogenised Toned Milk",
      "Fortune Kachi Ghani Pure Mustard Oil",
      "Haldiram's Famous Aloo Bhujia",
      "Smoky BBQ Paneer Burger",
      "Pure Kanjivaram Zari Silk Saree (Crimson Red)",
    ];

    let lOrder = 1;
    for (const pName of lowestDeals) {
      const prod = seededProductMap.get(pName);
      if (prod) {
        await LowestPricesProduct.findOneAndUpdate(
          { product: prod._id },
          {
            product: prod._id,
            order: lOrder++,
            isActive: true,
          },
          { upsert: true, new: true }
        );
      }
    }
    console.log(`✓ Seeded ${lowestDeals.length} LowestPricesProduct deals.`);


    // ==========================================
    // 9. LINK CURATED SPECIALTY SHOPS
    // ==========================================
    console.log("\n--- STEP 9: Linking Curated Specialty Shops ---");
    const allProductDocs = Array.from(seededProductMap.values());
    const dairyShopsProds = allProductDocs.filter((p: any) =>
      p.productName.includes("Milk") || p.productName.includes("Paneer") || p.productName.includes("Eggs") || p.productName.includes("Butter")
    );
    const giftShopsProds = allProductDocs.filter((p: any) =>
      p.productName.includes("Cake") || p.productName.includes("Saree") || p.productName.includes("Candle") || p.productName.includes("Lehenga")
    );
    const spiritualShopsProds = allProductDocs.filter((p: any) =>
      p.productName.includes("Candle") || p.productName.includes("Honey") || p.productName.includes("Ghee")
    );

    if (dairyShopsProds.length > 0) {
      await Shop.findOneAndUpdate(
        { storeId: "dairy" },
        { $set: { products: dairyShopsProds.map((p) => p._id) } }
      );
    }
    if (giftShopsProds.length > 0) {
      await Shop.findOneAndUpdate(
        { storeId: "e-gift-store" },
        { $set: { products: giftShopsProds.map((p) => p._id) } }
      );
    }
    if (spiritualShopsProds.length > 0) {
      await Shop.findOneAndUpdate(
        { storeId: "spiritual-store" },
        { $set: { products: spiritualShopsProds.map((p) => p._id) } }
      );
    }
    console.log("✓ Curated Shops linked with catalog products.");


    // ==========================================
    // 10. CLEAR CACHE
    // ==========================================
    console.log("\n--- STEP 10: Invalidate Caches ---");
    try {
      cache.clear();
      console.log("✓ In-memory cache cleared successfully.");
    } catch (cErr) {
      console.warn("Cache clear note:", cErr);
    }

    console.log("\n=======================================================");
    console.log("🎉 RICH STOREFRONT SEEDING COMPLETED WITH ZERO ERRORS!");
    console.log("=======================================================\n");

  } catch (error) {
    console.error("FATAL ERROR in seedRichStorefront:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedRichStorefront();
