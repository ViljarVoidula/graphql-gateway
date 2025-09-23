import { GraphQLJSON } from 'graphql-scalars';
import { Arg, Directive, Field, Int, Mutation, ObjectType, Query, Resolver, registerEnumType } from 'type-graphql';
import { Service } from 'typedi';
import { ConfigurationService } from './configuration.service';

@ObjectType()
class Settings {
  // We only expose the needed settings for now; can be extended later.
  @Field(() => Int)
  auditLogRetentionDays!: number;

  @Field({ deprecationReason: 'Use publicDocumentationMode instead' })
  publicDocumentationEnabled!: boolean; // legacy boolean

  @Field(() => PublicDocumentationMode)
  publicDocumentationMode!: PublicDocumentationMode;

  @Field()
  enforceDownstreamAuth!: boolean;

  @Field()
  graphqlVoyagerEnabled!: boolean;

  @Field()
  graphqlPlaygroundEnabled!: boolean;

  @Field()
  latencyTrackingEnabled!: boolean;

  @Field()
  responseCacheEnabled!: boolean;

  @Field(() => Int)
  responseCacheTtlMs!: number;

  @Field()
  responseCacheIncludeExtensions!: boolean;

  @Field()
  responseCacheScope!: string; // 'global' | 'per-session'

  @Field(() => GraphQLJSON)
  responseCacheTtlPerType!: Record<string, number>;

  @Field(() => GraphQLJSON)
  responseCacheTtlPerSchemaCoordinate!: Record<string, number>;
}

export enum PublicDocumentationMode {
  DISABLED = 'disabled',
  PREVIEW = 'preview',
  ENABLED = 'enabled'
}

registerEnumType(PublicDocumentationMode, { name: 'PublicDocumentationMode' });

@ObjectType()
export class DocsBranding {
  @Field()
  brandName!: string;
  @Field()
  heroTitle!: string;
  @Field()
  heroSubtitle!: string;
}

@Service()
@Resolver(() => Settings)
export class ConfigurationResolver {
  constructor(private readonly config: ConfigurationService) {}

  @Query(() => Settings)
  @Directive('@authz(rules: ["isAdmin"])')
  async settings(): Promise<Settings> {
    return {
      auditLogRetentionDays: await this.config.getAuditLogRetentionDays(),
      publicDocumentationEnabled: await this.config.isPublicDocumentationEnabled(),
      publicDocumentationMode: (await this.config.getPublicDocumentationMode()) as PublicDocumentationMode,
      enforceDownstreamAuth: await this.config.isDownstreamAuthEnforced(),
      graphqlVoyagerEnabled: await this.config.isGraphQLVoyagerEnabled(),
      graphqlPlaygroundEnabled: await this.config.isGraphQLPlaygroundEnabled(),
      latencyTrackingEnabled: await this.config.isLatencyTrackingEnabled(),
      responseCacheEnabled: await this.config.isResponseCacheEnabled(),
      responseCacheTtlMs: await this.config.getResponseCacheTtlMs(),
      responseCacheIncludeExtensions: await this.config.isResponseCacheIncludeExtensions(),
      responseCacheScope: await this.config.getResponseCacheScope(),
      responseCacheTtlPerType: await this.config.getResponseCacheTtlPerType(),
      responseCacheTtlPerSchemaCoordinate: await this.config.getResponseCacheTtlPerSchemaCoordinate()
    };
  }

