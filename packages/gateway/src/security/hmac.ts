import crypto from 'crypto';

export interface HMACRequest {
  method: string;
  url: string;
  body?: string;
  timestamp: number;
  keyId: string;
}

export interface HMACHeaders {
  'X-HMAC-Signature': string;
  'X-HMAC-Timestamp': string;
  'X-HMAC-Key-ID': string;
}

export class HMACUtils {
  private static readonly ALGORITHM = 'sha256';
  private static readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate HMAC signature for a request
   */
  static generateSignature(request: HMACRequest, secretKey: string): string {
    const payload = this.createPayload(request);
    return crypto
      .createHmac(this.ALGORITHM, secretKey)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify HMAC signature for a request
   */
  static verifySignature(
    request: HMACRequest,
    signature: string,
    secretKey: string,
    timeoutMs: number = this.DEFAULT_TIMEOUT_MS
  ): boolean {
    // Check timestamp to prevent replay attacks
    const now = Date.now();
    if (Math.abs(now - request.timestamp) > timeoutMs) {
      console.warn(`HMAC timestamp verification failed. Request time: ${request.timestamp}, Current time: ${now}`);
      return false;
    }

    // Verify signature
    const expectedSignature = this.generateSignature(request, secretKey);
    return crypto.timingSafeEqual(
      new Uint8Array(Buffer.from(signature, 'hex')),
      new Uint8Array(Buffer.from(expectedSignature, 'hex'))
    );
  }

  /**
   * Create HMAC headers for outbound requests
   */
  static createHeaders(request: Omit<HMACRequest, 'timestamp'>, secretKey: string): HMACHeaders {
    const timestamp = Date.now();
    const hmacRequest: HMACRequest = {
      ...request,
      timestamp,
    };

    const signature = this.generateSignature(hmacRequest, secretKey);

    return {
      'X-HMAC-Signature': signature,
      'X-HMAC-Timestamp': timestamp.toString(),
      'X-HMAC-Key-ID': request.keyId,
    };
  }

  /**
   * Parse HMAC headers from incoming request
   */
  static parseHeaders(headers: Record<string, string | string[] | undefined>): {
    signature: string;
    timestamp: number;
    keyId: string;
  } | null {
    const signature = this.getHeader(headers, 'x-hmac-signature');
    const timestampStr = this.getHeader(headers, 'x-hmac-timestamp');
    const keyId = this.getHeader(headers, 'x-hmac-key-id');

    if (!signature || !timestampStr || !keyId) {
      return null;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return null;
    }

    return { signature, timestamp, keyId };
  }

  /**
   * Create standardized payload for HMAC calculation
   */
  private static createPayload(request: HMACRequest): string {
    const bodyHash = request.body 
      ? crypto.createHash('sha256').update(request.body).digest('hex')
      : '';
    
    return [
      request.method.toUpperCase(),
      request.url,
      bodyHash,
      request.timestamp.toString(),
      request.keyId
    ].join('\n');
  }

  /**
   * Get header value (case-insensitive)
   */
  private static getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | null {
    const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    if (!key) return null;
    
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value || null;
  }
}
