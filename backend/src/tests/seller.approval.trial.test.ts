import test, { after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
import Seller from '../models/Seller';
import SubscriptionPayment from '../models/SubscriptionPayment';
import Notification from '../models/Notification';
import * as firebaseAdmin from '../services/firebaseAdmin';
import { updateSellerStatus } from '../modules/seller/controllers/sellerController';

function result(value: any): any {
  const promise: any = Promise.resolve(
    Array.isArray(value) ? [...value] : value ? { ...value } : value
  );
  promise.sort = () => promise;
  promise.select = () => promise;
  promise.lean = () => promise;
  return promise;
}

const restores: Array<() => void> = [];
function patch(object: any, key: string, value: any) {
  const previous = object[key];
  object[key] = value;
  restores.push(() => {
    object[key] = previous;
  });
}

patch(Notification, 'create', async () => ({ _id: 'notif123' }));
patch(firebaseAdmin, 'sendNotificationToUser', async () => {});

function invoke(handler: any, params: any = {}, body: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const res: any = {
      code: 200,
      status(code: number) {
        this.code = code;
        return this;
      },
      json(data: any) {
        resolve({ status: this.code, ...data });
        return this;
      },
    };
    handler({ params, body, app: { get: () => undefined } }, res, reject);
  });
}

after(() => {
  restores.reverse().forEach((r) => r());
});

test('Seller Approval: 7-Day Free Trial starts at approval time and sets firstApprovedAt', async () => {
  const sellerId = '607f1f77bcf86cd799439011';
  // Simulate seller who registered 4 days ago with 7-Day Free Trial
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  const oldEndDate = new Date(fourDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000);

  let currentSeller: any = {
    _id: sellerId,
    sellerName: 'Pending Store Owner',
    mobile: '9876543210',
    email: 'owner@example.test',
    storeName: 'Fresh Mart',
    status: 'Pending',
    firstApprovedAt: null,
    subscription: {
      status: 'active',
      planName: '7-Day Free Trial',
      durationInDays: 7,
      amount: 0,
      startDate: fourDaysAgo,
      endDate: oldEndDate,
    },
  };

  let paymentRecord: any = {
    sellerId,
    paymentMethod: 'FREE_TRIAL',
    startDate: fourDaysAgo,
    endDate: oldEndDate,
    notes: 'VoLoMart-style 7-Day Free Trial activated during registration',
  };

  patch(Seller, 'findById', (id: any) => result(currentSeller));
  patch(Seller, 'findByIdAndUpdate', (id: any, update: any) => {
    if (update.status) currentSeller.status = update.status;
    if (update.firstApprovedAt) currentSeller.firstApprovedAt = update.firstApprovedAt;
    if (update.subscription) currentSeller.subscription = update.subscription;
    return result(currentSeller);
  });
  patch(SubscriptionPayment, 'findOneAndUpdate', async (query: any, update: any) => {
    if (query.paymentMethod === 'FREE_TRIAL') {
      Object.assign(paymentRecord, update);
    }
    return paymentRecord;
  });

  const nowBefore = Date.now();
  const res = await invoke(updateSellerStatus, { id: sellerId }, { status: 'Approved' });

  assert.equal(res.status, 200);
  assert.equal(res.success, true);
  assert.equal(currentSeller.status, 'Approved');
  assert.ok(currentSeller.firstApprovedAt);

  // Verify that the subscription dates were reset to the approval timestamp
  assert.equal(currentSeller.subscription.status, 'active');
  assert.equal(currentSeller.subscription.planName, '7-Day Free Trial');
  assert.ok(currentSeller.subscription.startDate.getTime() >= nowBefore);

  const expectedMinEnd = nowBefore + 7 * 24 * 60 * 60 * 1000 - 1000;
  assert.ok(currentSeller.subscription.endDate.getTime() >= expectedMinEnd);

  // Verify payment audit updated
  assert.equal(paymentRecord.notes, 'VoLoMart-style 7-Day Free Trial activated on admin approval');
  assert.ok(paymentRecord.endDate.getTime() >= expectedMinEnd);
});

