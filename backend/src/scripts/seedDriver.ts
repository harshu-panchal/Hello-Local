import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Delivery from '../models/Delivery';
import Otp from '../models/Otp';

dotenv.config();

const seedDriver = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI missing in .env');
      process.exit(1);
    }

    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log(' Connected to MongoDB');

    const mobile = '9111966732';
    const otpCode = '1234';

    // Hash a default password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('123456', salt);

    // 1. Check or create Delivery partner
    let driver = await Delivery.findOne({ mobile });

    if (driver) {
      console.log(`Driver with mobile ${mobile} already exists (${driver._id}). Updating to Active...`);
      driver.status = 'Active';
      driver.isOnline = true;
      if (!driver.city) driver.city = 'Indore';
      if (!driver.address) driver.address = 'Main Market';
      await driver.save();
      console.log(` Updated driver ${mobile} to Active.`);
    } else {
      console.log(`Creating new delivery driver with mobile ${mobile}...`);
      driver = await Delivery.create({
        name: 'Delivery Driver',
        mobile: mobile,
        email: `driver.${mobile}@hellolocal.com`,
        password: passwordHash,
        status: 'Active',
        isOnline: true,
        address: 'Main Market',
        city: 'Indore',
        pincode: '452001',
        vehicleType: 'Bike',
        vehicleNumber: 'MP09AB1234',
        balance: 0,
        cashCollected: 0,
        pendingAdminPayout: 0,
        settings: {
          notifications: true,
          location: true,
          sound: true,
        },
      });
      console.log(` Created driver successfully with ID: ${driver._id}`);
    }

    // 2. Ensure active OTP record is present in Otp collection
    await Otp.deleteMany({ mobile, userType: 'Delivery' });
    await Otp.create({
      mobile,
      otp: otpCode,
      userType: 'Delivery',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year expiry
      isVerified: false,
      attempts: 0,
    });
    console.log(` Seeded static OTP ${otpCode} for ${mobile} (Delivery).`);

    console.log('\n==============================================');
    console.log(' Driver Seed Summary:');
    console.log(` Mobile: ${mobile}`);
    console.log(` OTP: ${otpCode}`);
    console.log(` Status: ${driver.status}`);
    console.log(` Name: ${driver.name}`);
    console.log(` Driver ID: ${driver._id}`);
    console.log('==============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding driver:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

seedDriver();
