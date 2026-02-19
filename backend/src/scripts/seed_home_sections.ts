
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db';
import HomeSection from '../models/HomeSection';
import Category from '../models/Category';

dotenv.config();

const seedHomeSections = async () => {
    try {
        await connectDB();

        console.log('Finding active categories...');
        const categories = await Category.find({ status: 'Active' }).limit(8).lean();

        if (categories.length === 0) {
            console.log('No active categories found! Please seed categories first.');
            return;
        }

        const categoryIds = categories.map(c => c._id);

        console.log(`Found ${categories.length} categories.`);

        console.log('Creating Home Sections...');

        // 1. Popular Categories Section
        const categoriesSection = {
            title: "Explore Categories",
            slug: "explore-categories",
            categories: categoryIds,
            displayType: "categories",
            columns: 4,
            limit: 8,
            pageLocation: "Home Page",
            isActive: true,
            order: 1
        };

        await HomeSection.findOneAndUpdate(
            { slug: categoriesSection.slug },
            categoriesSection,
            { upsert: true, new: true }
        );
        console.log('Created/Updated "Explore Categories" section.');

        // 2. New Arrivals (Products) Section
        // We'll create a section that shows products from these categories
        const productsSection = {
            title: "New Arrivals",
            slug: "new-arrivals",
            categories: categoryIds, // Filter products by these categories
            displayType: "products",
            columns: 4,
            limit: 8,
            pageLocation: "Home Page",
            isActive: true,
            order: 2
        };

        await HomeSection.findOneAndUpdate(
            { slug: productsSection.slug },
            productsSection,
            { upsert: true, new: true }
        );
        console.log('Created/Updated "New Arrivals" section.');

        console.log('Home Sections seeded successfully!');

    } catch (error) {
        console.error('Error seeding home sections:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

seedHomeSections();
