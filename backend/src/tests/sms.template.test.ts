import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOtpMessage, resolveSmsCredentials, handleSmsResponse, sendSmsOtp, sendOTP, verifySmsOtp, verifyOTP } from '../services/otpService';
import axios from 'axios';
import Otp from '../models/Otp';

test('SMS India Hub: buildOtpMessage constructs exact DLT template with variables', () => {
  const msg = buildOtpMessage('5829');
  assert.equal(
    msg,
    'Welcome to Hello Local, powered by BGADPL. Your OTP for registration is 5829. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL'
  );
});

test('SMS India Hub: buildOtpMessage supports custom app name and poweredBy', () => {
  const customTemplate = 'Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL';
  const msg = buildOtpMessage('9999', customTemplate);
  assert.ok(msg.includes('5 minutes') === false);
  assert.ok(msg.includes('10 minutes'));
  assert.ok(msg.includes('9999'));
  assert.ok(msg.endsWith('BGADPL'));
});

test('SMS India Hub: resolveSmsCredentials returns BGADPL and 1077104580057767222', async () => {
  const creds = await resolveSmsCredentials();
  assert.equal(creds.senderId, 'BGADPL');
  assert.equal(creds.dltTemplateId, '1077104580057767222');
  assert.ok(creds.template?.includes('BGADPL'));
});

test('SMS India Hub: accepts documented JSON success and legacy job responses', () => {
  for (const response of [
    { ErrorCode: '000', ErrorMessage: 'Success', JobId: 'job-123', MessageData: [] },
    { ErrorCode: '000', ErrorMessage: 'Done' },
    JSON.stringify({ ErrorCode: '000', ErrorMessage: 'Success' }),
    'JobId#job-123',
    '123456',
  ]) assert.doesNotThrow(() => handleSmsResponse(response));
});

test('SMS India Hub: explicit failures override job ids and message data', () => {
  for (const code of ['001', '006', '007', '021', '999']) {
    assert.throws(() => handleSmsResponse({
      ErrorCode: code, ErrorMessage: 'Done', JobId: 'job-123', MessageData: [],
    }), /SMS India HUB/);
  }
  assert.throws(() => handleSmsResponse({ ErrorCode: '000', ErrorMessage: 'Failed' }));
});

test('SMS India Hub: rejects empty, malformed and unconfirmed responses', () => {
  for (const response of [undefined, null, {}, [], '', ' ', 0, '0', '<html>error</html>',
    'Failed#invalid key', '{bad json', 'unknown', { MessageData: [] }, { JobId: 'job-123' }]) {
    assert.throws(() => handleSmsResponse(response), /SMS India HUB/);
  }
});

test('SMS India Hub: all four OTP roles send and verify through existing flows', async () => {
  const keys = ['SMS_INDIA_HUB_API_KEY', 'USE_MOCK_OTP', 'TEST_PHONE'];
  const previous = keys.map(key => process.env[key]);
  const originals = { get: axios.get, create: Otp.create, deleteMany: Otp.deleteMany,
    findOne: Otp.findOne, deleteOne: Otp.deleteOne, findOneAndUpdate: Otp.findOneAndUpdate,
    findOneAndDelete: Otp.findOneAndDelete };
  const requests: any[] = [];
  let record: any;
  try {
    process.env.SMS_INDIA_HUB_API_KEY = 'test-key-no-network';
    process.env.USE_MOCK_OTP = 'false';
    process.env.TEST_PHONE = '0000000000';
    (axios as any).get = async (url: string, options: any) => {
      requests.push({ url, ...options });
      return { data: { ErrorCode: '000', ErrorMessage: 'Success', JobId: 'test-job' } };
    };
    (Otp as any).deleteMany = async () => ({});
    (Otp as any).create = async (value: any) => { record = { ...value, _id: 'test-otp' }; return record; };
    (Otp as any).findOne = () => ({ sort: async () => record });
    (Otp as any).findOneAndUpdate = async (filter: any, update: any) => {
      if (update.$set) record = { ...update.$set, _id: filter._id };
      else if (record) record.attempts += 1;
      return record;
    };
    (Otp as any).findOneAndDelete = async () => { const value = record; record = null; return value; };
    (Otp as any).deleteOne = async () => { record = null; return {}; };
    for (const role of ['Customer', 'Delivery', 'Seller', 'Admin'] as const) {
      const mobile = '9876543210';
      const result = role === 'Customer' || role === 'Delivery'
        ? await sendSmsOtp(mobile, role) : await sendOTP(mobile, role);
      assert.equal(result.success, true);
      assert.equal(record.userType, role);
      assert.match(record.otp, /^\d{4}$/);
      const otp = record.otp;
      const request = requests[requests.length - 1];
      assert.equal(request.url, 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx');
      assert.equal(request.params.msisdn, '919876543210');
      assert.ok(request.params.msg.includes(otp));
      const verified = role === 'Customer' || role === 'Delivery'
        ? await verifySmsOtp(result.sessionId!, otp, mobile, role) : await verifyOTP(mobile, otp, role);
      assert.equal(verified, true);
      assert.equal(record, null);
    }
    assert.equal(requests.length, 4);
    (axios as any).get = async () => ({ data: { ErrorCode: '021', ErrorMessage: 'Insufficient credits' } });
    await assert.rejects(sendSmsOtp('9876543210', 'Customer'), /Insufficient credits/);
    await assert.rejects(sendOTP('9876543210', 'Seller'), /Insufficient credits/);
  } finally {
    axios.get = originals.get;
    Otp.create = originals.create;
    Otp.deleteMany = originals.deleteMany;
    Otp.findOne = originals.findOne;
    Otp.deleteOne = originals.deleteOne;
    Otp.findOneAndUpdate = originals.findOneAndUpdate;
    Otp.findOneAndDelete = originals.findOneAndDelete;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
