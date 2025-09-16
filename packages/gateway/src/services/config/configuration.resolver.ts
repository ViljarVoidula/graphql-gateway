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
}

export enum PublicDocumentationMode {
  DISABLED = 'disabled',
  PREVIEW = 'preview',
  ENABLED = 'enabled'
}

registerEnumType(PublicDocumentationMode, { name: 'PublicDocumentationMode' });

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
      publicDocumentationMode: (await this.config.getPublicDocumentationMode()) as PublicDocumentationMode
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
}
