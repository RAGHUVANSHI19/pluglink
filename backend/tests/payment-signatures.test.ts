import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyHmac } from '../src/payments.js';

describe('payment signature verification', () => {
  const secret = 'local-testing-signature-secret';
  const body = Buffer.from('{"event":"payment.captured","amount":3200}');
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid signature for the original request bytes', () => {
    expect(verifyHmac(secret, body, signature)).toBe(true);
  });

  it('rejects a different event body, secret, or malformed signature', () => {
    expect(verifyHmac(secret, body.toString().replace('3200', '3201'), signature)).toBe(false);
    expect(verifyHmac('different-secret', body, signature)).toBe(false);
    expect(verifyHmac(secret, body, 'invalid')).toBe(false);
  });
});
