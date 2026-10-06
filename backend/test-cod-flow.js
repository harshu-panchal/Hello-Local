/**
 * COD Payment Flow Test Script
 * 
 * This script tests the complete COD payment flow:
 * 1. Creates a test COD order
 * 2. Marks it as delivered (triggers wallet updates)
 * 3. Simulates delivery boy payment to admin
 * 4. Verifies all wallet balances
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Order = require('./src/models/Order').default;
const Delivery = require('./src/models/Delivery').default;
const Seller = require('./src/models/Seller').default;
const Customer = require('./src/models/Customer').default;
const Product = require('./src/models/Product').default;
const Category = require('./src/models/Category').default;
const PlatformWallet = require('./src/models/PlatformWallet').default;
const Commission = require('./src/models/Commission').default;
const WalletTransaction = require('./src/models/WalletTransaction').default;

// Import services
const { processCODOrderDelivery, calculateCODOrderBreakdown } = require('./src/services/commissionService');

// Test configuration
const TEST_CONFIG = {
    productCost: 300,
    platformFee: 10,
    deliveryCharge: 30,
    deliveryDistanceKm: 2,
    adminCommissionRate: 10, // 10% of product cost
};

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

async function findOrCreateTestData() {
    console.log('\n📦 Setting up test data...');

    // Find or create test category
    let category = await Category.findOne({ name: 'Test Category' });
    if (!category) {
        category = await Category.create({
            name: 'Test Category',
            slug: 'test-category',
            commissionRate: TEST_CONFIG.adminCommissionRate,
            status: 'Active',
        });
        console.log('✅ Created test category');
    }

    // Find or create test seller
    let seller = await Seller.findOne({ email: 'testseller@test.com' });
    if (!seller) {
        seller = await Seller.create({
            sellerName: 'Test Seller',
            email: 'testseller@test.com',
            mobile: '9999999999',
            password: 'test123',
            storeName: 'Test Store',
            status: 'Active',
            balance: 0,
            address: 'Test Address',
            city: 'Test City',
            state: 'Test State',
            pincode: '123456',
            latitude: '28.7041',
            longitude: '77.1025',
        });
        console.log('✅ Created test seller');
    }

    // Find or create test product
    let product = await Product.findOne({ name: 'Test Product for COD' });
    if (!product) {
        product = await Product.create({
            name: 'Test Product for COD',
            slug: 'test-product-cod',
            description: 'Test product for COD flow testing',
            category: category._id,
            seller: seller._id,
            price: TEST_CONFIG.productCost,
            salePrice: TEST_CONFIG.productCost,
            stock: 100,
            status: 'Active',
            images: ['https://via.placeholder.com/300'],
        });
        console.log('✅ Created test product');
    }

    // Find or create test customer
    let customer = await Customer.findOne({ email: 'testcustomer@test.com' });
    if (!customer) {
        customer = await Customer.create({
            firstName: 'Test',
            lastName: 'Customer',
            email: 'testcustomer@test.com',
            mobile: '8888888888',
            password: 'test123',
        });
        console.log('✅ Created test customer');
    }

    // Find or create test delivery boy
    let deliveryBoy = await Delivery.findOne({ email: 'testdelivery@test.com' });
    if (!deliveryBoy) {
        deliveryBoy = await Delivery.create({
            name: 'Test Delivery Boy',
            email: 'testdelivery@test.com',
            mobile: '7777777777',
            password: 'test123',
            status: 'Active',
            balance: 0,
            pendingAdminPayout: 0,
            cashCollected: 0,
            vehicleType: 'Bike',
            vehicleNumber: 'TEST1234',
            latitude: '28.7041',
            longitude: '77.1025',
        });
        console.log('✅ Created test delivery boy');
    }

    return { category, seller, product, customer, deliveryBoy };
}

async function createTestOrder(testData) {
    console.log('\n📝 Creating test COD order...');

    const { product, customer, seller, deliveryBoy } = testData;

    const order = await Order.create({
        customer: customer._id,
        customerName: `${customer.firstName} ${customer.lastName}`,
        customerEmail: customer.email,
        customerPhone: customer.mobile,
        items: [],
        subtotal: TEST_CONFIG.productCost,
        platformFee: TEST_CONFIG.platformFee,
        shipping: TEST_CONFIG.deliveryCharge,
        total: TEST_CONFIG.productCost + TEST_CONFIG.platformFee + TEST_CONFIG.deliveryCharge,
        paymentMethod: 'COD',
        paymentStatus: 'Pending',
        status: 'Processing',
        deliveryAddress: {
            address: 'Test Delivery Address',
            city: 'Test City',
            state: 'Test State',
            pincode: '123456',
            latitude: '28.7041',
            longitude: '77.1025',
        },
        deliveryBoy: deliveryBoy._id,
        deliveryDistanceKm: TEST_CONFIG.deliveryDistanceKm,
    });

    // Create order item
    const OrderItem = require('./src/models/OrderItem').default;
    const orderItem = await OrderItem.create({
        order: order._id,
        product: product._id,
        productName: product.name,
        productImage: product.images[0],
        seller: seller._id,
        quantity: 1,
        price: TEST_CONFIG.productCost,
        total: TEST_CONFIG.productCost,
        commissionRate: TEST_CONFIG.adminCommissionRate,
        commissionAmount: (TEST_CONFIG.productCost * TEST_CONFIG.adminCommissionRate) / 100,
        status: 'Pending',
    });

    order.items.push(orderItem._id);
    await order.save();

    console.log(`✅ Created order: ${order.orderNumber}`);
    console.log(`   Total: ₹${order.total}`);
    console.log(`   Payment Method: ${order.paymentMethod}`);

    return order;
}

async function markOrderAsDelivered(order) {
    console.log('\n🚚 Marking order as delivered...');

    // Get initial balances
    const deliveryBoy = await Delivery.findById(order.deliveryBoy);
    const initialDeliveryBalance = deliveryBoy.balance;
    const initialPendingPayout = deliveryBoy.pendingAdminPayout;
    const initialCashCollected = deliveryBoy.cashCollected;

    console.log('   Initial Delivery Boy State:');
    console.log(`   - Balance: ₹${initialDeliveryBalance}`);
    console.log(`   - Pending Admin Payout: ₹${initialPendingPayout}`);
    console.log(`   - Cash Collected: ₹${initialCashCollected}`);

    // Calculate breakdown first
    console.log('\n📊 Calculating COD breakdown...');
    const breakdown = await calculateCODOrderBreakdown(order._id.toString());

    console.log('   Breakdown:');
    console.log(`   - Product Cost: ₹${breakdown.productCost}`);
    console.log(`   - Admin Product Commission: ₹${breakdown.adminProductCommission}`);
    console.log(`   - Platform Fee: ₹${breakdown.platformFee}`);
    console.log(`   - Total Delivery Charge: ₹${breakdown.totalDeliveryCharge}`);
    console.log(`   - Delivery Boy Commission: ₹${breakdown.deliveryBoyCommission}`);
    console.log(`   - Admin Delivery Commission: ₹${breakdown.adminDeliveryCommission}`);
    console.log(`   - Total Admin Earning: ₹${breakdown.totalAdminEarning}`);
    console.log(`   - Amount Delivery Boy Owes Admin: ₹${breakdown.amountDeliveryBoyOwesAdmin}`);

    // Process COD delivery
    await processCODOrderDelivery(order._id.toString());

    // Update order status
    order.status = 'Delivered';
    order.deliveryBoyStatus = 'Delivered';
    order.deliveredAt = new Date();
    order.paymentStatus = 'Paid';
    await order.save();

    // Get updated balances
    const updatedDeliveryBoy = await Delivery.findById(order.deliveryBoy);

    console.log('\n   Updated Delivery Boy State:');
    console.log(`   - Balance: ₹${updatedDeliveryBoy.balance} (${updatedDeliveryBoy.balance > initialDeliveryBalance ? '+' : ''}${updatedDeliveryBoy.balance - initialDeliveryBalance})`);
    console.log(`   - Pending Admin Payout: ₹${updatedDeliveryBoy.pendingAdminPayout} (+${updatedDeliveryBoy.pendingAdminPayout - initialPendingPayout})`);
    console.log(`   - Cash Collected: ₹${updatedDeliveryBoy.cashCollected} (+${updatedDeliveryBoy.cashCollected - initialCashCollected})`);

    // Check platform wallet
    const platformWallet = await PlatformWallet.findOne();
    if (platformWallet) {
        console.log('\n   Platform Wallet State:');
        console.log(`   - Pending from Delivery Boy: ₹${platformWallet.pendingFromDeliveryBoy}`);
        console.log(`   - Delivery Boy Pending Payouts: ₹${platformWallet.deliveryBoyPendingPayouts}`);
    }

    // Check commission records
    const commissions = await Commission.find({ order: order._id });
    console.log('\n   Commission Records Created:');
    commissions.forEach(comm => {
        console.log(`   - ${comm.type}: ₹${comm.commissionAmount} (Status: ${comm.status})`);
    });

    return breakdown;
}

async function simulatePayToAdmin(order, breakdown) {
    console.log('\n💰 Simulating "Pay to Admin" flow...');

    const deliveryBoy = await Delivery.findById(order.deliveryBoy);
    const amountToPay = deliveryBoy.pendingAdminPayout;

    console.log(`   Amount to pay: ₹${amountToPay}`);

    // Get initial states
    const initialPlatformWallet = await PlatformWallet.findOne();
    const initialSellerBalance = await Seller.findById(order.items[0].seller).then(s => s.balance);

    console.log('\n   Initial States:');
    console.log(`   - Delivery Boy Pending Payout: ₹${deliveryBoy.pendingAdminPayout}`);
    console.log(`   - Seller Balance: ₹${initialSellerBalance}`);
    if (initialPlatformWallet) {
        console.log(`   - Platform Total Earning: ₹${initialPlatformWallet.totalPlatformEarning}`);
        console.log(`   - Platform Current Balance: ₹${initialPlatformWallet.currentPlatformBalance}`);
        console.log(`   - Platform Admin Earning: ₹${initialPlatformWallet.totalAdminEarning}`);
    }

    // Simulate the payment process (this would normally be done via the API endpoint)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Import the processPendingCODPayouts function
        const { processPendingCODPayouts } = require('./src/services/commissionService');

        // Update delivery boy
        deliveryBoy.pendingAdminPayout = Math.max(0, deliveryBoy.pendingAdminPayout - amountToPay);
        await deliveryBoy.save({ session });

        // Update platform wallet
        let platformWallet = await PlatformWallet.findOne().session(session);
        if (!platformWallet) {
            const walletArray = await PlatformWallet.create([{
                totalPlatformEarning: 0,
                currentPlatformBalance: 0,
                totalAdminEarning: 0,
                pendingFromDeliveryBoy: 0,
                sellerPendingPayouts: 0,
                deliveryBoyPendingPayouts: 0,
            }], { session });
            platformWallet = walletArray[0];
        }

        platformWallet.totalPlatformEarning += amountToPay;
        platformWallet.currentPlatformBalance += amountToPay;
        platformWallet.totalAdminEarning += breakdown.totalAdminEarning;
        platformWallet.pendingFromDeliveryBoy -= amountToPay;

        // Calculate seller earnings from breakdown
        let totalSellerEarnings = 0;
        for (const earning of breakdown.sellerEarnings.values()) {
            totalSellerEarnings += earning;
        }
        platformWallet.sellerPendingPayouts += totalSellerEarnings;

        await platformWallet.save({ session });

        // Process seller payouts
        await processPendingCODPayouts(deliveryBoy._id.toString(), amountToPay, session);

        await session.commitTransaction();

        console.log('\n✅ Payment processed successfully!');

        // Get final states
        const finalDeliveryBoy = await Delivery.findById(order.deliveryBoy);
        const finalPlatformWallet = await PlatformWallet.findOne();
        const finalSellerBalance = await Seller.findById(order.items[0].seller).then(s => s.balance);

        console.log('\n   Final States:');
        console.log(`   - Delivery Boy Pending Payout: ₹${finalDeliveryBoy.pendingAdminPayout} (${finalDeliveryBoy.pendingAdminPayout - deliveryBoy.pendingAdminPayout})`);
        console.log(`   - Seller Balance: ₹${finalSellerBalance} (+${finalSellerBalance - initialSellerBalance})`);
        console.log(`   - Platform Total Earning: ₹${finalPlatformWallet.totalPlatformEarning} (+${finalPlatformWallet.totalPlatformEarning - (initialPlatformWallet?.totalPlatformEarning || 0)})`);
        console.log(`   - Platform Current Balance: ₹${finalPlatformWallet.currentPlatformBalance} (+${finalPlatformWallet.currentPlatformBalance - (initialPlatformWallet?.currentPlatformBalance || 0)})`);
        console.log(`   - Platform Admin Earning: ₹${finalPlatformWallet.totalAdminEarning} (+${finalPlatformWallet.totalAdminEarning - (initialPlatformWallet?.totalAdminEarning || 0)})`);

        // Verify wallet transactions
        const walletTransactions = await WalletTransaction.find({
            relatedOrder: order._id
        }).sort({ createdAt: -1 });

        console.log('\n   Wallet Transactions:');
        walletTransactions.forEach(txn => {
            console.log(`   - ${txn.userType} ${txn.type}: ₹${txn.amount} - ${txn.description}`);
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Error processing payment:', error);
        throw error;
    } finally {
        session.endSession();
    }
}

async function verifyResults(order, breakdown) {
    console.log('\n✅ VERIFICATION SUMMARY');
    console.log('='.repeat(60));

    const deliveryBoy = await Delivery.findById(order.deliveryBoy);
    const seller = await Seller.findById(order.items[0].seller);
    const platformWallet = await PlatformWallet.findOne();

    const expectedSellerEarning = TEST_CONFIG.productCost - breakdown.adminProductCommission;
    const expectedDeliveryBoyBalance = breakdown.deliveryBoyCommission;
    const expectedAdminEarning = breakdown.totalAdminEarning;

    console.log('\n📊 Expected vs Actual:');
    console.log(`\nSeller Earning:`);
    console.log(`   Expected: ₹${expectedSellerEarning}`);
    console.log(`   Actual: ₹${seller.balance}`);
    console.log(`   ✅ ${seller.balance === expectedSellerEarning ? 'PASS' : '❌ FAIL'}`);

    console.log(`\nDelivery Boy Commission:`);
    console.log(`   Expected: ₹${expectedDeliveryBoyBalance}`);
    console.log(`   Actual: ₹${deliveryBoy.balance}`);
    console.log(`   ✅ ${deliveryBoy.balance === expectedDeliveryBoyBalance ? 'PASS' : '❌ FAIL'}`);

    console.log(`\nDelivery Boy Pending Payout:`);
    console.log(`   Expected: ₹0 (after payment)`);
    console.log(`   Actual: ₹${deliveryBoy.pendingAdminPayout}`);
    console.log(`   ✅ ${deliveryBoy.pendingAdminPayout === 0 ? 'PASS' : '❌ FAIL'}`);

    if (platformWallet) {
        console.log(`\nPlatform Admin Earning:`);
        console.log(`   Expected: ₹${expectedAdminEarning}`);
        console.log(`   Actual: ₹${platformWallet.totalAdminEarning}`);
        console.log(`   ✅ ${platformWallet.totalAdminEarning === expectedAdminEarning ? 'PASS' : '❌ FAIL'}`);
    }

    console.log('\n' + '='.repeat(60));
}

async function cleanup() {
    console.log('\n🧹 Cleaning up test data...');

    // Delete test orders
    await Order.deleteMany({ customerEmail: 'testcustomer@test.com' });
    await require('./src/models/OrderItem').default.deleteMany({});

    // Reset test user balances
    await Delivery.updateOne(
        { email: 'testdelivery@test.com' },
        { balance: 0, pendingAdminPayout: 0, cashCollected: 0 }
    );
    await Seller.updateOne(
        { email: 'testseller@test.com' },
        { balance: 0 }
    );

    // Delete test commissions and transactions
    await Commission.deleteMany({});
    await WalletTransaction.deleteMany({});

    // Reset platform wallet
    await PlatformWallet.deleteMany({});

    console.log('✅ Cleanup complete');
}

async function runTest() {
    try {
        await connectDB();

        console.log('\n🚀 Starting COD Payment Flow Test');
        console.log('='.repeat(60));

        // Step 1: Setup test data
        const testData = await findOrCreateTestData();

        // Step 2: Create test order
        const order = await createTestOrder(testData);

        // Step 3: Mark order as delivered
        const breakdown = await markOrderAsDelivered(order);

        // Step 4: Simulate payment to admin
        await simulatePayToAdmin(order, breakdown);

        // Step 5: Verify results
        await verifyResults(order, breakdown);

        console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        console.error(error.stack);
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

// Run the test
runTest();
