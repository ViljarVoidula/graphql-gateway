import crypto from 'crypto';
import { log } from '../utils/logger';

export interface ServiceKey {
  keyId: string;
  secretKey: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'revoked';
}

export interface ServiceKeyInfo {
  url: string;
  keyId: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'revoked';
}

export class KeyManager {
  private keys: Map<string, ServiceKey> = new Map(); // keyId -> ServiceKey
  private serviceKeys: Map<string, string[]> = new Map(); // serviceUrl -> keyIds[]

  /**
   * Generate a new HMAC key for a service
   */
  generateKey(serviceUrl: string): ServiceKey {
    const keyId = this.generateKeyId(serviceUrl);
    const secretKey = this.generateSecretKey();
    
    const key: ServiceKey = {
      keyId,
      secretKey,
      createdAt: new Date(),
      status: 'active'
    };

    this.keys.set(keyId, key);
    
    // Track keys by service URL
    if (!this.serviceKeys.has(serviceUrl)) {
      this.serviceKeys.set(serviceUrl, []);
    }
    this.serviceKeys.get(serviceUrl)!.push(keyId);

    log.debug(`Generated new HMAC key for service: ${serviceUrl}, keyId: ${keyId}`);
    return key;
  }

  /**
   * Get active key for a service
   */
  getActiveKey(serviceUrl: string): ServiceKey | null {
    const keyIds = this.serviceKeys.get(serviceUrl);
    if (!keyIds || keyIds.length === 0) {
      return null;
    }

    // Find the most recent active key
    const activeKeys = keyIds
      .map(id => this.keys.get(id))
      .filter((key): key is ServiceKey => key !== undefined && key.status === 'active')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return activeKeys[0] || null;
  }

  /**
   * Get key by keyId
   */
  getKey(keyId: string): ServiceKey | null {
    return this.keys.get(keyId) || null;
  }

  /**
   * Revoke a key
   */
  revokeKey(keyId: string): boolean {
    const key = this.keys.get(keyId);
    if (!key) {
      return false;
    }

    key.status = 'revoked';
    log.debug(`Revoked HMAC key: ${keyId}`);
    return true;
  }

  /**
   * Rotate key for a service (generate new, keep old active briefly)
   */
  rotateKey(serviceUrl: string): ServiceKey {
    const newKey = this.generateKey(serviceUrl);
    
    // Optionally set expiration for old keys after rotation
    const oldKeyIds = this.serviceKeys.get(serviceUrl) || [];
    const oldActiveKeys = oldKeyIds
      .map(id => this.keys.get(id))
      .filter((key): key is ServiceKey => 
        key !== undefined && 
        key.status === 'active' && 
        key.keyId !== newKey.keyId
      );

    // Set old keys to expire in 1 hour (grace period)
    oldActiveKeys.forEach(key => {
      key.expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    });

    log.debug(`Rotated HMAC key for service: ${serviceUrl}, new keyId: ${newKey.keyId}`);
    return newKey;
  }

  /**
   * Get all keys for a service
   */
  getServiceKeys(serviceUrl: string): ServiceKeyInfo[] {
    const keyIds = this.serviceKeys.get(serviceUrl) || [];
    return keyIds
      .map(id => this.keys.get(id))
      .filter((key): key is ServiceKey => key !== undefined)
      .map(key => ({
        url: serviceUrl,
        keyId: key.keyId,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        status: key.status
      }));
  }

  /**
   * Remove service and all its keys
   */
  removeService(serviceUrl: string): boolean {
    const keyIds = this.serviceKeys.get(serviceUrl);
    if (!keyIds) {
      return false;
    }

    // Remove all keys for this service
    keyIds.forEach(keyId => {
      this.keys.delete(keyId);
    });

    this.serviceKeys.delete(serviceUrl);
    log.debug(`Removed service and all keys: ${serviceUrl}`);
    return true;
  }

  /**
   * Clean up expired keys
   */
  cleanupExpiredKeys(): number {
    const now = new Date();
    let cleanedCount = 0;

    for (const [keyId, key] of this.keys.entries()) {
      if (key.expiresAt && key.expiresAt < now) {
        this.keys.delete(keyId);
        
        // Remove from service keys tracking
        for (const [serviceUrl, keyIds] of this.serviceKeys.entries()) {
          const index = keyIds.indexOf(keyId);
          if (index > -1) {
            keyIds.splice(index, 1);
            if (keyIds.length === 0) {
              this.serviceKeys.delete(serviceUrl);
            }
            break;
          }
        }
        
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log.debug(`Cleaned up ${cleanedCount} expired HMAC keys`);
    }

    return cleanedCount;
  }

  /**
   * Get all registered services
   */
  getServices(): string[] {
    return Array.from(this.serviceKeys.keys());
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalKeys: number;
    activeKeys: number;
    revokedKeys: number;
    services: number;
  } {
    const allKeys = Array.from(this.keys.values());
    return {
      totalKeys: allKeys.length,
      activeKeys: allKeys.filter(k => k.status === 'active').length,
      revokedKeys: allKeys.filter(k => k.status === 'revoked').length,
      services: this.serviceKeys.size
    };
  }

  /**
   * Generate a unique key ID
   */
  private generateKeyId(serviceUrl: string): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    const urlHash = crypto.createHash('sha256').update(serviceUrl).digest('hex').substring(0, 8);
    return `${urlHash}_${timestamp}_${random}`;
  }

  /**
   * Generate a cryptographically secure secret key
   */
  private generateSecretKey(): string {
    return crypto.randomBytes(32).toString('hex'); // 256-bit key
  }
}

// Singleton instance
export const keyManager = new KeyManager();
