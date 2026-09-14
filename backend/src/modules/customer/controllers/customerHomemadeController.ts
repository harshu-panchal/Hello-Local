import { Request, Response } from "express";
import mongoose from "mongoose";
import Product from "../../../models/Product";
import Seller from "../../../models/Seller";
import Category from "../../../models/Category";
import { findSellersWithinRange, calculateDistance } from "../../../utils/locationHelper";

export const HOMEMADE_CATEGORY_METADATA = [
  {
    id: "1",
    slug: "food",
    name: "Homemade Food",
    shortName: "Food",
    tagline: "Pure ingredients. Made with love. Delivered to your door.",
    icon: "🍲",
    accentBg: "bg-[#FFF6ED]",
    accentBorder: "border-[#FFEDD5]",
    accentText: "text-[#EA580C]",
    heroImage: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
    subcategories: [
      { id: "1-1", slug: "all", name: "All Food", icon: "🍽️" },
      { id: "1-2", slug: "tiffin-meals", name: "Tiffin & Home Meals", icon: "🍱" },
      { id: "1-3", slug: "pickles-chutneys", name: "Pickles & Chutneys", icon: "🫙" },
      { id: "1-4", slug: "papad-wafers", name: "Papad & Wafers", icon: "🫓" },
      { id: "1-5", slug: "masalas", name: "Masalas", icon: "🥣" },
      { id: "1-6", slug: "sweets-snacks", name: "Sweets & Snacks", icon: "🥟" },
    ],
  },
  {
    id: "2",
    slug: "bakery",
    name: "Bakery From Home",
    shortName: "Bakery",
    tagline: "Freshly baked cakes, cookies & breads without preservatives.",
    icon: "🧁",
    accentBg: "bg-[#FFF1F4]",
    accentBorder: "border-[#FFE4EA]",
    accentText: "text-[#FF2E7A]",
    heroImage: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80",
    subcategories: [
      { id: "2-1", slug: "all", name: "All Bakery", icon: "🧁" },
      { id: "2-2", slug: "cakes-pastries", name: "Cakes & Pastries", icon: "🎂" },
      { id: "2-3", slug: "cookies-biscuits", name: "Cookies & Biscuits", icon: "🍪" },
      { id: "2-4", slug: "artisanal-breads", name: "Artisanal Breads", icon: "🍞" },
      { id: "2-5", slug: "muffins", name: "Muffins & Cupcakes", icon: "🧁" },
    ],
  },
  {
    id: "3",
    slug: "handmade",
    name: "Handmade Products",
    shortName: "Handmade",
    tagline: "Unique handcrafted treasures made by passionate neighborhood artisans.",
    icon: "🧶",
    accentBg: "bg-[#FAF5FF]",
    accentBorder: "border-[#F3E8FF]",
    accentText: "text-[#9333EA]",
    heroImage: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80",
    subcategories: [
      { id: "3-1", slug: "all", name: "All Handmade", icon: "🧶" },
      { id: "3-2", slug: "crochet-knitting", name: "Crochet & Knitting", icon: "🧣" },
      { id: "3-3", slug: "macrame-decor", name: "Macrame Decor", icon: "🪴" },
      { id: "3-4", slug: "totes-bags", name: "Bags & Totes", icon: "👜" },
      { id: "3-5", slug: "handmade-jewelry", name: "Handmade Jewelry", icon: "💍" },
    ],
  },
  {
    id: "4",
    slug: "lifestyle",
    name: "Home & Lifestyle",
    shortName: "Home & Lifestyle",
    tagline: "Aromatherapy candles, natural soaps and cozy handmade home living.",
    icon: "🕯️",
    accentBg: "bg-[#F0FDF4]",
    accentBorder: "border-[#DCFCE7]",
    accentText: "text-[#16A34A]",
    heroImage: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80",
    subcategories: [
      { id: "4-1", slug: "all", name: "All Home & Lifestyle", icon: "🕯️" },
      { id: "4-2", slug: "scented-candles", name: "Scented Candles", icon: "🕯️" },
      { id: "4-3", slug: "natural-soaps", name: "Natural Soaps", icon: "🧼" },
      { id: "4-4", slug: "pottery-clay", name: "Pottery & Clay", icon: "🏺" },
      { id: "4-5", slug: "organic-planters", name: "Planters & Decor", icon: "🌱" },
    ],
  },
  {
    id: "5",
    slug: "natural",
    name: "Natural & Local",
    shortName: "Natural & Local",
    tagline: "Direct from farms and traditional home churners. 100% pure.",
    icon: "🌿",
    accentBg: "bg-[#FEFCE8]",
    accentBorder: "border-[#FEF08A]",
    accentText: "text-[#CA8A04]",
    heroImage: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
    subcategories: [
      { id: "5-1", slug: "all", name: "All Natural", icon: "🌿" },
      { id: "5-2", slug: "cold-pressed-oils", name: "Cold Pressed Oils", icon: "🫒" },
      { id: "5-3", slug: "raw-honey", name: "Raw Forest Honey", icon: "🍯" },
      { id: "5-4", slug: "herbal-teas", name: "Herbal Teas", icon: "🍵" },
      { id: "5-5", slug: "desi-ghee", name: "Desi Bilona Ghee", icon: "🧈" },
    ],
  },
  {
    id: "6",
    slug: "custom",
    name: "Custom & Made-to-Order",
    shortName: "Custom & Gifts",
    tagline: "Bespoke gifts, customized celebration hampers and personal keepsakes.",
    icon: "🎁",
    accentBg: "bg-[#FDF2F8]",
    accentBorder: "border-[#FCE7F3]",
    accentText: "text-[#DB2777]",
    heroImage: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=600&q=80",
    subcategories: [
      { id: "6-1", slug: "all", name: "All Custom Gifts", icon: "🎁" },
      { id: "6-2", slug: "gift-hampers", name: "Festive Hampers", icon: "🧺" },
      { id: "6-3", slug: "personalized-art", name: "Personalized Art", icon: "🎨" },
      { id: "6-4", slug: "celebration-boxes", name: "Party Favors", icon: "🎀" },
    ],
  },
];

