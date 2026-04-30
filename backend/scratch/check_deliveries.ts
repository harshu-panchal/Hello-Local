
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import Delivery from '../src/models/Delivery';

async function checkDeliveries() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hellolocal';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const deliveries = await Delivery.find({}, 'name mobile email createdAt');
    console.log('Total deliveries:', deliveries.length);
    console.log(JSON.stringify(deliveries, null, 2));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkDeliveries();
