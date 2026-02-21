import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import ShopAd from "../models/ShopAd";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const dummyAds = [
    {
        shopName: "Gourmet Garden",
        tagline: "Exotic Organic Produce delivered to your door.",
        description: "Fresh from local farms, 100% chemical-free vegetables and fruits for your health.",
        imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1000",
        badge: "FRESH",
        badgeColor: "#10b981",
        ctaText: "Shop Now",
        ctaLink: "/products?category=Vegetables",
        order: 1,
        isActive: true,
    },
    {
        shopName: "The Festive Boutique",
        tagline: "Unforgettable Collections for every occasion.",
        description: "Exclusive designer wear, ethnic collections, and premium accessories for the festive season.",
        imageUrl: "https://images.unsplash.com/photo-1590400568422-e91f8fe01283?auto=format&fit=crop&q=80&w=1000",
        badge: "FEATURED",
        badgeColor: "#8b5cf6",
        ctaText: "Explore Collection",
        ctaLink: "/products?category=Fashion",
        order: 2,
        isActive: true,
    },
    {
        shopName: "Kitchen Masters",
        tagline: "Premium Utensils for the Modern Chef.",
        description: "High-quality stainless steel, non-stick cookware, and smart kitchen appliances at best prices.",
        imageUrl: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&q=80&w=1000",
        badge: "PREMIUM",
        badgeColor: "#f59e0b",
        ctaText: "View Products",
        ctaLink: "/products?category=Kitchen",
        order: 3,
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
