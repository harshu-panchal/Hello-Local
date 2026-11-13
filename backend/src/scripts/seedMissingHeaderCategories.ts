import dotenv from "dotenv";
dotenv.config();
import connectDB from "../config/db";
import { seedMissingHeaderCategories } from "../utils/seedHeaderCategories";

/**
 * One-off: add default header categories that are missing on an existing
 * database (e.g. Medical, Hardware, Stationery). Existing ones are untouched,
 * so it is safe to run more than once.
 */
async function main() {
  try {
    await connectDB();
    const added = await seedMissingHeaderCategories();
    console.log(
      added.length
        ? `Added header categories: ${added.join(", ")}`
        : "All default header categories already exist. Nothing to add."
    );
    process.exit(0);
  } catch (err) {
    console.error("Failed to add missing header categories:", err);
    process.exit(1);
  }
}

main();
