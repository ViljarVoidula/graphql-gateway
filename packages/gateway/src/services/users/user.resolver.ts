import { GraphQLError } from 'graphql';
import {
  Arg,
  Ctx,
  Directive,
  FieldResolver,
  ID,
  Mutation,
  Query,
  Resolver,
  Root,
} from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Repository } from 'typeorm';
import { AuthResponse, RefreshTokenResponse } from '../../auth/auth.types';
import { JWTService } from '../../auth/jwt.service';
import { RefreshTokenInput } from '../../auth/refresh-token.input';
import {
  createSessionId,
  deleteAllUserSessions,
  deleteSession,
  saveSession,
  SESSION_COOKIE_NAME,
  YogaContext,
} from '../../auth/session.config';
import {
  AuditCategory,
  AuditEventType,
  AuditSeverity,
} from '../../entities/audit-log.entity';
import { Service as ServiceEntity } from '../../entities/service.entity';
import { Session } from '../../entities/session.entity';
import { log } from '../../utils/logger';
import { AuditLogService } from '../audit/audit-log.service';
import { SessionService } from '../sessions/session.service';
import { LoginInput } from './login.input';
import { UserUpdateInput } from './user-update.input';
import { User } from './user.entity';
import { UserInput } from './user.input';

@Service()
@Resolver(User)
export class UserResolver {
  constructor(
    @Inject('UserRepository') private readonly userRepository: Repository<User>,
    @Inject() private readonly sessionService: SessionService,
    @Inject() private readonly jwtService: JWTService,
    @Inject('ServiceRepository')
    private readonly serviceRepository: Repository<ServiceEntity>
  ) {}

  @Query((_returns) => [User])
  @Directive('@authz(rules: ["isAdmin"])')
  async users(@Ctx() context: YogaContext): Promise<User[]> {
    return this.userRepository.find();
  }

  @Query((_returns) => User, { nullable: true })
  @Directive('@authz(rules: ["isAuthenticated"])')
  async user(
    @Arg('id', () => ID) id: string,
    @Ctx() context: YogaContext
  ): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  @Query((_returns) => User, { nullable: true })
  @Directive('@authz(rules: ["isAuthenticated"])')
  async me(@Ctx() context: YogaContext): Promise<User | null> {
    if (!context.user) return null;
    return this.userRepository.findOneBy({ id: context.user.id });
  }

