
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Delivery from '../models/Delivery';
import bcrypt from 'bcrypt'; // Using bcryptjs as it's common, or bcrypt if installed. The other file used bcrypt.

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

        const mobile = '9111966732'; // User's mobile number

        let user = await Delivery.findOne({ mobile });
        if (user) {
            console.log('User already exists:', user);
            // Verify password hash? No, just reset it if needed.
            // But let's check if we need to update anything.
            // user.status = 'Active';
            // await user.save();
            console.log('User status:', user.status);
        } else {
            console.log('User not found. Creating new Delivery user...');

            // Generate password hash
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash('123456', salt);

            const newUser = new Delivery({
                name: "Delivery Partner",
                mobile: mobile,
                email: "delivery@hellolocal.com", // Dummy email
                password: passwordHash,
                address: "Hyd",
                city: "Hyderabad",
                status: "Active",
                balance: 0,
                cashCollected: 0,
                isOnline: true,
                settings: {
                    notifications: true,
                    location: true,
                    sound: true
                }
            });

            await newUser.save();
            console.log('Created User:', newUser._id);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

run();
