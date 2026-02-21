import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import ShopAd from "../models/ShopAd";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const dummyAds = [
    {
        shopName: "Gourmet Garden",
        tagline: "Fresh Organic Produce",
        description: "100% chemical-free vegetables directly from local farms.",
        imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1000",
        badge: "FRESH",
        badgeColor: "#10b981",
        ctaText: "Shop Now",
        ctaLink: "/products?category=Vegetables",
        order: 1,
        isActive: true,
    },
    {
        shopName: "Style Haven",
        tagline: "Latest Fashion Trends",
        description: "Trendy & modern apparel for every occasion.",
        imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1000",
        badge: "NEW TRENDS",
        badgeColor: "#ec4899",
        ctaText: "Browse Looks",
        ctaLink: "/products?category=Fashion",
        order: 2,
        isActive: true,
    },
    {
        shopName: "Kitchen Masters",
        tagline: "Modern Cookware Essentials",
        description: "Upgrade your kitchen with our premium collection.",
        imageUrl: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&q=80&w=1000",
        badge: "PREMIUM",
        badgeColor: "#f59e0b",
        ctaText: "View Collection",
        ctaLink: "/products?category=Kitchen",
        order: 3,
        isActive: true,
    },
    {
        shopName: "Electro Hub",
        tagline: "Next-Gen Tech Gadgets",
        description: "Innovative devices to satisfy your inner geek.",
        imageUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=1000",
        badge: "TECH",
        badgeColor: "#3b82f6",
        ctaText: "See Tech",
        ctaLink: "/products?category=Electronics",
        order: 4,
        isActive: true,
    },
    {
        shopName: "Cozy Corners",
        tagline: "Aesthetic Home Decor",
        description: "Transform your house into a beautiful home.",
        imageUrl: "https://images.unsplash.com/photo-1513519247388-193454204627?auto=format&fit=crop&q=80&w=1000",
        badge: "AESTHETIC",
        badgeColor: "#8b5cf6",
        ctaText: "Decorate Now",
        ctaLink: "/products?category=Decor",
        order: 5,
        isActive: true,
    },
    {
        shopName: "The Shoe Box",
        tagline: "Step into Comfort",
        description: "Quality footwear for daily wear and athletics.",
        imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=1000",
        badge: "COMFORT",
        badgeColor: "#ef4444",
        ctaText: "Shop Shoes",
        ctaLink: "/products?category=Footwear",
        order: 6,
        isActive: true,
    },
    {
        shopName: "Beauty Bliss",
        tagline: "Organic Skincare Rituals",
        description: "Nourish your skin with the power of nature.",
        imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&q=80&w=1000",
        badge: "GLOW",
        badgeColor: "#14b8a6",
        ctaText: "Get Glowing",
        ctaLink: "/products?category=Beauty",
        order: 7,
        isActive: true,
    },
    {
        shopName: "Daily Delights",
        tagline: "Essential Staples Box",
        description: "Everything you need for your pantry in one go.",
        imageUrl: "https://images.unsplash.com/photo-1534723452862-4c874e70d6f2?auto=format&fit=crop&q=80&w=1000",
        badge: "ESSENTIAL",
        badgeColor: "#fbbf24",
        ctaText: "Order Now",
        ctaLink: "/products?category=Grocery",
        order: 8,
        isActive: true,
    },
    {
        shopName: "Fit Nation",
        tagline: "Achieve Your Goals",
        description: "Premium fitness gear for serious athletes.",
        imageUrl: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=1000",
        badge: "ATHLETIC",
        badgeColor: "#4338ca",
        ctaText: "Go Fit",
        ctaLink: "/products?category=Fitness",
        order: 9,
        isActive: true,
    },
    {
        shopName: "Pet Paradise",
        tagline: "Happy Pets, Happy You",
        description: "Best treats and accessories for your furry friends.",
        imageUrl: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=1000",
        badge: "HAPPY PETS",
        badgeColor: "#65a30d",
        ctaText: "Shop Pets",
        ctaLink: "/products?category=Pets",
        order: 10,
        isActive: true,
    }
];

async function seedAds() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) throw new Error("MONGODB_URI not found");

        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB for seeding ads...");

        // Remove existing ads
        await ShopAd.deleteMany({});
        console.log("Cleared existing shop ads.");

        // Insert dummy ads
        await ShopAd.insertMany(dummyAds);
        console.log(`Successfully seeded ${dummyAds.length} shop ads.`);

    } catch (error) {
        console.error("Seeding error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

seedAds();
