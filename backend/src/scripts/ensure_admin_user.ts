
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../models/Admin';

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

        const targetMobile = '9111966732';
        const targetEmail = 'admin@hellolocal.com';

        // Check if admin with this mobile already exists
        let adminByMobile = await Admin.findOne({ mobile: targetMobile });

        if (adminByMobile) {
            console.log(`Admin with mobile ${targetMobile} already exists: ${adminByMobile.email}`);
            return;
        }

        console.log(`Admin with mobile ${targetMobile} not found.`);

        // Check if admin with default email exists
        let adminByEmail = await Admin.findOne({ email: targetEmail });

        if (adminByEmail) {
            console.log(`Found admin by email ${targetEmail}. Updating mobile number...`);
            adminByEmail.mobile = targetMobile;
            await adminByEmail.save();
            console.log(`Updated admin mobile to ${targetMobile}`);
        } else {
            console.log(`Creating new admin with mobile ${targetMobile}...`);
            const newAdmin = new Admin({
                firstName: 'Hello Local',
                lastName: 'Admin',
                email: targetEmail,
                mobile: targetMobile,
                role: 'Super Admin',
                password: 'password123'
            });

            await newAdmin.save();
            console.log(`Created new admin: ${newAdmin._id}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

run();
