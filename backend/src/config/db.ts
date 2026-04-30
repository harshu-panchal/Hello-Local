import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    const conn = await mongoose.connect(mongoUri, {
      family: 4,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });

    console.log("\n\x1b[32m✓\x1b[0m \x1b[1mMongoDB Connected Successfully\x1b[0m");
    console.log(`   \x1b[36mHost:\x1b[0m ${conn.connection.host}`);
    console.log(`   \x1b[36mDatabase:\x1b[0m ${conn.connection.name}\n`);
  } catch (error) {
    console.error("\n\x1b[31m✗\x1b[0m \x1b[1mMongoDB Connection Error\x1b[0m");

    if (error instanceof Error) {
      console.error(`   \x1b[31m${error.message}\x1b[0m\n`);

      if (
        error.message.includes("querySrv") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ETIMEOUT")
      ) {
        console.error(
          "   \x1b[33mThis looks like a DNS/SRV lookup issue. Verify your MongoDB Atlas URI and local network DNS settings.\x1b[0m\n"
        );
      }
    } else {
      console.error(`   \x1b[31m${String(error)}\x1b[0m\n`);
    }

    process.exit(1);
  }
};

export default connectDB;
