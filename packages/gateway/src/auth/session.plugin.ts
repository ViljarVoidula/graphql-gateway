import { Plugin } from '@envelop/types';
import { Container } from 'typedi';
import { PermissionService } from '../services/permissions/permission.service';
import { ApiKeyService } from './api-key.service';
import { JWTService } from './jwt.service';
import {
  getSession,
  SESSION_COOKIE_NAME,
  updateSessionActivity,
} from './session.config';

export const useSession = (): Plugin => {
  return {
    onContextBuilding: async ({ context, extendContext }) => {
      // Access the request from the context
      const request = (context as any).request;
      const jwtService = Container.get(JWTService);
      const apiKeyService = Container.get(ApiKeyService);
      const permissionService = Container.get(PermissionService);

      let sessionId: string | null = null;
      let sessionData = null;
      let apiKeyContext = null;

      // Try API Key authentication first (X-API-Key header)
      const apiKeyHeader = request?.headers?.get('x-api-key');
      if (apiKeyHeader) {
        apiKeyContext = await apiKeyService.validateApiKey(apiKeyHeader);
        if (apiKeyContext) {
          const permissionProfile =
            await permissionService.getPermissionProfileForUser(
              apiKeyContext.user.id
            );
          // Extend context with API key authentication
          extendContext({
            session: null,
            user: apiKeyContext.user,
            application: apiKeyContext.application,
            apiKey: apiKeyContext.apiKeyEntity,
            sessionId: null,
            authType: 'api-key',
            permissionProfile,
          });
          return;
        }
      }

      // Try JWT authentication first (Authorization header)
      const authHeader = request?.headers?.get('authorization');
      if (authHeader) {
        const token = jwtService.extractTokenFromHeader(authHeader);
        if (token) {
          const jwtPayload = jwtService.verifyAccessToken(token);
          if (jwtPayload) {
            sessionId = jwtPayload.sessionId;
            sessionData = await getSession(sessionId);
          }
        }
      }

      // Fallback to cookie-based session if JWT not present or invalid
      if (!sessionData) {
        const cookieHeader = request?.headers?.get('cookie');
        if (cookieHeader) {
          const cookies = cookieHeader.split(';').reduce(
            (acc, cookie) => {
              const [key, value] = cookie.trim().split('=');
              if (key && value) {
                acc[key] = value;
              }
              return acc;
            },
            {} as Record<string, string>
          );

          sessionId = cookies[SESSION_COOKIE_NAME] || null;
          if (sessionId) {
            sessionData = await getSession(sessionId);
          }
        }
      }

      // Update session activity if session exists
      if (sessionData && sessionId) {
        await updateSessionActivity(sessionId);
      }

      const permissionProfile = sessionData?.isAuthenticated
        ? await permissionService.getPermissionProfileForUser(
            sessionData.userId
          )
        : null;

      // Extend context with session/JWT data
      extendContext({
        session: sessionData,
        user: sessionData?.isAuthenticated
          ? {
              id: sessionData.userId,
              email: sessionData.email,
              permissions: sessionData.permissions || [],
            }
          : null,
        application: null,
        apiKey: null,
        sessionId,
        authType: sessionData?.isAuthenticated ? 'session' : null,
        permissionProfile,
      });
    },
  };
};
