import dotenv from "dotenv";
dotenv.config();
import connectDB from "../config/db";
import { seedStandardTaxes } from "../utils/seedStandardTaxes";

async function main() {
  try {
    await connectDB();
    await seedStandardTaxes();
    console.log("Standard GST slabs (0%, 5%, 12%, 18%, 28%) seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to seed taxes:", err);
    process.exit(1);
  }
}

main();
