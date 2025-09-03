import { ExtendedYogaContext } from '../auth/auth.types';
import { GraphQLError } from 'graphql';
import { Container } from 'typedi';
import { AuthorizationService } from '../auth/authorization.service';

export function createServiceAccessMiddleware() {
  return async (context: ExtendedYogaContext, info: any) => {
    // Skip if not API key authentication
    if (context.authType !== 'api-key' || !context.application) {
      return;
    }

    const authorizationService = Container.get(AuthorizationService);

    // Extract service information from the GraphQL operation
    const serviceUrl = extractServiceFromOperation(info);
    if (!serviceUrl) {
      return;
    }

    // Check if the application can access this service
    const canAccess = await authorizationService.canApplicationAccessServiceByUrl(context.application.id, serviceUrl);

    if (!canAccess) {
      throw new GraphQLError(`Application "${context.application.name}" does not have access to service: ${serviceUrl}`, {
        extensions: { code: 'SERVICE_ACCESS_DENIED' }
      });
    }
  };
}

function extractServiceFromOperation(info: any): string | null {
  // Implementation depends on how services are identified in your schema
  // You might need to look at the field name, directives, or other metadata
  // For now, return null to skip the check
  return null;
}
