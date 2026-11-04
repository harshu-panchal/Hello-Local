import Seller from '../models/Seller';
import SubscriptionPlan from '../models/SubscriptionPlan';

export async function ensureSubscriptionHealth(): Promise<void> {
  try {
    // 1. Ensure default subscription plans exist
    const planCount = await SubscriptionPlan.countDocuments();
    if (planCount === 0) {
      await SubscriptionPlan.create([
        {
          name: 'Monthly Starter',
          description: 'Perfect for local shops getting started with online delivery.',
          price: 499,
          durationInDays: 30,
          features: [
            '0% Commission on all orders',
            'Unlimited product catalog',
            'Direct customer payments & settlements',
            'Store analytics & order management',
          ],
          isActive: true,
          isPopular: false,
          sortOrder: 1,
        },
        {
          name: 'Quarterly Growth',
          description: 'Most popular for active grocery and retail stores.',
          price: 1299,
          durationInDays: 90,
          features: [
            '0% Commission on all orders',
            'Unlimited product catalog',
            'Priority delivery dispatch',
            'Direct customer payments & settlements',
            'Store analytics & order management',
          ],
          isActive: true,
          isPopular: true,
          sortOrder: 2,
        },
        {
          name: 'Annual Merchant Pass',
          description: 'Best value for established vendors with maximum savings.',
          price: 3999,
          durationInDays: 365,
          features: [
            '0% Commission on all orders',
            'Unlimited product catalog',
            'Featured store placement on homepage',
            'Priority delivery dispatch',
            'Direct customer payments & settlements',
            'Dedicated seller onboarding support',
          ],
          isActive: true,
          isPopular: false,
          sortOrder: 3,
        },
      ]);
      console.log('[Subscription Health] Initialized default starter subscription plans.');
    }

    // 2. Grandfather existing approved and pending sellers who registered before subscriptions
    // Grace period: 30 days from launch so existing operations are not disrupted.
    const unassignedSellers = await Seller.find({
      status: { $in: ['Approved', 'Pending'] },
      $or: [
        { subscription: { $exists: false } },
        { 'subscription.status': { $in: [null, undefined] } },
        { 'subscription.endDate': { $exists: false } },
      ],
    }).select('_id storeName status');

    if (unassignedSellers.length > 0) {
      const graceEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await Seller.updateMany(
        {
          _id: { $in: unassignedSellers.map((s) => s._id) },
        },
        {
          $set: {
            subscription: {
              status: 'active',
              planName: 'Grandfathered Merchant Grace Period',
              startDate: new Date(),
              endDate: graceEnd,
            },
          },
        }
      );
      console.log(
        `[Subscription Health] Granted 30-day grace period to ${unassignedSellers.length} legacy approved seller(s).`
      );
    }

    // 3. Backfill firstApprovedAt for existing approved sellers so re-approvals never treat them as new (#first-approval)
    const approvedWithoutDate = await Seller.find({
      status: 'Approved',
      $or: [{ firstApprovedAt: { $exists: false } }, { firstApprovedAt: null }],
    }).select('_id createdAt');

    if (approvedWithoutDate.length > 0) {
      const now = new Date();
      await Promise.all(
        approvedWithoutDate.map((seller: any) =>
          Seller.updateOne(
            { _id: seller._id },
            { $set: { firstApprovedAt: seller.createdAt || now } }
          )
        )
      );
      console.log(
        `[Subscription Health] Backfilled firstApprovedAt for ${approvedWithoutDate.length} existing approved seller(s).`
      );
    }
  } catch (error) {
    console.error('[Subscription Health] Error ensuring subscription health:', error);
  }
}

export default ensureSubscriptionHealth;
