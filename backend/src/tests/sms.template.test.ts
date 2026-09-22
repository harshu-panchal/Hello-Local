import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOtpMessage, resolveSmsCredentials } from '../services/otpService';

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