/**
 * Get Dynamic Homemade Hub Data
 * GET /api/customer/homemade/hub?latitude=...&longitude=...
 */
export const getHomemadeHub = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.query;

    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;
    const hasLocation = userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng);

    // 1. Determine nearby seller IDs
    let sellerIds: mongoose.Types.ObjectId[] = [];
    if (hasLocation) {
      sellerIds = await findSellersWithinRange(userLat, userLng);
    }

    // Fallback: If no sellers in range or no coordinates provided, use approved sellers
    if (sellerIds.length === 0) {
      const fallbackSellers = await Seller.find({ status: "Approved" }).select("_id").limit(100);
      sellerIds = fallbackSellers.map((s: any) => s._id);
    }

    // 2. Base query for active homemade products from eligible sellers
    const baseQuery: any = {
      status: "Active",
      publish: true,
      isHomemade: true,
      seller: { $in: sellerIds },
    };

    // 3. Dynamic Category & Subcategory Aggregation from MongoDB
    let distinctCategoryIds = await Product.distinct("category", baseQuery);

    // Fallback: If no sellers in immediate range have homemade products, look platform-wide for active categories
    if (!distinctCategoryIds || distinctCategoryIds.length === 0) {
      distinctCategoryIds = await Product.distinct("category", {
        status: "Active",
        publish: true,
        isHomemade: true,
      });
    }

    const THEME_PRESETS = [
      {
        accentBg: "bg-[#FFF6ED]",
        accentBorder: "border-[#FFEDD5]",
        accentText: "text-[#EA580C]",
        defaultIcon: "🍲",
      },
      {
        accentBg: "bg-[#FFF1F4]",
        accentBorder: "border-[#FFE4EA]",
        accentText: "text-[#FF2E7A]",
        defaultIcon: "🧁",
      },
      {
        accentBg: "bg-[#FAF5FF]",
        accentBorder: "border-[#F3E8FF]",
        accentText: "text-[#9333EA]",
        defaultIcon: "🧶",
      },
      {
        accentBg: "bg-[#F0FDF4]",
        accentBorder: "border-[#DCFCE7]",
        accentText: "text-[#16A34A]",
        defaultIcon: "🕯️",
      },
      {
        accentBg: "bg-[#FEFCE8]",
        accentBorder: "border-[#FEF08A]",
        accentText: "text-[#CA8A04]",
        defaultIcon: "🌿",
      },
      {
        accentBg: "bg-[#FDF2F8]",
        accentBorder: "border-[#FCE7F3]",
        accentText: "text-[#DB2777]",
        defaultIcon: "🎁",
      },
    ];

    let dynamicCategories: any[] = [];

    if (distinctCategoryIds && distinctCategoryIds.length > 0) {
      const validCategoryIds = distinctCategoryIds.filter(
        (id) => id && mongoose.Types.ObjectId.isValid(id)
      );

      if (validCategoryIds.length > 0) {
        const dbCategories = await Category.find({
          _id: { $in: validCategoryIds },
          status: "Active",
        }).lean();

        dynamicCategories = await Promise.all(
          dbCategories.map(async (cat: any, idx: number) => {
            const theme = THEME_PRESETS[idx % THEME_PRESETS.length];

            // Live product count for this category
            const prodCount = await Product.countDocuments({
              ...baseQuery,
              category: cat._id,
            });

            // Live distinct subcategories for this category among homemade products
            const distinctSubcatIds = await Product.distinct("subcategory", {
              ...baseQuery,
              category: cat._id,
            });

            const validSubcatIds = (distinctSubcatIds || []).filter(
              (sid) => sid && mongoose.Types.ObjectId.isValid(sid)
            );

            let subcatDocs: any[] = [];
            if (validSubcatIds.length > 0) {
              subcatDocs = await Category.find({ _id: { $in: validSubcatIds } })
                .select("name slug icon")
                .lean();
              if (subcatDocs.length === 0) {
                try {
                  const SubCategoryModel = mongoose.model("SubCategory");
                  subcatDocs = await SubCategoryModel.find({ _id: { $in: validSubcatIds } })
                    .select("name slug icon")
                    .lean();
                } catch {
                  // Ignore if SubCategory model not registered
                }
              }
            }

            const subcategories = [
              {
                id: "all",
                _id: "all",
                slug: "all",
                name: `All ${cat.name}`,
                icon: cat.icon || theme.defaultIcon,
              },
              ...subcatDocs.map((s: any) => ({
                id: s._id.toString(),
                _id: s._id.toString(),
                slug: s.slug || s._id.toString(),
                name: s.name,
                icon: s.icon || theme.defaultIcon,
              })),
            ];

            return {
              id: cat._id.toString(),
              _id: cat._id.toString(),
              slug: cat.slug || cat._id.toString(),
              name: cat.name,
              shortName: cat.name,
              tagline: cat.description || `Fresh, handcrafted & homemade ${cat.name.toLowerCase()}`,
              icon: cat.icon || theme.defaultIcon,
              image: cat.image || "",
              heroImage:
                cat.image ||
                "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
              accentBg: theme.accentBg,
              accentBorder: theme.accentBorder,
              accentText: theme.accentText,
              productCount: prodCount,
              subcategories,
            };
          })
        );
      }
    }

    // Graceful fallback if no DB categories have homemade products yet
    if (dynamicCategories.length === 0) {
      const categoryCountsAgg = await Product.aggregate([
        { $match: baseQuery },
        { $group: { _id: "$homemadeCategory", count: { $sum: 1 } } },
      ]);

      const countMap: Record<string, number> = {};
      for (const item of categoryCountsAgg) {
        if (item._id) {
          countMap[item._id.toLowerCase()] = item.count;
        }
      }

      dynamicCategories = HOMEMADE_CATEGORY_METADATA.map((cat) => ({
        ...cat,
        productCount: countMap[cat.slug.toLowerCase()] || 0,
      }));
    }

    // 4. Fetch Trending Homemade Products
    const trendingDocs = await Product.find(baseQuery)
      .populate("category", "name slug")
      .populate("subcategory", "name slug")
      .populate("seller", "storeName location city rating reviewsCount")
      .sort({ popular: -1, rating: -1, createdAt: -1 })
      .limit(12);

    const trendingProducts = trendingDocs.map((p: any) => {
      const pObj = p.toObject ? p.toObject() : p;
      let distKm = 1.0;
      if (hasLocation && pObj.seller?.location?.coordinates?.length === 2) {
        const [sLng, sLat] = pObj.seller.location.coordinates;
        distKm = Math.round(calculateDistance(userLat, userLng, sLat, sLng) * 10) / 10;
      }

      const catSlug = pObj.category?.slug || pObj.homemadeCategory || "food";
      const catId = pObj.category?._id?.toString() || pObj.category?.toString() || "";
      const subcatSlug = pObj.subcategory?.slug || pObj.homemadeSubcategory || "all";
      const subcatId = pObj.subcategory?._id?.toString() || pObj.subcategory?.toString() || "";

      return {
        id: pObj._id.toString(),
        _id: pObj._id.toString(),
        name: pObj.productName,
        sellerId: pObj.seller?._id?.toString() || pObj.seller?.toString(),
        sellerName: pObj.seller?.storeName || "Home Maker",
        isSellerVerified: true,
        rating: pObj.seller?.rating || 4.8,
        reviewsCount: pObj.seller?.reviewsCount || 42,
        distance: `${distKm} km`,
        distanceKm: distKm,
        price: pObj.discPrice && pObj.discPrice > 0 ? pObj.discPrice : pObj.price,
        originalPrice: pObj.discPrice && pObj.discPrice > 0 ? pObj.price : undefined,
        unit: pObj.pack || (pObj.variations && pObj.variations[0]?.title) || "1 piece",
        badge: pObj.popular ? "Popular" : pObj.dealOfDay ? "Chef Special" : "Bestseller",
        categorySlug: catSlug,
        categoryId: catId,
        subcategorySlug: subcatSlug,
        subcategoryId: subcatId,
        imageUrl: pObj.mainImage || (pObj.galleryImages && pObj.galleryImages[0]) || "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80",
        foodType: pObj.foodType || "None",
        description: pObj.smallDescription || pObj.description,
        isAvailable: pObj.stock > 0,
        stock: pObj.stock,
      };
    });

    // 5. Fetch Nearby Homemade Sellers
    // Find distinct sellers who actually have isHomemade products in baseQuery
    const distinctSellerIds = await Product.distinct("seller", baseQuery);

    const sellersList = await Seller.find({
      _id: { $in: distinctSellerIds },
      status: "Approved",
    })
      .select("storeName storeDescription profile storeBanner category location rating reviewsCount city")
      .limit(8);

    // For each seller, get preview images of their homemade products
    const nearbySellers = await Promise.all(
      sellersList.map(async (seller: any) => {
        let distKm = 1.2;
        if (hasLocation && seller.location?.coordinates?.length === 2) {
          const [sLng, sLat] = seller.location.coordinates;
          distKm = Math.round(calculateDistance(userLat, userLng, sLat, sLng) * 10) / 10;
        }

        const sampleProducts = await Product.find({
          seller: seller._id,
          isHomemade: true,
          status: "Active",
          publish: true,
        })
          .select("mainImage")
          .limit(3);

        const previews = sampleProducts
          .map((sp: any) => sp.mainImage)
          .filter(Boolean);

        return {
          id: seller._id.toString(),
          _id: seller._id.toString(),
          name: seller.storeName,
          specialty: seller.storeDescription || seller.category || "Home Maker & Kitchen",
          distance: `${distKm} km`,
          distanceKm: distKm,
          rating: seller.rating || 4.8,
          reviewsCount: seller.reviewsCount || 56,
          deliveryTag: "On Time Delivery",
          avatarUrl: seller.profile || seller.storeBanner || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
          isVerified: true,
          productPreviews: previews.length > 0 ? previews : [
            "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=200&q=80",
            "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=200&q=80",
          ],
        };
      })
    );

    // Sort sellers by distance
    nearbySellers.sort((a, b) => a.distanceKm - b.distanceKm);

    return res.status(200).json({
      success: true,
      data: {
        categories: dynamicCategories,
        trendingProducts,
        nearbySellers,
        totalProducts: trendingProducts.length,
      },
    });
  } catch (error: any) {
    console.error("Error in getHomemadeHub:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching homemade hub content",
      error: error.message,
    });
  }
};
