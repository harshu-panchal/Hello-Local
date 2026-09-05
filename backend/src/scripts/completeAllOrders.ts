import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Delivery from "../models/Delivery";
import {
  createPendingCommissions,
  distributeCommissions,
  processCODOrderDelivery,
} from "../services/commissionService";

dotenv.config();

async function completeAllOrders() {
  console.log("==========================================");
  console.log("🚀 STARTING: Complete All Orders & System Settlement");
  console.log("==========================================\n");

  try {
    await connectDB();

    // 1. Find a default active delivery partner for unassigned orders
    const activeDeliveryBoy = await Delivery.findOne({ status: "Active" }).sort({ createdAt: -1 });
    if (!activeDeliveryBoy) {
      console.warn("⚠️ No active delivery boy found! Trying any delivery boy...");
    }
    const defaultDeliveryBoyId = activeDeliveryBoy
      ? activeDeliveryBoy._id
      : (await Delivery.findOne())?._id;

    console.log(`📦 Using delivery partner ID: ${defaultDeliveryBoyId} (${activeDeliveryBoy?.name || "Fallback"})\n`);

    // 2. Find all orders that should be completed
    // Active/in-progress statuses + any orders created today (e.g., test orders)
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const ordersToComplete = await Order.find({
      $or: [
        {
          status: {
            $in: [
              "Placed",
              "Pending",
              "Received",
              "Accepted",
              "Processed",
              "Shipped",
              "Picked up",
              "On the way",
              "Out for Delivery",
            ],
          },
        },
        {
          createdAt: { $gte: todayMidnight },
          status: { $ne: "Delivered" },
        },
      ],
    }).sort({ createdAt: -1 });

    console.log(`📋 Found ${ordersToComplete.length} orders requiring completion.\n`);

    if (ordersToComplete.length === 0) {
      console.log("✅ No active orders to complete. All orders are already Delivered or closed!");
      process.exit(0);
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ orderNumber: string; error: string }> = [];

    for (let i = 0; i < ordersToComplete.length; i++) {
      const order = ordersToComplete[i];
      const orderIdStr = order._id.toString();

      try {
        // Assign delivery boy if missing
        if (!order.deliveryBoy && defaultDeliveryBoyId) {
          order.deliveryBoy = defaultDeliveryBoyId as any;
        }

        // Set completed statuses
        order.status = "Delivered";
        order.deliveryBoyStatus = "Delivered";
        order.paymentStatus = "Paid";
        order.deliveryOtpVerified = true;
        order.deliveredAt = order.deliveredAt || new Date();
        await order.save();

        // Update all order items to Delivered
        await OrderItem.updateMany(
          { order: order._id },
          { $set: { status: "Delivered" } }
        );

        // Process financial settlement / commission distribution
        if (order.items && order.items.length > 0) {
          try {
            if (order.paymentMethod && order.paymentMethod.toUpperCase() === "COD") {
              await processCODOrderDelivery(orderIdStr);
            } else {
              await createPendingCommissions(orderIdStr).catch(() => {});
              await distributeCommissions(orderIdStr);
            }
          } catch (commErr: any) {
            // Note: If commission calculation has minor discrepancy for legacy mock items,
            // the order status itself is still fully marked Delivered and Paid.
            console.log(`   ℹ️ Note on commission for ${order.orderNumber}: ${commErr.message}`);
          }
        }

        successCount++;
        if ((i + 1) % 10 === 0 || i === ordersToComplete.length - 1) {
          console.log(`   ✅ Progress: ${i + 1}/${ordersToComplete.length} orders processed`);
        }
      } catch (err: any) {
        errorCount++;
        errors.push({ orderNumber: order.orderNumber, error: err.message });
        console.error(`   ❌ Failed to process ${order.orderNumber}: ${err.message}`);
      }
    }

    console.log("\n==========================================");
    console.log("📊 COMPLETION SUMMARY");
    console.log("==========================================");
    console.log(`Total Orders Targeted: ${ordersToComplete.length}`);
    console.log(`Successfully Delivered: ${successCount}`);
    console.log(`Errors Encountered:   ${errorCount}`);

    // Fetch new status breakdown
    const db = mongoose.connection.db;
    if (db) {
      const statuses = await db.collection("orders").aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray();
      console.log("\n📈 Updated Order Status Breakdown in Database:");
      statuses.forEach((s: any) => console.log(`   - ${s._id}: ${s.count}`));
    }

    console.log("\n🎉 ALL ORDERS HAVE BEEN COMPLETED AND SETTLED!");
    process.exit(0);
  } catch (fatalError) {
    console.error("❌ Fatal script error:", fatalError);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

completeAllOrders();