  @Mutation(() => Int)
  @Directive('@authz(rules: ["isAdmin"])')
  async updateAuditLogRetentionDays(@Arg('days', () => Int) days: number): Promise<number> {
    return this.config.updateAuditLogRetentionDays(days);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setPublicDocumentationEnabled(@Arg('enabled') enabled: boolean): Promise<boolean> {
    return this.config.setPublicDocumentationEnabled(enabled);
  }

  @Mutation(() => PublicDocumentationMode)
  @Directive('@authz(rules: ["isAdmin"])')
  async setPublicDocumentationMode(
    @Arg('mode', () => PublicDocumentationMode) mode: PublicDocumentationMode
  ): Promise<PublicDocumentationMode> {
    // Convert enum (uppercase) to lowercase internal representation
    const internal = (mode as string).toLowerCase() as 'disabled' | 'preview' | 'enabled';
    const stored = await this.config.setPublicDocumentationMode(internal);
    return stored as PublicDocumentationMode;
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setEnforceDownstreamAuth(@Arg('enabled') enabled: boolean): Promise<boolean> {
    return this.config.setDownstreamAuthEnforced(enabled);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setGraphQLVoyagerEnabled(@Arg('enabled') enabled: boolean): Promise<boolean> {
    return this.config.setGraphQLVoyagerEnabled(enabled);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setGraphQLPlaygroundEnabled(@Arg('enabled') enabled: boolean): Promise<boolean> {
    return this.config.setGraphQLPlaygroundEnabled(enabled);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setLatencyTrackingEnabled(@Arg('enabled') enabled: boolean): Promise<boolean> {
    return this.config.setLatencyTrackingEnabled(enabled);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setResponseCacheEnabled(@Arg('enabled') enabled: boolean): Promise<boolean> {
    return this.config.setResponseCacheEnabled(enabled);
  }

  @Mutation(() => Int)
  @Directive('@authz(rules: ["isAdmin"])')
  async setResponseCacheTtlMs(@Arg('ttlMs', () => Int) ttlMs: number): Promise<number> {
    return this.config.setResponseCacheTtlMs(ttlMs);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setResponseCacheIncludeExtensions(@Arg('enabled') enabled: boolean): Promise<boolean> {
    return this.config.setResponseCacheIncludeExtensions(enabled);
  }

  @Mutation(() => String)
  @Directive('@authz(rules: ["isAdmin"])')
  async setResponseCacheScope(@Arg('scope') scope: string): Promise<string> {
    const normalized = scope === 'global' ? 'global' : 'per-session';
    await this.config.setResponseCacheScope(normalized as any);
    return normalized;
  }

  @Mutation(() => GraphQLJSON)
  @Directive('@authz(rules: ["isAdmin"])')
  async setResponseCacheTtlPerType(@Arg('map', () => GraphQLJSON) map: Record<string, any>): Promise<Record<string, number>> {
    return this.config.setResponseCacheTtlPerType(map);
  }

  @Mutation(() => GraphQLJSON)
  @Directive('@authz(rules: ["isAdmin"])')
  async setResponseCacheTtlPerSchemaCoordinate(
    @Arg('map', () => GraphQLJSON) map: Record<string, any>
  ): Promise<Record<string, number>> {
    return this.config.setResponseCacheTtlPerSchemaCoordinate(map);
  }

  // Placeholder mutation to be implemented by gateway to clear cache
  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async clearResponseCache(): Promise<boolean> {
    try {
      const fn = (require('typedi').Container as import('typedi').ContainerInstance).get('ResponseCacheInvalidate') as
        | undefined
        | (() => Promise<boolean>);
      if (typeof fn === 'function') {
        return (await fn()) ?? true;
      }
      return true;
    } catch {
      return false;
    }
  }

  @Query(() => DocsBranding)
  async docsBranding(): Promise<DocsBranding> {
    return this.config.getDocsBranding();
  }

  @Mutation(() => DocsBranding)
  @Directive('@authz(rules: ["isAdmin"])')
  async setDocsBranding(
    @Arg('brandName', { nullable: true }) brandName?: string,
    @Arg('heroTitle', { nullable: true }) heroTitle?: string,
    @Arg('heroSubtitle', { nullable: true }) heroSubtitle?: string
  ): Promise<DocsBranding> {
    return this.config.setDocsBranding({
      brandName: brandName ?? null,
      heroTitle: heroTitle ?? null,
      heroSubtitle: heroSubtitle ?? null
    });
  }
}
