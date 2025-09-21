import crypto from 'crypto';

/**
 * Simple AES-256-GCM encryption helper for storing small secrets at rest.
 * The master key is derived from env GATEWAY_SECRET (recommended) or ENCRYPTION_KEY.
 *
 * Storage format is JSON with base64 fields: { iv, tag, ciphertext }.
 */
export type EncryptedPayload = {
  iv: string; // base64
  tag: string; // base64 auth tag
  ciphertext: string; // base64
};

function getMasterKey(): Buffer {
  // Preferred: GATEWAY_SECRET passphrase -> derive a stable 32-byte key via scrypt
  const pass = process.env.GATEWAY_SECRET || process.env.ENCRYPTION_KEY;
  if (!pass || pass.length === 0) {
    throw new Error('Missing GATEWAY_SECRET or ENCRYPTION_KEY for encryption');
  }
  // If ENCRYPTION_KEY looks like a 32-byte base64 or 64-hex, try to parse directly
  if (process.env.ENCRYPTION_KEY) {
    const ek = process.env.ENCRYPTION_KEY.trim();
    try {
      if (/^[A-Fa-f0-9]{64}$/.test(ek)) return Buffer.from(ek, 'hex');
      const b = Buffer.from(ek, 'base64');
      if (b.length === 32) return b;
    } catch {}
  }
  // Derive with scrypt from passphrase (salt constant within app; rotate by changing GATEWAY_SECRET)
  return crypto.scryptSync(pass, 'gateway.salt.v1', 32);
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce recommended for GCM
  const nodeCrypto: any = crypto as any;
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext: Buffer = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag: Buffer = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getMasterKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const nodeCrypto: any = crypto as any;
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext: Buffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
