import { Inject, Service } from 'typedi';
import { LessThan, Repository } from 'typeorm';
import { Session } from '../../entities/session.entity';
import { User } from '../users/user.entity';

@Service()
export class SessionService {
  constructor(
    @Inject('SessionRepository') private sessionRepository: Repository<Session>,
    @Inject('UserRepository') private userRepository: Repository<User>
  ) {}

  private sanitizeIpAddress(ipAddress?: string): string | null {
    if (!ipAddress || ipAddress === 'unknown') {
      return null;
    }

    // Basic IP validation (IPv4 and IPv6)
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    if (ipv4Regex.test(ipAddress) || ipv6Regex.test(ipAddress)) {
      return ipAddress;
    }

    // Handle comma-separated IPs (from x-forwarded-for)
    const firstIp = ipAddress.split(',')[0].trim();
    if (ipv4Regex.test(firstIp) || ipv6Regex.test(firstIp)) {
      return firstIp;
    }

    return null;
  }

  async createSession(userId: string, sessionId: string, ipAddress?: string, userAgent?: string): Promise<Session> {
    const base: Partial<Session> = {
      userId,
      sessionId,
      ipAddress: this.sanitizeIpAddress(ipAddress),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };
    if (userAgent !== undefined) {
      (base as any).userAgent = userAgent;
    }
    const session = this.sessionRepository.create(base);
    const saved = await this.sessionRepository.save(session);
    // Normalize optional userAgent to undefined when not provided
    if (userAgent === undefined && (saved as any).userAgent === null) {
      delete (saved as any).userAgent;
    }
    return saved;
  }

  async findActiveSession(sessionId: string): Promise<Session | null> {
    return this.sessionRepository.findOne({
      where: { sessionId, isActive: true },
      relations: ['user']
    });
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.sessionRepository.update({ sessionId }, { isActive: false });
  }

  async invalidateAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepository.update({ userId }, { isActive: false });
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.sessionRepository.delete({ expiresAt: LessThan(new Date()) });
  }

  async getUserActiveSessions(userId: string): Promise<Session[]> {
    return this.sessionRepository.find({
      where: { userId, isActive: true },
      order: { lastActivity: 'DESC' }
    });
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    await this.sessionRepository.update({ sessionId }, { lastActivity: new Date() });
  }
}
