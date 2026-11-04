process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_1234567890';
process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Seller from '../models/Seller';
import SubscriptionPayment from '../models/SubscriptionPayment';
import { grantSubscriptionAdmin } from '../controllers/subscriptionPlanController';

test('Subscription Admin Grant: successfully grants days and writes audit record', async () => {
  const dummySellerId = new mongoose.Types.ObjectId();
  const mockSeller = {
    _id: dummySellerId,
    sellerName: 'Test Vendor',
    storeName: 'Test Store',
    mobile: '9876543210',
    subscription: {
      status: 'expired',
      endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    save: async function () {
      return this;
    },
  };

  const originalFindById = Seller.findById;
  const originalPaymentCreate = SubscriptionPayment.create;

  let createdPaymentPayload: any = null;

  (Seller as any).findById = async (id: any) => {
    if (id.toString() === dummySellerId.toString()) return mockSeller;
    return null;
  };

  (SubscriptionPayment as any).create = async (payload: any) => {
    createdPaymentPayload = payload;
    return payload;
  };

  try {
    let responseStatus = 200;
    let responseJson: any = null;

    const mockReq = {
      body: {
        sellerId: dummySellerId.toString(),
        durationInDays: 30,
        planName: '30-Day Support Extension',
        notes: 'Granted for support ticket #1234',
      },
    } as any;

    await new Promise<void>((resolve, reject) => {
      const mockRes = {
        status: (code: number) => {
          responseStatus = code;
          return mockRes;
        },
        json: (data: any) => {
          responseJson = data;
          resolve();
          return mockRes;
        },
      } as any;

      (grantSubscriptionAdmin as any)(mockReq, mockRes, reject);
    });

    assert.equal(responseStatus, 200);
    assert.equal(responseJson.success, true);
    assert.equal(mockSeller.subscription.status, 'active');
    assert.ok(mockSeller.subscription.endDate > new Date());

    // Verify audit record
    assert.ok(createdPaymentPayload, 'SubscriptionPayment record must be created');
    assert.equal(createdPaymentPayload.amount, 0);
    assert.equal(createdPaymentPayload.durationInDays, 30);
    assert.equal(createdPaymentPayload.paymentMethod, 'ADMIN_GRANT');
    assert.equal(createdPaymentPayload.status, 'SUCCESS');
    assert.equal(createdPaymentPayload.notes, 'Granted for support ticket #1234');
    assert.ok(createdPaymentPayload.razorpayOrderId.startsWith('ADMIN_GRANT_'));
  } finally {
    Seller.findById = originalFindById;
    SubscriptionPayment.create = originalPaymentCreate;
  }
});
