
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Seller from '../models/Seller';

dotenv.config();

const run = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('MONGODB_URI missing');
            return;
        }

        console.log('Connecting to:', process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const sellers = await Seller.find({});
        console.log(`Found ${sellers.length} sellers.`);

        sellers.forEach(s => {
            console.log(`Seller: ${s.storeName}, Status: ${s.status}, Location:`, s.location);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

run();
