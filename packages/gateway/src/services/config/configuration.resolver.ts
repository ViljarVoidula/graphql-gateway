import { Arg, Directive, Field, Int, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { ConfigurationService } from './configuration.service';

@ObjectType()
class Settings {
  // We only expose the needed settings for now; can be extended later.
  @Field(() => Int)
  auditLogRetentionDays!: number;
}

@Service()
@Resolver(() => Settings)
export class ConfigurationResolver {
  constructor(private readonly config: ConfigurationService) {}

  @Query(() => Settings)
  @Directive('@authz(rules: ["isAdmin"])')
  async settings(): Promise<Settings> {
    return {
      auditLogRetentionDays: await this.config.getAuditLogRetentionDays()
    };
  }

  @Mutation(() => Int)
  @Directive('@authz(rules: ["isAdmin"])')
  async updateAuditLogRetentionDays(@Arg('days', () => Int) days: number): Promise<number> {
    return this.config.updateAuditLogRetentionDays(days);
  }
}
