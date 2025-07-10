import { preExecRule } from '@graphql-authz/core';


export async function gatewayAdminCheck(context) {
  try {
    const { app } = context;
    const { headers = {} } = context.req;
    const { authorization = '' } = headers;

    if (!authorization) {
      return false;
    }
    const token = authorization.replace('Bearer ', '');
  } catch (error) {
    console.error('Authentication error:', error);
    return false;
  }

  return false;
}

export const isGatewayAdmin = preExecRule({
  error: 'You must be authenticated to access this resource.'
})(gatewayAdminCheck);
