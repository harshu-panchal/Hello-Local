import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "../config/db";
import HeaderCategory from "../models/HeaderCategory";
import Category from "../models/Category";
import SubCategory from "../models/SubCategory";
import Product from "../models/Product";
import Inventory from "../models/Inventory";
import Seller from "../models/Seller";
import HomeSection from "../models/HomeSection";
import BestsellerCard from "../models/BestsellerCard";
import LowestPricesProduct from "../models/LowestPricesProduct";
import Shop from "../models/Shop";
import { cache } from "../utils/cache";

dotenv.config();

// High Quality Image Asset URLs (Unsplash CDN optimized for e-commerce)
const IMAGES = {
  // Category Hero Images
  fruitsVeg: "https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&w=600&q=80",
  attaRice: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
  cookingOil: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80",
  snacks: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80",
  dairy: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
  bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  vegFood: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
  nonVegFood: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80",
  pizzaBurger: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
  beauty: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80",
  fashion: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=600&q=80",
  wedding: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80",
  saadi: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=600&q=80",
  homemadePickle: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
  homemadeSweets: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=600&q=80",
  homemadeCrafts: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80",

  // Specific Product Images
  attaProduct: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  riceProduct: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80",
  dalProduct: "https://images.unsplash.com/photo-1585994192701-f1a505c817ea?auto=format&fit=crop&w=600&q=80",
  tomatoProduct: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80",
  appleProduct: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
  milkProduct: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
  paneerProduct: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80",
  eggsProduct: "https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=600&q=80",
  chipsProduct: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80",
  cakeProduct: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80",
  breadProduct: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  croissantProduct: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",
  pizzaProduct: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
  burgerProduct: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
  friesProduct: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80",
  shahiPaneerProduct: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
  dalTadkaProduct: "https://images.unsplash.com/photo-1585994192701-f1a505c817ea?auto=format&fit=crop&w=600&q=80",
  biryaniProduct: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80",
  butterChickenProduct: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80",
  sareeSilkProduct: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=600&q=80",
  sareeBanarasiProduct: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80",
  sareePartyProduct: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80",
  lehengaProduct: "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&w=600&q=80",
  faceSerumProduct: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80",
  shampooProduct: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&w=600&q=80",
  lipstickProduct: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=600&q=80",
  handbagProduct: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80",
  candleProduct: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80",
  honeyProduct: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=600&q=80",
  pickleProduct: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
  ladooProduct: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=600&q=80",
};

