import mongoose, { Document, Schema } from "mongoose";

/**
 * Append-only record of admin changes to operational settings.
 * Holds only the setting key, the old and new values and the acting admin.
 */
export interface ISettingAuditLog extends Document {
  setting: string;
  previousValue: unknown;
  newValue: unknown;
  changedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const SettingAuditLogSchema = new Schema<ISettingAuditLog>(
  {
    setting: { type: String, required: true, trim: true },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    changedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SettingAuditLogSchema.index({ setting: 1, createdAt: -1 });

const SettingAuditLog =
  (mongoose.models.SettingAuditLog as mongoose.Model<ISettingAuditLog>) ||
  mongoose.model<ISettingAuditLog>("SettingAuditLog", SettingAuditLogSchema);

export default SettingAuditLog;
