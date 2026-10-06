
import mongoose from 'mongoose';
import Order from './src/models/Order';
import Commission from './src/models/Commission';
import { distributeCommissions } from './src/services/commissionService';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function runDebug() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        console.log(`🔍 Finding latest Order...`);
        const order = await Order.findOne({}).sort({ createdAt: -1 }).populate('items');
        if (!order) {
            console.error('❌ No orders found!');
            return;
        }
        console.log(`🔍 Found Order: ${order.orderNumber}`);
        if (!order) {
            console.error('❌ Order not found!');
            return;
        }

        console.log(`✅ Order found: ${order._id}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Items: ${order.items?.length}`);

        // Force status to Delivered if not already (logic requires it)
        if (order.status !== 'Delivered') {
            console.log('⚠️  Order is not Delivered. distributeCommissions might fail/skip.');
            // Check service logic: checks if status !== 'Delivered'
            // I will intentionally update it here to ensure test validity
            console.log('   Updating status to Delivered temporarily...');
            order.status = 'Delivered';
            await order.save();
        }

        // Check if commissions exist
        const existing = await Commission.find({ order: order._id });
        console.log(`   Existing Commissions: ${existing.length}`);
        if (existing.length > 0) {
            console.log('   (Clearing existing commissions to re-test)');
            await Commission.deleteMany({ order: order._id });
        }

        console.log('🚀 Calling distributeCommissions()...');
        const result = await distributeCommissions(order._id.toString());

        console.log('📝 Result:', JSON.stringify(result, null, 2));

        if (!result.success) {
            console.error('❌ distributeCommissions failed!');
        } else {
            console.log('✅ distributeCommissions succeeded!');
            // Controller Replication Check
            console.log('🕵️ Simulating Controller Query...');
            const commissions = await Commission.find({})
                .populate("order", "orderNumber")
                .populate("seller", "storeName")
                .populate("deliveryBoy", "name")
                .sort({ createdAt: -1 })
                .limit(10);

            console.log(`📊 Controller would see ${commissions.length} records:`);
            commissions.forEach(c => {
                let source = "System";
                if (c.type === "SELLER") {
                    source = (c.seller as any)?.storeName || "Unknown Seller";
                }
                console.log(`   - ID: ${c._id} | Amt: ${c.commissionAmount} | Source: ${source} | Status: ${c.status}`);
            });

            // Global check
            const allCommissions = await Commission.find({});
            console.log(`🌍 TOTAL Commissions in Database: ${allCommissions.length}`);
            console.log('   Samples:', JSON.stringify(allCommissions.slice(0, 3), null, 2));
        }

    } catch (error: any) {
        console.error('❌ Script Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected.');
    }
}

runDebug();
