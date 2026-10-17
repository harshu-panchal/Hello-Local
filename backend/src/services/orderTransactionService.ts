import mongoose, { ClientSession, Schema } from "mongoose";

const Lock = mongoose.models.OrderOperationLock || mongoose.model("OrderOperationLock",
  new Schema({ _id: String, revision: { type: Number, default: 0 } }));

export function orderError(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

// A database write lock serializes each order across API processes. Transaction
// retries re-read the order and its items after competing operations commit.
export async function withOrderTransaction<T>(key: string, work: (session: ClientSession) => Promise<T>): Promise<T> {
  try { await Lock.updateOne({ _id: key }, { $setOnInsert: { revision: 0 } }, { upsert: true }); }
  catch (error: any) { if (error.code !== 11000) throw error; }
  const session = await mongoose.startSession();
  try {
    return (await session.withTransaction(async () => {
      await Lock.updateOne({ _id: key }, { $inc: { revision: 1 } }, { session });
      return work(session);
    })) as T;
  } finally { await session.endSession(); }
}
