import { Arg, Ctx, Field, ID, InputType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { YogaContext } from '../../auth/session.config';
import { SchemaChange, SchemaChangeClassification } from '../../entities/schema-change.entity';
import { Service as ServiceEntity } from '../../entities/service.entity';
import { SchemaChangeService } from './schema-change.service';

@InputType()
class SchemaChangeFilterInput {
  @Field({ nullable: true })
  from?: Date;

  @Field({ nullable: true })
  to?: Date;

  @Field(() => [SchemaChangeClassification], { nullable: true })
  classifications?: SchemaChangeClassification[];

  @Field({ nullable: true })
  offset?: number;

  @Field({ nullable: true })
  limit?: number;

  // Cursor-based pagination: fetch records created before this timestamp/id pair
  @Field({ nullable: true })
  afterCreatedAt?: Date;

  @Field({ nullable: true })
  afterId?: string; // tie-breaker to ensure stable ordering
}

@Service()
@Resolver(() => SchemaChange)
export class SchemaChangeResolver {
  constructor(private readonly service: SchemaChangeService) {}

  @Query(() => [SchemaChange])
  async schemaChanges(
    @Arg('serviceId', () => ID) serviceId: string,
    @Arg('filters', () => SchemaChangeFilterInput, { nullable: true }) filters: SchemaChangeFilterInput,
    @Ctx() ctx: YogaContext
  ): Promise<SchemaChange[]> {
    if (!ctx.user) throw new Error('Not authenticated');
    const serviceRepo = (ctx as any).dataSource?.getRepository?.(ServiceEntity) || null;
    if (!ctx.user.permissions?.includes('admin')) {
      if (!serviceRepo) throw new Error('Service repository unavailable');
      const svc = await serviceRepo.findOne({ where: { id: serviceId } });
      if (!svc) throw new Error('Service not found');
      if (svc.ownerId !== ctx.user.id) throw new Error('Not authorized');
    }
    return this.service.listByService({ serviceId, ...filters });
  }
}