test('Seller Approval: re-approving an expired trial seller does NOT grant a new trial', async () => {
  const sellerId = '607f1f77bcf86cd799439099';
  const pastApproval = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(Date.now() - 23 * 24 * 60 * 60 * 1000);

  let currentSeller: any = {
    _id: sellerId,
    sellerName: 'Expired Trial Merchant',
    mobile: '9876543299',
    email: 'expiredtrial@example.test',
    status: 'Rejected', // e.g. suspended
    firstApprovedAt: pastApproval,
    subscription: {
      status: 'expired',
      planName: '7-Day Free Trial',
      durationInDays: 7,
      amount: 0,
      startDate: pastApproval,
      endDate: pastEnd,
    },
  };

  patch(Seller, 'findById', (id: any) => result(currentSeller));
  patch(Seller, 'findByIdAndUpdate', (id: any, update: any) => {
    if (update.status) currentSeller.status = update.status;
    if (update.subscription) currentSeller.subscription = update.subscription;
    return result(currentSeller);
  });

  const res = await invoke(updateSellerStatus, { id: sellerId }, { status: 'Approved' });

  assert.equal(res.status, 200);
  assert.equal(currentSeller.status, 'Approved');
  // Stays expired, endDate was NOT moved forward
  assert.equal(currentSeller.subscription.endDate.getTime(), pastEnd.getTime());
  assert.notEqual(currentSeller.subscription.status, 'active');
});

test('Seller Approval: re-approving an expired paid seller does NOT grant a free 30-day pass', async () => {
  const sellerId = '607f1f77bcf86cd799439088';
  const pastApproval = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let currentSeller: any = {
    _id: sellerId,
    sellerName: 'Expired Paid Merchant',
    mobile: '9876543288',
    email: 'expiredpaid@example.test',
    status: 'Rejected', // e.g. suspended
    firstApprovedAt: pastApproval,
    subscription: {
      status: 'expired',
      planName: 'Monthly Starter',
      durationInDays: 30,
      amount: 499,
      startDate: pastApproval,
      endDate: pastEnd,
    },
  };

  patch(Seller, 'findById', (id: any) => result(currentSeller));
  patch(Seller, 'findByIdAndUpdate', (id: any, update: any) => {
    if (update.status) currentSeller.status = update.status;
    if (update.subscription) currentSeller.subscription = update.subscription;
    return result(currentSeller);
  });

  const res = await invoke(updateSellerStatus, { id: sellerId }, { status: 'Approved' });

  assert.equal(res.status, 200);
  assert.equal(currentSeller.status, 'Approved');
  // Stays expired, no 30-day pass given
  assert.equal(currentSeller.subscription.endDate.getTime(), pastEnd.getTime());
  assert.notEqual(currentSeller.subscription.planName, 'New Merchant Trial Pass');
});

test('Seller Approval: re-approving an active paid merchant preserves stacked days', async () => {
  const sellerId = '607f1f77bcf86cd799439077';
  const firstApproved = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  // Seller renewed multiple times and has 75 days remaining
  const stackedEndDate = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000);

  let currentSeller: any = {
    _id: sellerId,
    sellerName: 'Active Stacked Merchant',
    mobile: '9876543277',
    email: 'stacked@example.test',
    status: 'Pending', // e.g. temporary review
    firstApprovedAt: firstApproved,
    subscription: {
      status: 'active',
      planName: 'Monthly Starter',
      durationInDays: 30,
      amount: 499,
      startDate: firstApproved,
      endDate: stackedEndDate,
    },
  };

  patch(Seller, 'findById', (id: any) => result(currentSeller));
  patch(Seller, 'findByIdAndUpdate', (id: any, update: any) => {
    if (update.status) currentSeller.status = update.status;
    if (update.subscription) currentSeller.subscription = update.subscription;
    return result(currentSeller);
  });

  const res = await invoke(updateSellerStatus, { id: sellerId }, { status: 'Approved' });

  assert.equal(res.status, 200);
  assert.equal(currentSeller.status, 'Approved');
  // Exact 75-day stacked endDate is preserved, not truncated or overwritten
  assert.equal(currentSeller.subscription.endDate.getTime(), stackedEndDate.getTime());
});

