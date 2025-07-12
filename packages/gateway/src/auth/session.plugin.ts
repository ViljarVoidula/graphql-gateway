import { Plugin } from '@envelop/types';
import { getSession, updateSessionActivity, SESSION_COOKIE_NAME, YogaContext } from './session.config';
import { JWTService } from './jwt.service';
import { Container } from 'typedi';

export const useSession = (): Plugin => {
  return {
    onContextBuilding: async ({ context, extendContext }) => {
      // Access the request from the context
      const request = (context as any).request;
      const jwtService = Container.get(JWTService);
      
      let sessionId: string | null = null;
      let sessionData = null;

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
          const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            if (key && value) {
              acc[key] = value;
            }
            return acc;
          }, {} as Record<string, string>);
          
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
      
      // Extend context with session and user data
      extendContext({
        session: sessionData,
        user: sessionData?.isAuthenticated ? {
          id: sessionData.userId,
          email: sessionData.email,
          permissions: sessionData.permissions || []
        } : null,
        sessionId
      });
    }
  };
};
