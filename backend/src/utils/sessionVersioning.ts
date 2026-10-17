import { Schema } from 'mongoose';

/** Disabling an account permanently invalidates its earlier JWTs, including
 * after reactivation. Existing accounts/tokens start at version zero. */
export function applySessionVersioning(schema: Schema<any>, disabled: string[]) {
  schema.add({ authVersion: { type: Number, default: 0, min: 0 } });
  schema.pre('save', function (next) {
    if (this.isModified('status') && disabled.includes(String(this.get('status')))) {
      this.set('authVersion', Number(this.get('authVersion') || 0) + 1);
    }
    next();
  });
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
    const update = this.getUpdate() as any;
    if (update && !Array.isArray(update) && disabled.includes(update.$set?.status ?? update.status)) {
      delete update.authVersion;
      if (update.$set) delete update.$set.authVersion;
      update.$inc = { ...update.$inc, authVersion: 1 };
    }
    next();
  });
}