  @Mutation((_returns) => User)
  async createUser(@Arg('data') data: UserInput): Promise<User> {
    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      const existingUser = await this.userRepository.findOneBy({
        email: normalizedEmail,
      });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const requestedPermissions =
        data.permissions && data.permissions.length > 0
          ? data.permissions
          : ['user'];
      const normalizedPermissions = Array.from(
        new Set(
          requestedPermissions
            .map((permission) => permission.trim().toLowerCase())
            .filter((permission) => permission.length > 0)
        )
      );
      const finalPermissions =
        normalizedPermissions.length > 0 ? normalizedPermissions : ['user'];

      const user = this.userRepository.create({
        email: normalizedEmail,
        permissions: finalPermissions,
        isEmailVerified: data.isEmailVerified ?? false,
      });
      user.setPassword(data.password);
      const savedUser = await this.userRepository.save(user);
      return savedUser;
    } catch (error) {
      if (error instanceof Error) {
        throw new GraphQLError(`Failed to create user: ${error.message}`);
      }
      throw new GraphQLError('Failed to create user: Unknown error');
    }
  }

  @Mutation((_returns) => AuthResponse)
  async login(
    @Arg('data') data: LoginInput,
    @Ctx() context: YogaContext
  ): Promise<AuthResponse> {
    const request = (context as any).request;
    const ipAddress =
      request?.headers?.get('x-forwarded-for') ||
      request?.headers?.get('x-real-ip') ||
      request?.headers?.get('cf-connecting-ip') ||
      request?.socket?.remoteAddress ||
      'unknown';
    const userAgent = request?.headers?.get('user-agent') || 'unknown';
    const audit = new AuditLogService();

    try {
      const user = await this.userRepository.findOneBy({ email: data.email });
      if (!user) {
        await audit.log(AuditEventType.USER_LOGIN, {
          metadata: { email: data.email, reason: 'user_not_found' },
          category: AuditCategory.AUTHENTICATION,
          severity: AuditSeverity.LOW,
          action: 'login',
          success: false,
          ipAddress,
          userAgent,
          riskScore: 5,
        } as any);
        throw new GraphQLError('Invalid email or password');
      }

      if (user.isLocked) {
        await audit.log(AuditEventType.USER_LOGIN, {
          userId: user.id,
          metadata: { email: user.email, reason: 'account_locked' },
          category: AuditCategory.AUTHENTICATION,
          severity: AuditSeverity.HIGH,
          action: 'login',
          success: false,
          ipAddress,
          userAgent,
          riskScore: 70,
        });
        throw new GraphQLError(
          'Account is temporarily locked due to failed login attempts'
        );
      }

      const isPasswordValid = await user.comparePassword(data.password);
      if (!isPasswordValid) {
        user.failedLoginAttempts++;
        if (user.failedLoginAttempts >= 5) {
          user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        }
        await this.userRepository.save(user);
        await audit.log(AuditEventType.USER_LOGIN, {
          userId: user.id,
          metadata: {
            email: user.email,
            failedAttempts: user.failedLoginAttempts,
          },
          category: AuditCategory.AUTHENTICATION,
          severity:
            user.failedLoginAttempts >= 5
              ? AuditSeverity.HIGH
              : AuditSeverity.LOW,
          action: 'login',
          success: false,
          ipAddress,
          userAgent,
          riskScore: Math.min(10 + user.failedLoginAttempts * 10, 90),
        });
        throw new GraphQLError('Invalid email or password');
      }

      // Reset failed attempts on successful login
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      user.lastLoginAt = new Date();
      await this.userRepository.save(user);

      // Create session
      const sessionId = await createSessionId();
      const sessionData = {
        userId: user.id,
        email: user.email,
        isAuthenticated: true,
        loginTime: new Date(),
        lastActivity: new Date(),
        permissions: user.permissions || ['user'],
      };

      await saveSession(sessionId, sessionData);

      // Set cookie in response
      const response = (context as any).response;
      if (response && response.headers) {
        response.headers.set(
          'Set-Cookie',
          `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=${24 * 60 * 60}; Path=/`
        );
      }

      await this.sessionService.createSession(
        user.id,
        sessionId,
        ipAddress,
        userAgent
      );

      // Generate JWT tokens
      const tokens = this.jwtService.generateTokens({
        userId: user.id,
        email: user.email,
        permissions: user.permissions || ['user'],
        sessionId,
      });

      await audit.log(AuditEventType.USER_LOGIN, {
        userId: user.id,
        // sessionId column expects a UUID; our session token is random hex.
        // Store it inside metadata instead of the column to avoid invalid uuid errors.
        metadata: { email: user.email, sessionToken: sessionId },
        category: AuditCategory.AUTHENTICATION,
        severity: AuditSeverity.INFO,
        action: 'login',
        success: true,
        ipAddress,
        userAgent,
        riskScore: 0,
      });
      return { user, tokens, sessionId };
    } catch (error) {
      if (error instanceof Error) {
        throw new GraphQLError(`Login failed: ${error.message}`);
      }
      throw new GraphQLError('Login failed: Unknown error');
    }
  }

  @Mutation((_returns) => Boolean)
  @Directive('@authz(rules: ["isAuthenticated"])')
  async logout(@Ctx() context: YogaContext): Promise<boolean> {
    try {
      if (!context.sessionId) return false;

      // Delete session from Redis
      await deleteSession(context.sessionId);

      // Invalidate session in database
      await this.sessionService.invalidateSession(context.sessionId);

      // Clear cookie
      const response = (context as any).response;
      if (response && response.headers) {
        response.headers.set(
          'Set-Cookie',
          `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`
        );
      }

      // Audit log
      try {
        const audit = new AuditLogService();
        await audit.log(AuditEventType.USER_LOGIN, {
          userId: context.user?.id,
          action: 'logout',
          category: AuditCategory.AUTHENTICATION,
          severity: AuditSeverity.INFO,
          success: true,
          metadata: { reason: 'user_logout', sessionToken: context.sessionId },
        } as any);
      } catch {}
      return true;
    } catch (error) {
      log.error('Logout error:', error);
      return false;
    }
  }

  @Mutation((_returns) => Boolean)
  @Directive('@authz(rules: ["isAuthenticated"])')
  async logoutAll(@Ctx() context: YogaContext): Promise<boolean> {
    try {
      if (!context.user) return false;

      // Delete all user sessions from Redis
      await deleteAllUserSessions(context.user.id);

      // Invalidate all user sessions in database
      await this.sessionService.invalidateAllUserSessions(context.user.id);

      // Clear current session cookie
      const response = (context as any).response;
      if (response && response.headers) {
        response.headers.set(
          'Set-Cookie',
          `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`
        );
      }

      try {
        const audit = new AuditLogService();
        await audit.log(AuditEventType.USER_LOGIN, {
          userId: context.user.id,
          action: 'logout_all',
          category: AuditCategory.AUTHENTICATION,
          severity: AuditSeverity.INFO,
          success: true,
          metadata: { reason: 'user_logout_all' },
        } as any);
      } catch {}
      return true;
    } catch (error) {
      log.error('Logout all error:', error);
      return false;
    }
  }

  @FieldResolver(() => [Session])
  @Directive('@authz(rules: ["canAccessUserData"])')
  async sessions(
    @Root() user: User,
    @Ctx() context: YogaContext
  ): Promise<Session[]> {
    return this.sessionService.getUserActiveSessions(user.id);
  }

  @FieldResolver(() => [ServiceEntity])
  @Directive('@authz(rules: ["canAccessUserData"])')
  async ownedServices(@Root() user: User): Promise<ServiceEntity[]> {
    return this.serviceRepository.find({ where: { owner: { id: user.id } } });
  }

  @Mutation((_returns) => RefreshTokenResponse)
  async refreshToken(
    @Arg('data') data: RefreshTokenInput
  ): Promise<RefreshTokenResponse> {
    try {
      // Verify refresh token
      const refreshPayload = this.jwtService.verifyRefreshToken(
        data.refreshToken
      );
      if (!refreshPayload) {
        throw new GraphQLError('Invalid or expired refresh token');
      }

      // Validate session still exists
      const sessionData = await this.sessionService.findActiveSession(
        refreshPayload.sessionId
      );
      if (!sessionData || !sessionData.isActive) {
        throw new GraphQLError('Session no longer active');
      }

      // Get user and validate
      const user = await this.userRepository.findOneBy({
        id: refreshPayload.userId,
      });
      if (!user) {
        throw new GraphQLError('User not found');
      }

      // Generate new tokens
      const tokens = this.jwtService.generateTokens({
        userId: user.id,
        email: user.email,
        permissions: user.permissions || ['user'],
        sessionId: refreshPayload.sessionId,
      });

      return {
        tokens,
        user,
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new GraphQLError(`Token refresh failed: ${error.message}`);
      }
      throw new GraphQLError('Token refresh failed: Unknown error');
    }
  }

  @Mutation((_returns) => User)
  @Directive('@authz(rules: ["isAdmin"])')
  async updateUser(
    @Arg('id', () => ID) id: string,
    @Arg('data') data: UserUpdateInput,
    @Ctx() context: YogaContext
  ): Promise<User> {
    try {
      const user = await this.userRepository.findOneBy({ id });
      if (!user) {
        throw new GraphQLError('User not found');
      }

      // Check if email is being changed and if it's already taken
      if (data.email && data.email !== user.email) {
        const existingUser = await this.userRepository.findOneBy({
          email: data.email,
        });
        if (existingUser) {
          throw new GraphQLError('User with this email already exists');
        }
        user.email = data.email;
      }

      // Update permissions if provided
      if (data.permissions) {
        user.permissions = data.permissions;
      }

      // Update password if provided
      if (data.password) {
        user.setPassword(data.password);
      }

      // Update email verification status if provided
      if (data.isEmailVerified !== undefined) {
        user.isEmailVerified = data.isEmailVerified;
      }

      // Reset failed login attempts if requested
      if (data.resetFailedAttempts) {
        user.failedLoginAttempts = 0;
        user.lockedUntil = undefined;
      }

      const savedUser = await this.userRepository.save(user);
      return savedUser;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new GraphQLError(`Failed to update user: ${error.message}`);
      }
      throw new GraphQLError('Failed to update user: Unknown error');
    }
  }

  @Mutation((_returns) => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async deleteUser(
    @Arg('id', () => ID) id: string,
    @Ctx() context: YogaContext
  ): Promise<boolean> {
    try {
      const user = await this.userRepository.findOneBy({ id });
      if (!user) {
        throw new GraphQLError('User not found');
      }

      // Prevent deletion of the last admin user
      if (user.permissions.includes('admin')) {
        const adminCount = await this.userRepository.count({
          where: { permissions: 'admin' },
        });
        if (adminCount <= 1) {
          throw new GraphQLError('Cannot delete the last admin user');
        }
      }

      // Delete all user sessions
      await this.sessionService.invalidateAllUserSessions(id);
      await deleteAllUserSessions(id);

      // Delete the user
      await this.userRepository.remove(user);
      return true;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new GraphQLError(`Failed to delete user: ${error.message}`);
      }
      throw new GraphQLError('Failed to delete user: Unknown error');
    }
  }
}
