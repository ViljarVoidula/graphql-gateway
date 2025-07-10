import { Plugin } from '@envelop/types';
import { IAuthZConfig, wrapExecuteFn } from '@graphql-authz/core';
import { isGatewayAdmin } from './isGatewayAdmin'

export const authZRules = {
    isGatewayAdmin
} as const;

export function authZEnvelopPlugin(config: IAuthZConfig): Plugin {
  return {
    onExecute({ executeFn, setExecuteFn }: any) {
      setExecuteFn(wrapExecuteFn(executeFn, config));
    }
  };
}

export const authZInitializedPlugin = authZEnvelopPlugin({
  rules: authZRules
});

export const authZTypeDef = `#graphql
  enum AuthZRules {
    hasPublicDataProtectionEnabled
  }

  # this is a common boilerplate
  input AuthZDirectiveCompositeRulesInput {
    and: [AuthZRules]
    or: [AuthZRules]
    not: AuthZRules
  }

  # this is a common boilerplate
  input AuthZDirectiveDeepCompositeRulesInput {
    id: AuthZRules
    and: [AuthZDirectiveDeepCompositeRulesInput]
    or: [AuthZDirectiveDeepCompositeRulesInput]
    not: AuthZDirectiveDeepCompositeRulesInput
  }

  # this is a common boilerplate
  directive @authz(
    rules: [AuthZRules]
    compositeRules: [AuthZDirectiveCompositeRulesInput]
    deepCompositeRules: [AuthZDirectiveDeepCompositeRulesInput]
  ) on FIELD_DEFINITION | OBJECT | INTERFACE

`;