async function seedCatalog() {
  try {
    await connectDB();
    console.log("Connected to MongoDB for catalog seeding...");

    // 1. Verify and configure Sellers
    console.log("1. Setting up target sellers...");
    
    // Seller 1: vendor9111966732@hellolocal.com
    const seller1 = await Seller.findOneAndUpdate(
      { email: "vendor9111966732@hellolocal.com" },
      {
        storeName: "Hello Local Vendor Store",
        sellerName: "Vendor 9111966732",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 80,
        address: "South Tukoganj, Indore, Madhya Pradesh 452001, India",
        city: "Indore",
        location: {
          type: "Point",
          coordinates: [75.857726, 22.719569], // Indore
        },
      },
      { upsert: false, new: true }
    );
    if (!seller1) throw new Error("Seller 1 (vendor9111966732@hellolocal.com) not found!");
    console.log(`✓ Seller 1: ${seller1.storeName} (${seller1._id})`);

    // Seller 2: Testseller
    const seller2 = await Seller.findOneAndUpdate(
      { storeName: "Testseller" },
      {
        sellerName: "Test Seller Admin",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 30,
        address: "RNT Marg, South Tukoganj, Indore, Madhya Pradesh 452001, India",
        city: "Indore",
        location: {
          type: "Point",
          coordinates: [75.871491, 22.717208], // Indore
        },
      },
      { upsert: false, new: true }
    );
    if (!seller2) throw new Error("Seller 2 (Testseller) not found!");
    console.log(`✓ Seller 2: ${seller2.storeName} (${seller2._id})`);

    // Seller 3: Demo Seller (priyank@gmail.com)
    const seller3 = await Seller.findOneAndUpdate(
      { email: "priyank@gmail.com" },
      {
        storeName: "Indore Fashion & Organic Mart",
        sellerName: "Priyank Patel",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 50,
        address: "Corporate House, RNT Marg, South Tukoganj, Indore, Madhya Pradesh 452001, India",
        city: "Indore",
        location: {
          type: "Point",
          coordinates: [75.871689, 22.717265], // Indore
        },
      },
      { upsert: false, new: true }
    );
    if (!seller3) throw new Error("Seller 3 (priyank@gmail.com) not found!");
    console.log(`✓ Seller 3: ${seller3.storeName} (${seller3._id})`);

    // 2. Fetch HeaderCategories
    console.log("2. Resolving Header Categories...");
    const headerCategoryDocs = await HeaderCategory.find({ status: "Published" }).lean();
    const headerMap = new Map<string, mongoose.Types.ObjectId>();
    for (const h of headerCategoryDocs) {
      headerMap.set(h.slug, h._id as mongoose.Types.ObjectId);
    }
    console.log(`Found ${headerMap.size} published HeaderCategories.`);

    // 3. Category & Subcategory definitions
    console.log("3. Seeding Categories and Subcategories...");

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
      console.log(`  Category: ${categoryDoc.name} (${categoryDoc._id})`);

      // Seed Subcategories
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

        // Also create a child Category document with parentId for complete dual-model compatibility
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

    // 4. Products Definition
    console.log("4. Seeding Products & Inventories across target sellers...");

    interface ProductSeed {
      productName: string;
      categorySlug: string;
      subcategoryName: string;
      sellerId: mongoose.Types.ObjectId;
      price: number;
      mrp: number;
      mainImage: string;
      galleryImages?: string[];
      pack?: string;
      foodType?: "Veg" | "Non-Veg" | "None";
      isHomemade?: boolean;
      homemadeCategory?: string;
      rating: number;
      reviewsCount: number;
      variations?: any[];
      description?: string;
    }

    const productsToSeed: ProductSeed[] = [
      // --- SELLER 1 (vendor9111966732@hellolocal.com): Grocery, Fruits, Vegetables, Atta, Dal, Dairy ---
      {
        productName: "Farm Fresh Sharbati Wheat Atta",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Chakki Atta & Flours",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 229,
        mrp: 260,
        mainImage: IMAGES.attaProduct,
        pack: "5 kg",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 84,
        description: "100% pure stone-ground Madhya Pradesh Sharbati whole wheat chakki atta for ultra soft rotis.",
      },
      {
        productName: "Daawat Rozana Gold Basmati Rice",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Premium Basmati Rice",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 99,
        mrp: 135,
        mainImage: IMAGES.riceProduct,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 65,
        description: "Aromatic long-grain premium Rozana basmati rice perfect for daily pulao and steamed rice.",
      },
      {
        productName: "Tata Sampann High Protein Toor Dal",
        categorySlug: "atta-rice-dal",
        subcategoryName: "Pulses & Dals",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 165,
        mrp: 195,
        mainImage: IMAGES.dalProduct,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 92,
        description: "Unpolished, naturally processed rich toor dal with maximum nutrient and protein retention.",
      },
      {
        productName: "Fresh Red Hybrid Tomatoes",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Vegetables",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 38,
        mrp: 50,
        mainImage: IMAGES.tomatoProduct,
        pack: "1 kg",
        foodType: "Veg",
        rating: 4.6,
        reviewsCount: 42,
        description: "Firm, farm-picked ripe red tomatoes sourced directly from local Indore vegetable mandis.",
      },
      {
        productName: "Shimla Royal Crisp Apples",
        categorySlug: "fruits-vegetables",
        subcategoryName: "Fresh Fruits",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 140,
        mrp: 180,
        mainImage: IMAGES.appleProduct,
        pack: "1 kg (4-5 pcs)",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 56,
        description: "Sweet, crunchy and juicy red royal apples directly harvested from Himachal orchards.",
      },
      {
        productName: "Amul Taaza Homogenised Toned Milk",
        categorySlug: "dairy-eggs",
        subcategoryName: "Fresh Milk & Paneer",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 70,
        mrp: 74,
        mainImage: IMAGES.milkProduct,
        pack: "1 Litre",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 120,
        description: "Fresh pasteurised toned milk with wholesome calcium and proteins for the whole family.",
      },
      {
        productName: "Fresh Indore Malai Paneer",
        categorySlug: "dairy-eggs",
        subcategoryName: "Fresh Milk & Paneer",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 99,
        mrp: 120,
        mainImage: IMAGES.paneerProduct,
        pack: "200 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 110,
        description: "Soft, melt-in-the-mouth cottage cheese crafted from pure full-cream buffalo milk.",
      },
      {
        productName: "Farm Fresh Brown Organic Eggs",
        categorySlug: "dairy-eggs",
        subcategoryName: "Farm Fresh Eggs",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 52,
        mrp: 65,
        mainImage: IMAGES.eggsProduct,
        pack: "Pack of 6",
        foodType: "Non-Veg",
        rating: 4.8,
        reviewsCount: 77,
        description: "Naturally laid country eggs rich in Omega-3 and natural yellow yolk.",
      },
      {
        productName: "Haldiram's Famous Aloo Bhujia",
        categorySlug: "snacks-munchies",
        subcategoryName: "Namkeen & Bhujia",
        sellerId: seller1._id as mongoose.Types.ObjectId,
        price: 48,
        mrp: 55,
        mainImage: IMAGES.chipsProduct,
        pack: "200 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 95,
        description: "Classic crisp, mildly spiced mint-flavoured potato and gram flour namkeen.",
      },

      // --- SELLER 2 (Testseller): Bakery, Fast Food, Pizzas, Burgers, Sweets, Homemade ---
      {
        productName: "Belgian Dark Truffle Celebration Cake",
        categorySlug: "bakery-cakes",
        subcategoryName: "Celebration Cakes & Pastries",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 549,
        mrp: 650,
        mainImage: IMAGES.cakeProduct,
        pack: "500 g",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 52,
        description: "Decadent rich layered chocolate cake covered in glossy Dutch truffle ganache.",
      },
      {
        productName: "Artisanal Multigrain Sourdough Bread",
        categorySlug: "bakery-cakes",
        subcategoryName: "Fresh Artisanal Breads",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 85,
        mrp: 110,
        mainImage: IMAGES.breadProduct,
        pack: "400 g",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 38,
        description: "Naturally fermented sourdough with toasted sunflower seeds, flaxseeds, and oats.",
      },
      {
        productName: "Overloaded Farmhouse Veg Pizza",
        categorySlug: "pizza-burgers",
        subcategoryName: "Gourmet Cheese Pizzas",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 279,
        mrp: 349,
        mainImage: IMAGES.pizzaProduct,
        pack: "Regular 8 inch",
        foodType: "Veg",
        rating: 4.8,
        reviewsCount: 68,
        description: "Loaded with fresh mozzarella, capsicum, sweet corn, mushrooms, and black olives on thin crust.",
      },
      {
        productName: "Smoky BBQ Paneer Burger",
        categorySlug: "pizza-burgers",
        subcategoryName: "Loaded Crispy Burgers",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 149,
        mrp: 189,
        mainImage: IMAGES.burgerProduct,
        pack: "1 pc",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 45,
        description: "Crispy grilled paneer patty topped with crunchy iceberg lettuce, melted cheese, and smoky sauce.",
      },
      {
        productName: "Crispy Peri Peri French Fries",
        categorySlug: "pizza-burgers",
        subcategoryName: "French Fries & Wraps",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 99,
        mrp: 130,
        mainImage: IMAGES.friesProduct,
        pack: "Large (150 g)",
        foodType: "Veg",
        rating: 4.6,
        reviewsCount: 39,
        description: "Golden crispy skin-on potato fries dusted with authentic African bird's eye peri peri seasoning.",
      },
      {
        productName: "Royal Shahi Paneer Handi",
        categorySlug: "veg-food-delights",
        subcategoryName: "Shahi Paneer & Curries",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 230,
        mrp: 280,
        mainImage: IMAGES.shahiPaneerProduct,
        pack: "Serves 1-2 (450 ml)",
        foodType: "Veg",
        rating: 4.9,
        reviewsCount: 88,
        description: "Rich Mughlai cottage cheese gravy blended with cashew paste, cream, and aromatic saffron.",
      },
      {
        productName: "Dal Tadka with Jeera Basmati",
        categorySlug: "veg-food-delights",
        subcategoryName: "Dal Tadka & Rice",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 180,
        mrp: 220,
        mainImage: IMAGES.dalTadkaProduct,
        pack: "Meal Box",
        foodType: "Veg",
        rating: 4.7,
        reviewsCount: 64,
        description: "Yellow lentils tempered with ghee, dry red chillies, and garlic served with aromatic jeera rice.",
      },
      {
        productName: "Old Delhi Murgh Butter Chicken",
        categorySlug: "non-veg-delights",
        subcategoryName: "Butter Chicken & Biryani",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 299,
        mrp: 360,
        mainImage: IMAGES.butterChickenProduct,
        pack: "Serves 2 (500 ml)",
        foodType: "Non-Veg",
        rating: 4.9,
        reviewsCount: 94,
        description: "Tender tandoori roasted chicken pieces simmered in silky tomato butter makhani gravy.",
      },
      {
        productName: "Hyderabadi Dum Chicken Biryani",
        categorySlug: "non-veg-delights",
        subcategoryName: "Butter Chicken & Biryani",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 260,
        mrp: 320,
        mainImage: IMAGES.biryaniProduct,
        pack: "Serves 1-2 with Raita",
        foodType: "Non-Veg",
        rating: 4.8,
        reviewsCount: 115,
        description: "Kachi yakhni style long grain basmati rice cooked on slow steam with tender marinated chicken.",
      },
      // Homemade culinary items for Testseller
      {
        productName: "Khandeshi Thecha Pickle (Handcrafted)",
        categorySlug: "pickles-chutneys",
        subcategoryName: "Khandeshi Thecha & Chutneys",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 199,
        mrp: 240,
        mainImage: IMAGES.pickleProduct,
        pack: "250 g jar",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Pickles & Chutneys",
        rating: 4.9,
        reviewsCount: 78,
        description: "Fiery green chilli and garlic paste pounded traditionally in stone mortar with cold-pressed peanut oil.",
      },
      {
        productName: "Pure Desi Ghee Besan Ladoo (Ghar Ka)",
        categorySlug: "homemade-bakes-sweets",
        subcategoryName: "Pure Ghee Besan Ladoo",
        sellerId: seller2._id as mongoose.Types.ObjectId,
        price: 250,
        mrp: 299,
        mainImage: IMAGES.ladooProduct,
        pack: "250 g box",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Homemade Bakes & Sweets",
        rating: 4.9,
        reviewsCount: 66,
        description: "Slow roasted gram flour ladoos with desi bilona cow ghee, cardamoms, and slivered almonds.",
      },

      // --- SELLER 3 (priyank@gmail.com - Indore Fashion & Organic Mart): Sarees, Wedding, Beauty, Crafts ---
      {
        productName: "Pure Kanjivaram Zari Silk Saree (Crimson Red)",
        categorySlug: "saadi-sarees",
        subcategoryName: "Banarasi Silk Sarees",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 2499,
        mrp: 3999,
        mainImage: IMAGES.sareeSilkProduct,
        galleryImages: [IMAGES.sareeBanarasiProduct, IMAGES.sareePartyProduct],
        pack: "6.3 meters with blouse piece",
        foodType: "None",
        rating: 4.9,
        reviewsCount: 54,
        description: "Handwoven lustrous pure silk saree with opulent golden zari border and royal peacock pallu motif.",
      },
      {
        productName: "Authentic Chanderi Handloom Cotton-Silk Saree",
        categorySlug: "saadi-sarees",
        subcategoryName: "Chanderi Silk Sarees",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 1899,
        mrp: 2799,
        mainImage: IMAGES.sareeBanarasiProduct,
        galleryImages: [IMAGES.sareeSilkProduct],
        pack: "6.3 meters with blouse",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 42,
        description: "Lightweight traditional Madhya Pradesh Chanderi saree woven with golden zari booties and delicate border.",
      },
      {
        productName: "Embroidered Party Wear Georgette Saree",
        categorySlug: "saadi-sarees",
        subcategoryName: "Party Wear Georgette Sarees",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 1499,
        mrp: 2299,
        mainImage: IMAGES.sareePartyProduct,
        pack: "5.5 meters",
        foodType: "None",
        rating: 4.7,
        reviewsCount: 36,
        description: "Flowing midnight blue georgette saree embellished with delicate sequins and scalloped lace.",
      },
      {
        productName: "Bridal Crimson Red Embroidered Lehenga Choli",
        categorySlug: "wedding-ethnic-wear",
        subcategoryName: "Bridal Lehengas & Sherwanis",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 5499,
        mrp: 8999,
        mainImage: IMAGES.lehengaProduct,
        pack: "Semi-Stitched Free Size",
        foodType: "None",
        rating: 4.9,
        reviewsCount: 48,
        description: "Heavy velvet bridal lehenga flared with intricate dori, gota patti, and stone embroidery.",
      },
      {
        productName: "Mamaearth Vitamin C Radiance Face Serum",
        categorySlug: "beauty-cosmetics",
        subcategoryName: "Skincare & Lotions",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 399,
        mrp: 499,
        mainImage: IMAGES.faceSerumProduct,
        pack: "30 ml",
        foodType: "None",
        rating: 4.7,
        reviewsCount: 82,
        description: "Enriched with 10% pure vitamin C and turmeric to brighten complexion and reduce hyperpigmentation.",
      },
      {
        productName: "Forest Ayurvedic Bhringraj Anti-Hairfall Shampoo",
        categorySlug: "beauty-cosmetics",
        subcategoryName: "Hair Care & Shampoos",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 450,
        mrp: 599,
        mainImage: IMAGES.shampooProduct,
        pack: "250 ml",
        foodType: "None",
        rating: 4.8,
        reviewsCount: 63,
        description: "Sulphate-free herbal scalp cleanser infused with bhringraj, amla, shikakai, and neem extracts.",
      },
      {
        productName: "Maybelline SuperStay Matte Ink Liquid Lipstick",
        categorySlug: "beauty-cosmetics",
        subcategoryName: "Makeup Essentials",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 549,
        mrp: 699,
        mainImage: IMAGES.lipstickProduct,
        pack: "5 ml",
        foodType: "None",
        rating: 4.9,
        reviewsCount: 91,
        description: "16-hour long-wear smudge-proof liquid matte lipstick with intense pigmentation and arrow applicator.",
      },
      {
        productName: "Designer Vegan Leather Tote Handbag",
        categorySlug: "fashion-lifestyle",
        subcategoryName: "Handbags & Clutches",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 999,
        mrp: 1499,
        mainImage: IMAGES.handbagProduct,
        pack: "1 pc",
        foodType: "None",
        rating: 4.6,
        reviewsCount: 29,
        description: "Spacious multi-compartment structured tote bag with durable gold-tone metallic hardware.",
      },
      // Homemade items for Seller 3
      {
        productName: "Hand-Poured Lavender & Vanilla Soy Candle",
        categorySlug: "handmade-living-crafts",
        subcategoryName: "Scented Soy Wax Candles",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 349,
        mrp: 450,
        mainImage: IMAGES.candleProduct,
        pack: "200 g glass jar",
        foodType: "None",
        isHomemade: true,
        homemadeCategory: "Handmade Living & Crafts",
        rating: 4.8,
        reviewsCount: 35,
        description: "Eco-friendly non-toxic soy wax candle hand-poured with pure French lavender and warm vanilla essential oils.",
      },
      {
        productName: "Cold-Pressed Raw Forest Honey (Unprocessed)",
        categorySlug: "handmade-living-crafts",
        subcategoryName: "Raw Forest Honey",
        sellerId: seller3._id as mongoose.Types.ObjectId,
        price: 360,
        mrp: 440,
        mainImage: IMAGES.honeyProduct,
        pack: "350 g glass jar",
        foodType: "Veg",
        isHomemade: true,
        homemadeCategory: "Handmade Living & Crafts",
        rating: 4.9,
        reviewsCount: 50,
        description: "Wild multi-floral raw honey harvested sustainably from Satpura forest beehives without heating.",
      },
    ];

    const seededProductsMap = new Map<string, any>();
    const sareeProductIds: mongoose.Types.ObjectId[] = [];

    for (const p of productsToSeed) {
      const categoryDoc = categoryModelMap.get(p.categorySlug);
      if (!categoryDoc) {
        console.warn(`Category ${p.categorySlug} not found for product ${p.productName}`);
        continue;
      }
      const subDoc = subcategoryModelMap.get(`${p.categorySlug}::${p.subcategoryName}`);
      const headerCatId = categoryDoc.headerCategoryId;

      const discountPercent = Math.round(((p.mrp - p.price) / p.mrp) * 100);

      const productDoc = await Product.findOneAndUpdate(
        { productName: p.productName, seller: p.sellerId },
        {
          productName: p.productName,
          category: categoryDoc._id,
          subcategory: subDoc ? subDoc._id : null,
          headerCategoryId: headerCatId || null,
          seller: p.sellerId,
          price: p.price,
          discPrice: p.price,
          compareAtPrice: p.mrp,
          stock: 50,
          mainImage: p.mainImage,
          galleryImages: p.galleryImages || [p.mainImage],
          rating: p.rating,
          reviewsCount: p.reviewsCount,
          discount: discountPercent,
          pack: p.pack || "",
          foodType: p.foodType || "None",
          status: "Active",
          publish: true,
          isAvailable: true,
          isHomemade: !!p.isHomemade,
          homemadeCategory: p.homemadeCategory || (p.isHomemade ? categoryDoc.name : undefined),
          description: p.description || p.productName,
          smallDescription: p.pack ? `${p.productName} - ${p.pack}` : p.productName,
        },
        { upsert: true, new: true }
      );

      seededProductsMap.set(p.productName, productDoc);

      if (p.categorySlug === "saadi-sarees") {
        sareeProductIds.push(productDoc._id as mongoose.Types.ObjectId);
      }

      // Upsert Inventory
      await Inventory.findOneAndUpdate(
        { product: productDoc._id },
        {
          product: productDoc._id,
          seller: p.sellerId,
          currentStock: 50,
          reservedStock: 0,
          availableStock: 50,
          lowStockThreshold: 5,
          reorderLevel: 10,
          lastRestockedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`  ✓ Product: ${productDoc.productName} -> ${p.price} INR (Stock: 50)`);
    }

    // Also update the 6 existing homemade products so they have correct categories instead of "test category"
    console.log("Updating existing test homemade products to proper categories...");
    const homemadeUpdates = [
      {
        name: "Khandeshi Thecha Pickle (Handcrafted)",
        categorySlug: "pickles-chutneys",
        subName: "Khandeshi Thecha & Chutneys",
      },
      {
        name: "Dark Chocolate Fudge Cake (Fresh Baked)",
        categorySlug: "homemade-bakes-sweets",
        subName: "Artisanal Chocolates & Brownies",
      },
      {
        name: "Pure Desi Ghee Besan Ladoo (Ghar Ka)",
        categorySlug: "homemade-bakes-sweets",
        subName: "Pure Ghee Besan Ladoo",
      },
      {
        name: "Handmade Macrame Boho Wall Hanging",
        categorySlug: "handmade-living-crafts",
        subName: "Macrame Boho Wall Decor",
      },
      {
        name: "Hand-Poured Lavender & Vanilla Soy Candle",
        categorySlug: "handmade-living-crafts",
        subName: "Scented Soy Wax Candles",
      },
      {
        name: "Cold-Pressed Raw Forest Honey (Unprocessed)",
        categorySlug: "handmade-living-crafts",
        subName: "Raw Forest Honey",
      },
    ];

    for (const item of homemadeUpdates) {
      const cat = categoryModelMap.get(item.categorySlug);
      const sub = subcategoryModelMap.get(`${item.categorySlug}::${item.subName}`);
      if (cat) {
        await Product.updateMany(
          { productName: item.name },
          {
            $set: {
              category: cat._id,
              subcategory: sub ? sub._id : null,
              headerCategoryId: cat.headerCategoryId || null,
              isHomemade: true,
              homemadeCategory: cat.name,
              status: "Active",
              publish: true,
            },
          }
        );
      }
    }

    // 5. Update HomeSections in MongoDB
    console.log("5. Updating dynamic HomeSections...");
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

    const sectionUpdates = [
      {
        slug: "veg-food",
        title: "Veg Food",
        categories: [vegCat?._id].filter(Boolean),
        displayType: "categories",
      },
      {
        slug: "non-veg-food",
        title: "Non Veg Food",
        categories: [nonVegCat?._id].filter(Boolean),
        displayType: "categories",
      },
      {
        slug: "unlimited-fashion",
        title: "Unlimited Fashion",
        categories: [fashionCat?._id, saadiCat?._id].filter(Boolean),
        displayType: "categories",
      },
      {
        slug: "pizza-burger-fast-food",
        title: "Pizza Burger 🍔 Fast food",
        categories: [pizzaCat?._id].filter(Boolean),
        displayType: "categories",
      },
      {
        slug: "beauty",
        title: "Beauty 😍",
        categories: [beautyCat?._id].filter(Boolean),
        displayType: "categories",
      },
      {
        slug: "grocery-kichen",
        title: "Grocery Kichen",
        categories: [fruitsCat?._id, attaCat?._id, snacksCat?._id].filter(Boolean),
        displayType: "categories",
      },
      {
        slug: "wedding-dress",
        title: "Wedding 💒💍 Dress 👗",
        categories: [weddingCat?._id, saadiCat?._id].filter(Boolean),
        displayType: "categories",
      },
      {
        slug: "saadi",
        title: "Saadi",
        products: sareeProductIds,
        displayType: "products",
      },
    ];

    for (const sec of sectionUpdates) {
      await HomeSection.findOneAndUpdate(
        { slug: sec.slug },
        {
          title: sec.title,
          slug: sec.slug,
          categories: sec.categories || [],
          products: sec.products || [],
          displayType: sec.displayType,
          isActive: true,
        },
        { upsert: true, new: true }
      );
      console.log(`  ✓ HomeSection "${sec.title}" configured`);
    }

    // 6. Seed BestsellerCards
    console.log("6. Seeding Bestseller Cards...");
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
    console.log(`  ✓ ${bestsellerDefs.length} BestsellerCards updated`);

    // 7. Seed LowestPricesProducts
    console.log("7. Seeding Lowest Prices Deals...");
    const lowestDeals = [
      "Farm Fresh Sharbati Wheat Atta",
      "Daawat Rozana Gold Basmati Rice",
      "Tata Sampann High Protein Toor Dal",
      "Amul Taaza Homogenised Toned Milk",
      "Haldiram's Famous Aloo Bhujia",
      "Smoky BBQ Paneer Burger",
    ];

    let lOrder = 1;
    for (const pName of lowestDeals) {
      const prod = seededProductsMap.get(pName);
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
    console.log(`  ✓ ${lowestDeals.length} LowestPricesProduct deals set`);

    // 8. Link products to curated specialty Shops
    console.log("8. Linking products to specialty Shops...");
    const allProductDocs = Array.from(seededProductsMap.values());
    const dairyShopsProds = allProductDocs.filter((p: any) =>
      p.productName.includes("Milk") || p.productName.includes("Paneer") || p.productName.includes("Eggs")
    );
    const giftShopsProds = allProductDocs.filter((p: any) =>
      p.productName.includes("Cake") || p.productName.includes("Saree") || p.productName.includes("Candle")
    );
    const bookShopsProds = allProductDocs.filter((p: any) =>
      p.productName.includes("Candle") || p.productName.includes("Craft") || p.productName.includes("Honey")
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
    if (bookShopsProds.length > 0) {
      await Shop.findOneAndUpdate(
        { storeId: "spiritual-store" },
        { $set: { products: bookShopsProds.map((p) => p._id) } }
      );
    }
    console.log("  ✓ Curated Shops linked with products");

    // 9. Clear cache
    console.log("9. Clearing in-memory and Redis caches...");
    try {
      cache.clear();
      console.log("  ✓ Cache cleared successfully");
    } catch (cErr) {
      console.warn("  Cache clear warning:", cErr);
    }

    console.log("\n==========================================");
    console.log("🎉 CATALOG SEEDING COMPLETED SUCCESSFULLY!");
    console.log("==========================================\n");
  } catch (error) {
    console.error("Error during catalog seeding:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedCatalog();
