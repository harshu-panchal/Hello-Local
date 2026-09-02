import { Request, Response } from "express";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import Shop from "../../../models/Shop";
import HeaderCategory from "../../../models/HeaderCategory";
import HomeSection from "../../../models/HomeSection";
import BestsellerCard from "../../../models/BestsellerCard";
import LowestPricesProduct from "../../../models/LowestPricesProduct";
import PromoStrip from "../../../models/PromoStrip";
import ShopAd from "../../../models/ShopAd";
import Seller from "../../../models/Seller";
import mongoose from "mongoose";
import { cache } from "../../../utils/cache";
import { findSellersWithinRange, calculateDistance } from "../../../utils/locationHelper";

// Helper function to fetch data for a home section based on its configuration
async function fetchSectionData(
  section: any,
  nearbySellerIds?: mongoose.Types.ObjectId[]
): Promise<any[]> {
  try {
    const { categories, subCategories, displayType, limit } = section;

    // If displayType is "subcategories", fetch subcategories
    if (displayType === "subcategories") {
      let subcategoryQuery: any = {};
      let specificIds: string[] = [];
      let results: any[] = [];
      let parentCategoryIds: string[] = [];

      // If specific subcategories are selected, use them
      if (subCategories && subCategories.length > 0) {
        specificIds = subCategories
          .map((sub: any) => (sub ? (sub._id || sub).toString() : null))
          .filter((id: any) => id);

        if (specificIds.length > 0) {
          subcategoryQuery._id = { $in: specificIds };
        }
      }

      // If no specific subcategories selected, fallback to fetching by parent categories
      if (specificIds.length === 0 && categories && categories.length > 0) {
        parentCategoryIds = categories
          .map((cat: any) => (cat ? (cat._id || cat).toString() : null))
          .filter((id: any) => id);

        if (parentCategoryIds.length > 0) {
          subcategoryQuery.category = { $in: parentCategoryIds };
        }
      }

      // 1. Fetch from SubCategory collection
      if (Object.keys(subcategoryQuery).length > 0) {
        const subcategories = await SubCategory.find(subcategoryQuery)
          .select("name image order category")
          .sort({ order: 1 })
          .limit(limit || 10)
          .lean();

        const mappedSubs = await Promise.all(
          subcategories.map(async (sub: any) => {
            let image = sub.image || "";
            let productImages: string[] = [];

            // Fetch active products under this subcategory to extract real product preview images
            const products = await Product.find({
              $or: [
                { subcategory: sub._id },
                { subcategory: sub.name },
              ],
              status: "Active",
              publish: true,
              mainImage: { $exists: true, $ne: "" },
            })
              .select("mainImage")
              .limit(4)
              .lean();

            if (products.length > 0) {
              productImages = products.map((p: any) => p.mainImage).filter(Boolean);
              if (!image && productImages.length > 0) {
                image = productImages[0];
              }
            }

            // Find parent category slug or ID
            let parentCatSlug = "";
            if (sub.category) {
              const parentCat = await Category.findById(sub.category).select("slug").lean();
              if (parentCat) {
                parentCatSlug = parentCat.slug;
              }
            }

            return {
              id: sub._id.toString(),
              subcategoryId: sub._id.toString(),
              categoryId: parentCatSlug || (sub.category ? sub.category.toString() : ""),
              name: sub.name,
              image: image,
              productImages,
              slug: sub.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              type: "subcategory",
            };
          })
        );

        results.push(...mappedSubs);
      }

      // 2. Fallback or Specific ID check in Category Collection

      // Case A: Specific IDs were provided but not found in SubCategory
      if (specificIds.length > 0) {
        const foundSubIds = results.map(r => r.id);
        const missingIds = specificIds.filter(id => !foundSubIds.includes(id));

        if (missingIds.length > 0) {
          const foundCategories = await Category.find({ _id: { $in: missingIds }, status: "Active" })
            .select("name image slug")
            .lean();

          const mappedCats = await Promise.all(
            foundCategories.map(async (c: any) => {
              let image = c.image || "";
              let productImages: string[] = [];

              const products = await Product.find({
                category: c._id,
                status: "Active",
                publish: true,
                mainImage: { $exists: true, $ne: "" },
              })
                .select("mainImage")
                .limit(4)
                .lean();

              if (products.length > 0) {
                productImages = products.map((p: any) => p.mainImage).filter(Boolean);
                if (!image && productImages.length > 0) {
                  image = productImages[0];
                }
              }

              return {
                id: c._id.toString(),
                categoryId: c.slug || c._id.toString(),
                name: c.name,
                image: image,
                productImages,
                slug: c.slug,
                type: "category",
              };
            })
          );

          results.push(...mappedCats);
        }
      }
      // Case B: No specific IDs, so we relied on parentCategoryIds. 
      // We found SubCategories (maybe), but we ALSO need to check for child Categories (self-referenced).
      else if (parentCategoryIds.length > 0) {
        // Search Category collection where parentId matches
        const childCategories = await Category.find({
          parentId: { $in: parentCategoryIds },
          status: "Active"
        })
          .select("name image slug parentId")
          .sort({ order: 1 })
          .limit(limit || 10)
          .lean();

        const mappedChildCats = await Promise.all(
          childCategories.map(async (c: any) => {
            let image = c.image || "";
            let productImages: string[] = [];

            const products = await Product.find({
              $or: [
                { category: c._id },
                { subcategory: c._id },
              ],
              status: "Active",
              publish: true,
              mainImage: { $exists: true, $ne: "" },
            })
              .select("mainImage")
              .limit(4)
              .lean();

            if (products.length > 0) {
              productImages = products.map((p: any) => p.mainImage).filter(Boolean);
              if (!image && productImages.length > 0) {
                image = productImages[0];
              }
            }

            let parentCatSlug = "";
            if (c.parentId) {
              const parentCat = await Category.findById(c.parentId).select("slug").lean();
              if (parentCat) {
                parentCatSlug = parentCat.slug;
              }
            }

            return {
              id: c._id.toString(),
              subcategoryId: c._id.toString(),
              categoryId: parentCatSlug || (c.parentId ? c.parentId.toString() : (c.slug || c._id.toString())),
              name: c.name,
              image: image,
              productImages,
              slug: c.slug || c._id.toString(),
              type: "category", // navigate as category
            };
          })
        );

        results.push(...mappedChildCats);
      }

      return results;
    }

    // If displayType is "products", fetch products
    if (displayType === "products") {
      const query: any = {
        status: "Active",
        publish: true,
        // Exclude shop-by-store-only products from home sections
        $or: [
          { isShopByStoreOnly: { $ne: true } },
          { isShopByStoreOnly: { $exists: false } },
        ],
      };

      // Only show products from sellers within user's delivery range
      if (nearbySellerIds && nearbySellerIds.length > 0) {
        query.seller = { $in: nearbySellerIds };
      } else if (nearbySellerIds) {
        // nearbySellerIds was resolved but is empty — no sellers in range
        return [];
      }

      if (categories && categories.length > 0) {
        const categoryIds = categories
          .map((cat: any) => (cat ? cat._id || cat : null))
          .filter((id: any) => id);

        if (categoryIds.length > 0) {
          query.category = { $in: categoryIds };
        }
      }

      if (subCategories && subCategories.length > 0) {
        const subCategoryIds = subCategories
          .map((sub: any) => (sub ? sub._id || sub : null))
          .filter((id: any) => id);

        if (subCategoryIds.length > 0) {
          query.subcategory = { $in: subCategoryIds };
        }
      }

      const products = await Product.find(query)
        .sort({ createdAt: -1 }) // Show newest items first
        .limit(limit || 8)
        .select("productName mainImage price mrp discount rating reviewsCount pack seller variations brand")
        .populate("brand", "name image")
        .lean();

      return products.map((p: any) => ({
        id: p._id.toString(),
        productId: p._id.toString(),
        name: p.productName,
        productName: p.productName,
        image: p.mainImage,
        mainImage: p.mainImage,
        price: p.price,
        discount:
          p.discount ||
          (p.mrp && p.price
            ? Math.round(((p.mrp - p.price) / p.mrp) * 100)
            : 0),
        productImages: p.mainImage ? [p.mainImage] : [],
        rating: p.rating || 0,
        reviewsCount: p.reviewsCount || 0,
        reviews: p.reviewsCount || 0,
        pack: p.pack || "",
        type: "product",
        isAvailable: true,
        seller: p.seller,
        brand: p.brand,
      }));
    }

    // If displayType is "categories", fetch the selected categories themselves
    if (displayType === "categories") {
      // If categories are specified, fetch those specific categories
      if (categories && categories.length > 0) {
        const categoryIds = categories
          .map((cat: any) => cat ? (cat._id || cat) : null)
          .filter((id: any) => id);

        const fetchedCategories = await Category.find({
          _id: { $in: categoryIds },
          status: "Active",
        })
          .select("name image slug")
          .sort({ order: 1 })
          .limit(limit || 8)
          .lean();

        return await Promise.all(
          fetchedCategories.map(async (c: any) => {
            let image = c.image || "";
            let productImages: string[] = [];

            // Query active products under this category to extract valid product preview images
            const products = await Product.find({
              $or: [
                { category: c._id },
                { category: c._id.toString() },
                { subcategory: c._id },
                { subcategory: c._id.toString() },
              ],
              status: "Active",
              publish: true,
              mainImage: { $exists: true, $ne: "" },
            })
              .select("mainImage")
              .limit(4)
              .lean();

            if (products.length > 0) {
              productImages = products.map((p: any) => p.mainImage).filter(Boolean);
              // If category image is empty or points to unauthorized dv1l9sb4p Cloudinary account, use product image
              if (!image || image.includes("dv1l9sb4p") || image.includes("undefined")) {
                if (productImages.length > 0) {
                  image = productImages[0];
                }
              }
            }

            return {
              id: c._id.toString(),
              categoryId: c.slug || c._id.toString(), // Use slug for SEO-friendly URLs, fallback to _id
              name: c.name,
              image: image,
              productImages,
              slug: c.slug,
              type: "category",
            };
          })
        );
      } else {
        // If no categories specified, return empty array
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error("Error fetching section data:", error);
    return [];
  }
}

// Get Home Page Content
export const getHomeContent = async (req: Request, res: Response) => {
  const { headerCategorySlug, latitude, longitude } = req.query; // Get header category slug and location from query params

  try {
    // Find sellers within user's location range
    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;

    let nearbySellerIds: mongoose.Types.ObjectId[] = [];
    if (userLat !== null && userLng !== null) {
      nearbySellerIds = await findSellersWithinRange(userLat, userLng);
    } else {
      // If no location provided, return empty sellers list to enforce filtering
      nearbySellerIds = [];
    }

    // 1. Featured / Bestsellers - Get bestseller cards from admin configuration
    const bestsellerCards = await BestsellerCard.find({
      isActive: true,
    })
      .populate("category", "name slug image")
      .sort({ order: 1 })
      .limit(6)
      .lean();

    // For each bestseller card, get products across category and child categories
    const bestsellers = await Promise.all(
      bestsellerCards.map(async (card: any) => {
        const categoryId = card.category?._id || card.category;

        if (!categoryId) {
          return {
            id: card._id.toString(),
            categoryId: "",
            name: card.name,
            productImages: [],
            productCount: 0,
          };
        }

        // Find child categories to ensure products in subcategories are included
        const childCategories = await Category.find({
          parentId: categoryId,
        })
          .select("_id")
          .lean();

        const allCategoryIds = [
          categoryId,
          ...childCategories.map((c: any) => c._id),
        ];

        const baseFilter: any = {
          $or: [
            { category: { $in: allCategoryIds } },
            { subcategory: { $in: allCategoryIds } },
          ],
          status: "Active",
          publish: true,
        };

        // Try to get products from nearby sellers first
        let categoryProducts: any[] = [];
        if (nearbySellerIds.length > 0) {
          categoryProducts = await Product.find({
            ...baseFilter,
            seller: { $in: nearbySellerIds },
          })
            .select("productName mainImage galleryImages")
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();
        }

        // If nearby sellers haven't stocked this category yet, fall back to active catalog products for preview images
        if (categoryProducts.length === 0) {
          categoryProducts = await Product.find(baseFilter)
            .select("productName mainImage galleryImages")
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();
        }

        // Filter valid images (skipping broken Cloudinary URLs)
        const isValidImg = (img?: string) =>
          img &&
          typeof img === "string" &&
          !img.includes("dv1l9sb4p") &&
          !img.includes("undefined") &&
          img.trim().length > 0;

        const productImages: string[] = [];
        categoryProducts.forEach((product: any) => {
          if (productImages.length < 4 && isValidImg(product.mainImage)) {
            productImages.push(product.mainImage);
          }
        });

        if (productImages.length < 4) {
          categoryProducts.forEach((product: any) => {
            if (productImages.length < 4 && product.galleryImages && product.galleryImages.length > 0) {
              const validGallery = product.galleryImages.find(isValidImg);
              if (validGallery && !productImages.includes(validGallery)) {
                productImages.push(validGallery);
              }
            }
          });
        }

        // Count total products in this department
        let totalCount = 0;
        if (nearbySellerIds.length > 0) {
          totalCount = await Product.countDocuments({
            ...baseFilter,
            seller: { $in: nearbySellerIds },
          });
        }
        if (totalCount === 0) {
          totalCount = await Product.countDocuments(baseFilter);
        }

        return {
          id: card._id.toString(),
          categoryId: categoryId ? categoryId.toString() : "",
          name: card.name,
          productImages: productImages.slice(0, 4),
          productCount: totalCount,
        };
      })
    );

    // 2. Lowest Prices Products - Get admin-selected products, filtered by range
    const lowestPricesMatchFilter: any = {
      status: "Active",
      publish: true,
    };
    // Only show products from sellers within range
    if (nearbySellerIds.length > 0) {
      lowestPricesMatchFilter.seller = { $in: nearbySellerIds };
    }

    const lowestPricesProducts = await LowestPricesProduct.find({ isActive: true })
      .populate({
        path: "product",
        select:
          "productName mainImage price mrp discount status publish category subcategory seller variations",
        match: lowestPricesMatchFilter,
      })
      .sort({ order: 1 })
      .lean();

    // Filter out null products (populate match returned null) and map
    const validLowestPricesProducts = lowestPricesProducts
      .filter((item: any) => item.product !== null)
      .map((item: any) => {
        const product = item.product;
        return {
          id: product._id.toString(),
          _id: product._id.toString(),
          productName: product.productName,
          name: product.productName,
          mainImage: product.mainImage,
          imageUrl: product.mainImage,
          price: product.price,
          mrp: product.mrp || product.price,
          discount: product.discount || (product.mrp && product.price ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0),
          categoryId: product.category?.toString() || "",
          subcategory: product.subcategory?.toString() || "",
          status: product.status,
          publish: product.publish,
          isAvailable: true,
          seller: product.seller,
        };
      });

    // 3. Categories for Tiles (Popular Categories)
    // Fetch root active categories first (parentId: null), ordered by order
    let activeCategoryDocs = await Category.find({
      status: "Active",
      parentId: null,
    })
      .select("name image icon color slug")
      .sort({ order: 1 })
      .limit(16)
      .lean();

    // If less than 6 root categories, include all active categories
    if (activeCategoryDocs.length < 6) {
      const allActiveCats = await Category.find({
        status: "Active",
      })
        .select("name image icon color slug")
        .sort({ order: 1 })
        .limit(16)
        .lean();
      activeCategoryDocs = allActiveCats;
    }

    // For categories without an image, look up image from products or subcategories
    const categories = await Promise.all(
      activeCategoryDocs.map(async (cat: any) => {
        let categoryImage = cat.image || "";

        if (!categoryImage) {
          // 1. Check child categories for an image
          const childWithImage = await Category.findOne({
            parentId: cat._id,
            status: "Active",
            image: { $exists: true, $ne: "" },
          }).select("image").lean();

          if (childWithImage?.image) {
            categoryImage = childWithImage.image;
          } else {
            // 2. Check subcategory collection
            const subWithImage = await SubCategory.findOne({
              category: cat._id,
              image: { $exists: true, $ne: "" },
            }).select("image").lean();

            if (subWithImage?.image) {
              categoryImage = subWithImage.image;
            } else {
              // 3. Check product with mainImage
              const prodWithImage = await Product.findOne({
                category: cat._id,
                status: "Active",
                publish: true,
                mainImage: { $exists: true, $ne: "" },
              }).select("mainImage").lean();

              if (prodWithImage?.mainImage) {
                categoryImage = prodWithImage.mainImage;
              }
            }
          }
        }

        return {
          id: cat._id.toString(),
          _id: cat._id.toString(),
          name: cat.name,
          image: categoryImage,
          icon: cat.icon || "",
          color: cat.color || "",
          slug: cat.slug || cat._id.toString(),
        };
      })
    );
    // 4. Shop By Store & Nearby Sellers - Fetch real location-based sellers and curated shops
    let nearbySellersFormatted: any[] = [];

    if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng)) {
      const MAX_SERVICE_RADIUS_KM = 100;
      const EARTH_RADIUS_KM = 6378.1;

      const nearbySellersList = await Seller.find({
        status: "Approved",
        $or: [
          {
            location: {
              $geoWithin: {
                $centerSphere: [[userLng, userLat], MAX_SERVICE_RADIUS_KM / EARTH_RADIUS_KM],
              },
            },
          },
          { location: { $exists: false } },
          { "location.coordinates": { $size: 0 } },
        ],
      })
        .select("storeName sellerName storeBanner logo category categories address city serviceableArea latitude longitude location serviceRadiusKm isShopOpen storeDescription")
        .lean();

      const computedNearbySellers: any[] = [];

      for (const seller of nearbySellersList) {
        let sellerLat: number | null = null;
        let sellerLng: number | null = null;

        if (seller.location && seller.location.coordinates && seller.location.coordinates.length === 2) {
          sellerLng = seller.location.coordinates[0];
          sellerLat = seller.location.coordinates[1];
        } else if (seller.latitude && seller.longitude) {
          sellerLat = parseFloat(seller.latitude);
          sellerLng = parseFloat(seller.longitude);
        }

        if (sellerLat !== null && sellerLng !== null && !isNaN(sellerLat) && !isNaN(sellerLng)) {
          const dist = calculateDistance(userLat, userLng, sellerLat, sellerLng);
          const radius = seller.serviceRadiusKm || 10;

          if (dist <= radius) {
            computedNearbySellers.push({
              seller,
              distance: Number(dist.toFixed(1)),
            });
          }
        }
      }

      // Sort sellers by distance (nearest first)
      computedNearbySellers.sort((a, b) => a.distance - b.distance);

      // Populate product previews and categories for each nearby seller
      nearbySellersFormatted = await Promise.all(
        computedNearbySellers.slice(0, 10).map(async ({ seller, distance }) => {
          const sellerProducts = await Product.find({
            seller: seller._id,
            status: "Active",
            publish: true,
          })
            .select("mainImage category")
            .limit(4)
            .lean();

          const productImages = sellerProducts.map((p: any) => p.mainImage).filter(Boolean);

          let categoryDisplay = seller.category || (Array.isArray(seller.categories) ? seller.categories.join(", ") : "");
          if (!categoryDisplay && sellerProducts.length > 0) {
            const catIds = sellerProducts.map((p: any) => p.category).filter(Boolean);
            if (catIds.length > 0) {
              const foundCats = await Category.find({ _id: { $in: catIds } }).select("name").lean();
              categoryDisplay = foundCats.map((c: any) => c.name).join(", ");
            }
          }
          if (!categoryDisplay) {
            categoryDisplay = "Local Store";
          }

          const minTime = Math.max(15, Math.round(15 + distance * 4));
          const maxTime = minTime + 10;

          return {
            id: seller._id.toString(),
            storeId: seller._id.toString(),
            slug: seller._id.toString(),
            name: seller.storeName || seller.sellerName || "Local Store",
            storeName: seller.storeName || seller.sellerName || "Local Store",
            category: { name: categoryDisplay },
            categories: categoryDisplay,
            image: seller.storeBanner || seller.logo || productImages[0] || "",
            bannerImage: seller.storeBanner || "",
            logo: seller.logo || "",
            productImages,
            distance: distance,
            area: seller.city || seller.serviceableArea || (seller.address ? seller.address.split(",")[0].trim() : "Neighborhood"),
            city: seller.city || "",
            address: seller.address || "",
            deliveryTime: `${minTime}-${maxTime} mins`,
            rating: 4.8,
            isShopOpen: seller.isShopOpen !== false,
            offer: distance <= 3 ? "Free Delivery" : "Fast Delivery",
            type: "seller",
          };
        })
      );
    }

    // Also fetch curated Shop documents
    const shopDocuments = await Shop.find({ isActive: true })
      .populate("category", "name slug")
      .sort({ order: 1, createdAt: -1 })
      .lean();

    const curatedShops = await Promise.all(
      shopDocuments.map(async (shop: any) => {
        let productImages: string[] = [];

        if (shop.products && shop.products.length > 0) {
          const shopProducts = await Product.find({
            _id: { $in: shop.products.slice(0, 4) },
            status: "Active",
            publish: true,
          })
            .select("mainImage")
            .lean();

          productImages = shopProducts.map((p: any) => p.mainImage).filter(Boolean);
        }

        let categoryName = "Department Store";
        if (shop.category) {
          if (Array.isArray(shop.category)) {
            categoryName = shop.category.map((c: any) => c.name || c).join(", ");
          } else {
            categoryName = shop.category.name || "Department Store";
          }
        }

        return {
          id: shop.storeId || shop._id.toString(),
          storeId: shop.storeId || shop._id.toString(),
          name: shop.name,
          image: shop.image || productImages[0] || "",
          productImages,
          slug: shop.storeId || shop._id.toString(),
          category: { name: categoryName },
          categories: categoryName,
          area: "Verified Store",
          productIds: shop.products?.map((p: any) => p?.toString()).filter(Boolean) || [],
          bgColor: shop.bgColor || "bg-neutral-50",
          type: "shop",
        };
      })
    );

    // shops defaults to curated specialty stores for "Shop by Store"
    const shops = curatedShops.length > 0 ? curatedShops : (nearbySellersFormatted.length > 0 ? nearbySellersFormatted : []);

    // 5. Trending Items (Fetch some popular categories or products)
    const trendingCategories = await Category.find({
      status: "Active",
    })
      .limit(5)
      .select("name image slug");

    const trending = trendingCategories.map((c) => ({
      id: c._id,
      name: c.name,
      image: c.image || `/assets/categories/${c.slug}.jpg`,
      type: "category",
    }));

    // 6. Personal Care Subcategories - Now handled by dynamic sections

    // 7. Cooking Ideas (Fetch some products from 'Food' or 'Grocery' categories)
    const foodProductsQuery: any = {
      status: "Active",
      publish: true,
    };
    if (nearbySellerIds.length > 0) {
      foodProductsQuery.seller = { $in: nearbySellerIds };
    }

    const foodProducts = await Product.find(foodProductsQuery)
      .limit(3)
      .select("productName mainImage");

    const cookingIdeas = foodProducts.map((p) => ({
      id: p._id,
      title: p.productName,
      image: p.mainImage,
      productId: p._id,
    }));

    // 8. Promo Cards (Dynamic - Categories with headerCategoryId)
    // Fetch root categories (parentId: null) that have a headerCategoryId assigned and are Active
    // If headerCategorySlug is provided, filter by that specific header category
    // Include their child categories (subcategories) with images

    // Build query for categories
    const categoryQuery: any = {
      headerCategoryId: { $exists: true, $ne: null },
      status: "Active",
      parentId: null, // Only root categories (not subcategories themselves)
    };

    // If headerCategorySlug is provided, find the header category and filter by it
    if (headerCategorySlug && headerCategorySlug !== "all") {
      const headerCategory = await HeaderCategory.findOne({
        slug: headerCategorySlug,
        status: "Published",
      }).lean();

      if (headerCategory) {
        categoryQuery.headerCategoryId = headerCategory._id;
      } else {
        // If header category not found, return empty promo cards for this header category
        // The query will still work but won't match any categories
        console.log(
          `Header category with slug "${headerCategorySlug}" not found`
        );
      }
    }

    const categoriesWithHeaderCategory = await Category.find(categoryQuery)
      .populate("headerCategoryId", "name status")
      .sort({ order: 1 })
      .limit(4) // Limit to 4 promo cards
      .lean();

    const promoCards = await Promise.all(
      categoriesWithHeaderCategory.map(async (category: any) => {
        // Get subcategory images from BOTH models
        // 1. New model: Category with parentId
        const childCategories = await Category.find({
          parentId: category._id,
          status: "Active",
        })
          .select("name image _id")
          .sort({ order: 1 })
          .limit(4)
          .lean();

        // 2. Old model: SubCategory collection
        const subCategoryDocs = await SubCategory.find({
          category: category._id,
        })
          .select("name image _id")
          .sort({ order: 1 })
          .limit(4)
          .lean();

        // Merge and deduplicate
        const allChildren = [...childCategories, ...subCategoryDocs];
        const seen = new Set<string>();
        const uniqueChildren = allChildren.filter((c: any) => {
          const key = c._id.toString();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Extract subcategory images
        let subcategoryImages = uniqueChildren
          .map((child: any) => child.image)
          .filter((img: string) => img && img.trim() !== "");

        // If not enough subcategory images, fetch product images from in-range sellers
        if (subcategoryImages.length < 4) {
          const promoProductQuery: any = {
            category: category._id,
            status: "Active",
            publish: true,
          };
          if (nearbySellerIds.length > 0) {
            promoProductQuery.seller = { $in: nearbySellerIds };
          }
          const categoryProducts = await Product.find(promoProductQuery)
            .select("mainImage galleryImages")
            .sort({ createdAt: -1 })
            .limit(4)
            .lean();

          for (const p of categoryProducts) {
            if (subcategoryImages.length >= 4) break;
            if (p.mainImage && !subcategoryImages.includes(p.mainImage)) {
              subcategoryImages.push(p.mainImage);
            } else if (p.galleryImages && p.galleryImages.length > 0 && !subcategoryImages.includes(p.galleryImages[0])) {
              subcategoryImages.push(p.galleryImages[0]);
            }
          }
        }

        return {
          id: category._id.toString(),
          badge: "Up to 55% OFF",
          title: category.name,
          categoryId: category._id.toString(),
          slug: category.slug || category._id.toString(),
          bgColor: "bg-yellow-50",
          subcategoryImages: subcategoryImages.slice(0, 4), // Max 4 images
          subcategoryCount: uniqueChildren.length,
        };
      })
    );

    // Fallback to hardcoded cards if no categories with headerCategoryId exist
    const finalPromoCards =
      promoCards.length > 0
        ? promoCards
        : [
          {
            id: "self-care",
            badge: "Up to 55% OFF",
            title: "Self Care & Wellness",
            categoryId: "personal-care",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
          {
            id: "hot-meals",
            badge: "Up to 55% OFF",
            title: "Hot Meals & Drinks",
            categoryId: "breakfast-instant",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
          {
            id: "kitchen-essentials",
            badge: "Up to 55% OFF",
            title: "Kitchen Essentials",
            categoryId: "atta-rice",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
          {
            id: "cleaning-home",
            badge: "Up to 75% OFF",
            title: "Cleaning & Home Needs",
            categoryId: "household",
            bgColor: "bg-yellow-50",
            subcategoryImages: [],
          },
        ];

    // 9. Dynamic Home Sections - Fetch from database
    let homeSectionQuery: any = { isActive: true };

    if (headerCategorySlug && headerCategorySlug !== "all") {
      const headerCategoryForSection = await HeaderCategory.findOne({
        slug: headerCategorySlug,
        status: "Published",
      }).select("_id");

      if (headerCategoryForSection) {
        homeSectionQuery.pageLocation = "Header Category Page";
        homeSectionQuery.targetHeaderCategory = headerCategoryForSection._id;
      } else {
        // If header category not found, return empty sections
        homeSectionQuery = { _id: { $exists: false } };
      }
    } else {
      homeSectionQuery.$or = [
        { pageLocation: "Home Page" },
        { pageLocation: { $exists: false } },
      ];
    }

    const homeSections = await HomeSection.find(homeSectionQuery)
      .populate("categories", "name slug image")
      .populate("subCategories", "name")
      .sort({ order: 1 })
      .lean();

    // Fetch data for each section
    const dynamicSections = await Promise.all(
      homeSections.map(async (section: any) => {
        const sectionData = await fetchSectionData(section, nearbySellerIds);
        return {
          id: section._id.toString(),
          title: section.title,
          slug: section.slug,
          displayType: section.displayType,
          columns: section.columns,
          data: sectionData,
        };
      })
    );

    // 10. Fetch PromoStrip for the current header category
    // Cache the raw DB document by slug, then filter by location in memory per-request
    const currentHeaderCategorySlug = (headerCategorySlug as string) || "all";
    const promoStripCacheKey = `promoStrip-raw-${currentHeaderCategorySlug.toLowerCase()}`;

    let promoStrip: any = null;
    const hasPromoStripCache = cache.has(promoStripCacheKey);
    let rawPromoStrip = cache.get(promoStripCacheKey) as any;

    if (!hasPromoStripCache) {
      const now = new Date();
      rawPromoStrip = await PromoStrip.findOne({
        headerCategorySlug: currentHeaderCategorySlug.toLowerCase(),
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
        .populate("categoryCards.categoryId", "name slug image")
        .populate({
          path: "featuredProducts",
          select: "productName mainImage galleryImages price compareAtPrice discount rating reviewsCount seller variations brand",
          populate: { path: "brand", select: "name image" },
        })
        .sort({ order: 1 })
        .lean();

      cache.set(promoStripCacheKey, rawPromoStrip, 3 * 60 * 1000);
    }

    // Apply location filter per-request (not cached)
    if (rawPromoStrip) {
      promoStrip = { ...rawPromoStrip };
      if (promoStrip.featuredProducts) {
        promoStrip.featuredProducts = promoStrip.featuredProducts
          .filter((p: any) => {
            if (!p) return false;
            if (nearbySellerIds.length === 0) return false;
            return nearbySellerIds.some(id => id && p.seller && id.toString() === p.seller.toString());
          })
          .map((p: any) => ({ ...p, isAvailable: true }));
      }
    }

    // 11. Fetch Active Shop Ads for Promo Banners
    const activeShopAds = await ShopAd.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    })
      .sort({ order: 1 })
      .lean();

    const mappedAds = activeShopAds.map((ad: any) => ({
      id: ad._id.toString(),
      image: ad.imageUrl,
      link: ad.ctaLink || "#",
      badge: ad.badge,
      badgeColor: ad.badgeColor,
      title: ad.shopName,
      description: ad.tagline
    }));

    // If no dynamic ads, use fallbacks
    const promoBanners = mappedAds.length > 0 ? mappedAds : [
      {
        id: "promo-fallback-1",
        image: "https://img.freepik.com/free-vector/horizontal-banner-template-grocery-sales_23-2149432421.jpg",
        link: "/category/grocery",
      },
      {
        id: "promo-fallback-2",
        image: "https://img.freepik.com/free-vector/flat-supermarket-social-media-cover-template_23-2149363385.jpg",
        link: "/category/snacks",
      }
    ];

    // 12. Fetch Products for the Header Category (when a specific category tab is selected)
    let headerCategoryProducts: any[] = [];
    if (headerCategorySlug && headerCategorySlug !== "all") {
      const targetHeaderCat = await HeaderCategory.findOne({
        slug: headerCategorySlug,
        status: "Published",
      }).lean();

      if (targetHeaderCat) {
        // Find linked root categories
        const linkedCategories = await Category.find({
          headerCategoryId: targetHeaderCat._id,
          status: "Active",
        }).select("_id").lean();

        const linkedCategoryIds = linkedCategories.map((c: any) => c._id);

        // Find child categories (subcategories) under these root categories
        const allCategoryIds = [...linkedCategoryIds];
        const allSubcategoryIds: any[] = [];

        if (linkedCategoryIds.length > 0) {
          const childCategories = await Category.find({
            parentId: { $in: linkedCategoryIds },
            status: "Active",
          }).select("_id").lean();

          const subCategories = await SubCategory.find({
            category: { $in: linkedCategoryIds },
          }).select("_id").lean();

          allCategoryIds.push(...childCategories.map((c: any) => c._id));
          allSubcategoryIds.push(...subCategories.map((s: any) => s._id));
        }

        // Also check if any root category directly has matching slug or name
        const directCategoryMatch = await Category.findOne({
          slug: headerCategorySlug,
          status: "Active",
        }).select("_id").lean();

        if (directCategoryMatch && !allCategoryIds.some(id => id.toString() === directCategoryMatch._id.toString())) {
          allCategoryIds.push(directCategoryMatch._id);
        }

        // Build product query
        const productFilter: any = {
          status: "Active",
          publish: true,
          $or: [
            { isShopByStoreOnly: { $ne: true } },
            { isShopByStoreOnly: { $exists: false } },
          ],
        };

        if (nearbySellerIds.length > 0) {
          productFilter.seller = { $in: nearbySellerIds };
        }

        const matchOrConditions: any[] = [
          { headerCategoryId: targetHeaderCat._id },
        ];

        if (allCategoryIds.length > 0) {
          matchOrConditions.push({ category: { $in: allCategoryIds } });
        }
        if (allSubcategoryIds.length > 0) {
          matchOrConditions.push({ subcategory: { $in: allSubcategoryIds } });
        }

        if (matchOrConditions.length > 0 && (!userLat || nearbySellerIds.length > 0)) {
          const rawProducts = await Product.find({
            ...productFilter,
            $or: matchOrConditions,
          })
            .sort({ createdAt: -1 })
            .limit(40)
            .select(
              "productName mainImage galleryImages price mrp discount rating reviewsCount pack seller variations foodType status publish category subcategory"
            )
            .lean();

          headerCategoryProducts = rawProducts.map((p: any) => ({
            id: p._id.toString(),
            _id: p._id.toString(),
            productId: p._id.toString(),
            name: p.productName,
            productName: p.productName,
            mainImage: p.mainImage,
            galleryImages: p.galleryImages || [],
            image: p.mainImage,
            price: p.price,
            mrp: p.mrp || p.price,
            discount:
              p.discount ||
              (p.mrp && p.price
                ? Math.round(((p.mrp - p.price) / p.mrp) * 100)
                : 0),
            rating: p.rating || 0,
            reviewsCount: p.reviewsCount || 0,
            reviews: p.reviewsCount || 0,
            pack: p.pack || "",
            foodType: p.foodType || "None",
            seller: p.seller,
            variations: p.variations || [],
            isAvailable: true,
            categoryId: p.category?.toString() || "",
            subcategory: p.subcategory?.toString() || "",
            type: "product",
          }));
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        bestsellers,
        lowestPrices: validLowestPricesProducts, // Admin-selected products for LowestPricesEver section
        categories,
        products: headerCategoryProducts, // Dynamic products for the active header category
        // Dynamic sections created by admin
        homeSections: dynamicSections,
        shops,
        curatedShops,
        nearbySellers: nearbySellersFormatted,
        promoBanners,
        trending,
        cookingIdeas,
        promoCards: finalPromoCards, // Return dynamic or fallback cards
        promoStrip: promoStrip || null, // PromoStrip data for the current header category
      },
    });
  } catch (error: any) {
    console.error("Error in getHomeContent:", error.stack || error);
    res.status(500).json({
      success: false,
      message: "Error fetching home content",
      error: error.message,
    });
  }
};

// Get Products for a specific "Store" (Campaign/Collection)
// Fetch products based on store configuration from database
export const getStoreProducts = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const { latitude, longitude } = req.query; // User location for filtering
    let query: any = {
      status: "Active",
      publish: true,
      // Only show shop-by-store-only products in shop by store section
      isShopByStoreOnly: true,
    };

    console.log(`[getStoreProducts] Looking for shop with storeId: ${storeId}`);

    // Build shop query - only include _id if storeId is a valid ObjectId
    const shopQuery: any = { isActive: true };
    if (mongoose.Types.ObjectId.isValid(storeId)) {
      shopQuery.$or = [
        { storeId: storeId.toLowerCase() },
        { _id: new mongoose.Types.ObjectId(storeId) }
      ];
    } else {
      shopQuery.storeId = storeId.toLowerCase();
    }

    // Find the shop by storeId or _id
    const shop = await Shop.findOne(shopQuery)
      .populate("category", "_id name slug image")
      .populate("subCategory", "_id name")
      .lean();

    console.log(`[getStoreProducts] Shop found:`, shop ? { name: shop.name, productsCount: shop.products?.length || 0, category: shop.category, image: shop.image } : 'NOT FOUND');

    let shopData: any = null;

    if (shop) {
      shopData = {
        name: shop.name,
        image: shop.image,
        description: shop.description || '',
        category: shop.category,
      };

      // Convert products array to ObjectIds if needed
      // When using .lean(), products array contains ObjectIds directly
      let productIds: mongoose.Types.ObjectId[] = [];
      if (shop.products && shop.products.length > 0) {
        productIds = shop.products.map((p: any) => {
          // Handle different formats: ObjectId, string, or object with _id
          if (mongoose.Types.ObjectId.isValid(p)) {
            return typeof p === 'string' ? new mongoose.Types.ObjectId(p) : p;
          }
          return p._id ? (typeof p._id === 'string' ? new mongoose.Types.ObjectId(p._id) : p._id) : p;
        }).filter(Boolean);
      }

      console.log(`[getStoreProducts] Shop has ${productIds.length} products assigned`);

      // Get shop ID for filtering
      const shopId = (shop as any)._id;

      // If shop has specific products assigned, use those
      if (productIds.length > 0) {
        query._id = { $in: productIds };
        // Also filter by shopId to ensure products belong to this shop
        query.shopId = shopId;
        console.log(`[getStoreProducts] Filtering by product IDs: ${productIds.length} products and shopId: ${shopId}`);
      }
      // Otherwise, filter by shopId and category/subcategory
      else {
        // Filter by shopId to show only products assigned to this shop
        query.shopId = shopId;
        console.log(`[getStoreProducts] Filtering by shopId: ${shopId}`);

        if (shop.category) {
          const categoryId = (shop.category as any)._id || (shop.category as any);
          query.category = categoryId;
          console.log(`[getStoreProducts] Also filtering by category: ${categoryId}`);

          // If subcategory is also specified, filter by both
          if (shop.subCategory) {
            const subCategoryId = (shop.subCategory as any)._id || (shop.subCategory as any);
            query.$or = [
              { category: categoryId, shopId: shopId },
              { subcategory: subCategoryId, shopId: shopId },
            ];
            console.log(`[getStoreProducts] Also filtering by subcategory: ${subCategoryId}`);
          }
        }
      }
    } else {
      // Check if storeId is a Seller ID
      let seller: any = null;
      if (mongoose.Types.ObjectId.isValid(storeId)) {
        seller = await Seller.findById(storeId).lean();
      }

      if (seller) {
        let categoryDisplay = seller.category || (Array.isArray(seller.categories) ? seller.categories.join(", ") : "Local Store");
        shopData = {
          id: seller._id.toString(),
          name: seller.storeName || seller.sellerName,
          image: seller.storeBanner || seller.logo || '',
          bannerImage: seller.storeBanner || '',
          logo: seller.logo || '',
          description: seller.storeDescription || seller.address || '',
          address: seller.address,
          city: seller.city,
          category: { name: categoryDisplay },
          rating: 4.8,
          isSeller: true,
        };

        const sellerProducts = await Product.find({
          seller: seller._id,
          status: "Active",
          publish: true,
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .select("productName mainImage galleryImages price mrp discount rating reviewsCount pack seller variations foodType status publish category subcategory")
          .lean();

        const mappedSellerProducts = sellerProducts.map((p: any) => ({
          id: p._id.toString(),
          _id: p._id.toString(),
          productId: p._id.toString(),
          name: p.productName,
          productName: p.productName,
          mainImage: p.mainImage,
          galleryImages: p.galleryImages || [],
          image: p.mainImage,
          price: p.price,
          mrp: p.mrp || p.price,
          discount: p.discount || (p.mrp && p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0),
          rating: p.rating || 0,
          reviewsCount: p.reviewsCount || 0,
          reviews: p.reviewsCount || 0,
          pack: p.pack || "",
          foodType: p.foodType || "None",
          seller: p.seller,
          variations: p.variations || [],
          isAvailable: true,
          categoryId: p.category?.toString() || "",
          subcategory: p.subcategory?.toString() || "",
          type: "product",
        }));

        return res.status(200).json({
          success: true,
          data: mappedSellerProducts,
          shop: shopData,
        });
      }

      // Fallback: try to match by category name (legacy support)
      const categoryId = await getCategoryIdByName(storeId);
      if (categoryId) {
        query.category = categoryId;
        // Try to get category details for shop data
        const category = await Category.findById(categoryId).select("name slug image").lean();
        if (category) {
          shopData = {
            name: category.name,
            image: category.image || '',
            description: '',
            category: category,
          };
        }
      } else {
        // No matching shop or category found
        return res.status(200).json({
          success: true,
          data: [],
          shop: null,
          message: "Store not found"
        });
      }
    }

    // Location-based filtering: Only show products from sellers within user's range
    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;

    console.log(`[getStoreProducts] User location: lat=${userLat}, lng=${userLng}`);

    if (userLat && userLng && !isNaN(userLat) && !isNaN(userLng)) {
      const nearbySellerIds = await findSellersWithinRange(userLat, userLng);
      console.log(`[getStoreProducts] Found ${nearbySellerIds.length} sellers within range`);

      if (nearbySellerIds.length === 0) {
        // No sellers within range, return shop data but empty products
        console.log(`[getStoreProducts] No sellers in range, returning empty products`);
        return res.status(200).json({
          success: true,
          data: [],
          shop: shopData,
          pagination: {
            page: 1,
            limit: 50,
            total: 0,
            pages: 0,
          },
          message: "No sellers available in your area. Please update your location.",
        });
      }

      // Filter products by sellers within range
      query.seller = { $in: nearbySellerIds };
      console.log(`[getStoreProducts] Added seller filter to query`);
    } else {
      // If no location provided, return empty (require location for marketplace)
      console.log(`[getStoreProducts] No location provided, returning empty products`);
      return res.status(200).json({
        success: true,
        data: [],
        shop: shopData,
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          pages: 0,
        },
        message: "Location is required to view products. Please enable location access.",
      });
    }

    console.log(`[getStoreProducts] Final query:`, JSON.stringify(query, null, 2));

    const products = await Product.find(query)
      .populate("category", "name icon image")
      .populate("subcategory", "name")
      .populate("brand", "name image")
      .populate("seller", "storeName")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean({ virtuals: true });

    const total = await Product.countDocuments(query);

    console.log(`[getStoreProducts] Found ${total} products matching query, returning ${products.length}`);

    return res.status(200).json({
      success: true,
      data: products.map(p => ({ ...p, isAvailable: true })),
      shop: shopData,
      pagination: {
        page: 1,
        limit: 50,
        total,
        pages: Math.ceil(total / 50),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching store products",
      error: error.message,
    });
  }
};

// Helper
async function getCategoryIdByName(name: string) {
  try {
    const category = await Category.findOne({
      name: { $regex: new RegExp(name, "i") },
      status: "Active"
    }).select("_id");
    return category ? category._id : null;
  } catch (error) {
    console.error("Error finding category by name:", error);
    return null;
  }
}

/**
 * Check if service is available at the given location
 */
export const checkServiceability = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
        isServiceAvailable: false
      });
    }

    const userLat = parseFloat(latitude as string);
    const userLng = parseFloat(longitude as string);

    if (isNaN(userLat) || isNaN(userLng)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates",
        isServiceAvailable: false
      });
    }

    const nearbySellerIds = await findSellersWithinRange(userLat, userLng);

    return res.status(200).json({
      success: true,
      isServiceAvailable: nearbySellerIds.length > 0,
      nearbySellersCount: nearbySellerIds.length
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error checking serviceability",
      error: error.message,
      isServiceAvailable: false
    });
  }
};