test('Seller Approval: legacy seller with no subscription gets 30-day trial pass upon first approval', async () => {
  const sellerId = '607f1f77bcf86cd799439022';
  let currentSeller: any = {
    _id: sellerId,
    sellerName: 'Legacy Merchant',
    mobile: '9876543222',
    email: 'legacy@example.test',
    status: 'Pending',
    firstApprovedAt: null,
    subscription: undefined,
  };

  patch(Seller, 'findById', (id: any) => result(currentSeller));
  patch(Seller, 'findByIdAndUpdate', (id: any, update: any) => {
    if (update.status) currentSeller.status = update.status;
    if (update.firstApprovedAt) currentSeller.firstApprovedAt = update.firstApprovedAt;
    if (update.subscription) currentSeller.subscription = update.subscription;
    return result(currentSeller);
  });

  const nowBefore = Date.now();
  const res = await invoke(updateSellerStatus, { id: sellerId }, { status: 'Approved' });

  assert.equal(res.status, 200);
  assert.equal(res.success, true);
  assert.equal(currentSeller.status, 'Approved');
  assert.ok(currentSeller.firstApprovedAt);
  assert.equal(currentSeller.subscription.status, 'active');
  assert.equal(currentSeller.subscription.planName, 'New Merchant Trial Pass');
  assert.ok(currentSeller.subscription.startDate.getTime() >= nowBefore);
  assert.ok(currentSeller.subscription.endDate.getTime() >= nowBefore + 29 * 24 * 60 * 60 * 1000);
});

test('Seller Approval: paid upfront registration gets duration counted from first approval time', async () => {
  const sellerId = '607f1f77bcf86cd799439033';
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  let currentSeller: any = {
    _id: sellerId,
    sellerName: 'Paid Merchant',
    mobile: '9876543233',
    email: 'paid@example.test',
    status: 'Pending',
    firstApprovedAt: null,
    subscription: {
      planId: 'plan123',
      planName: 'Quarterly Growth',
      amount: 1299,
      durationInDays: 90,
      status: 'active',
      startDate: threeDaysAgo,
      endDate: new Date(threeDaysAgo.getTime() + 90 * 24 * 60 * 60 * 1000),
    },
  };

  patch(Seller, 'findById', (id: any) => result(currentSeller));
  patch(Seller, 'findByIdAndUpdate', (id: any, update: any) => {
    if (update.status) currentSeller.status = update.status;
    if (update.firstApprovedAt) currentSeller.firstApprovedAt = update.firstApprovedAt;
    if (update.subscription) currentSeller.subscription = update.subscription;
    return result(currentSeller);
  });

  const nowBefore = Date.now();
  const res = await invoke(updateSellerStatus, { id: sellerId }, { status: 'Approved' });

  assert.equal(res.status, 200);
  assert.equal(res.success, true);
  assert.equal(currentSeller.status, 'Approved');
  assert.ok(currentSeller.firstApprovedAt);
  assert.equal(currentSeller.subscription.status, 'active');
  assert.equal(currentSeller.subscription.durationInDays, 90);
  assert.ok(currentSeller.subscription.startDate.getTime() >= nowBefore);
  assert.ok(currentSeller.subscription.endDate.getTime() >= nowBefore + 89 * 24 * 60 * 60 * 1000);
});

test('ensureSubscriptionHealth: backfills firstApprovedAt for existing approved sellers missing it', async () => {
  const SubscriptionPlan = (await import('../models/SubscriptionPlan')).default;
  const { ensureSubscriptionHealth } = await import('../utils/ensureSubscriptionHealth');

  patch(SubscriptionPlan, 'countDocuments', async () => 3);

  const legacyCreatedAt = new Date('2025-01-15T10:00:00Z');
  const legacyApproved = [
    { _id: 'seller_approved_1', createdAt: legacyCreatedAt, status: 'Approved' },
  ];

  let updatedId: any = null;
  let updatePayload: any = null;

  patch(Seller, 'find', (query: any) => {
    if (query.status === 'Approved') {
      return result(legacyApproved);
    }
    return result([]);
  });

  patch(Seller, 'updateOne', async (filter: any, update: any) => {
    updatedId = filter._id;
    updatePayload = update;
    return { modifiedCount: 1 };
  });

  await ensureSubscriptionHealth();

  assert.equal(updatedId, 'seller_approved_1');
  assert.equal(updatePayload.$set.firstApprovedAt.getTime(), legacyCreatedAt.getTime());
});
