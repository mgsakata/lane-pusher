import crypto from 'node:crypto';

/** A fresh random 256-bit session key. */
export function makeSessionKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Decrypt an AES-256-GCM payload produced by the browser's Web Crypto, which
 * appends the 16-byte auth tag to the ciphertext. Throws on any tampering.
 */
export function decryptPayload(key: Buffer, ivB64: string, dataB64: string): unknown {
  const iv = Buffer.from(ivB64, 'base64');
  const buf = Buffer.from(dataB64, 'base64');
  if (iv.length !== 12 || buf.length < 17) throw new Error('malformed payload');

  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
