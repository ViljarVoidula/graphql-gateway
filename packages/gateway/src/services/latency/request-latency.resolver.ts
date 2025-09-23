import { Arg, Args, ArgsType, Field, Float, ID, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Service as TypeDIService } from 'typedi';
import { RequestLatency } from '../../entities/request-latency.entity';
import { RequestLatencyService } from './request-latency.service';

@ObjectType()
class LatencyMetrics {
  @Field(() => Float)
  averageLatency: number;

  @Field(() => Float)
  p50Latency: number;

  @Field(() => Float)
  p90Latency: number;

  @Field(() => Float)
  p95Latency: number;

  @Field(() => Float)
  p99Latency: number;

  @Field(() => Float)
  maxLatency: number;

  @Field(() => Float)
  minLatency: number;

  @Field(() => Int)
  totalRequests: number;

  @Field(() => Float)
  errorRate: number;
}

@ObjectType()
class ServiceLatencyStats {
  @Field(() => ID)
  serviceId: string;

  @Field()
  serviceName: string;

  @Field(() => Float)
  averageLatency: number;

  @Field(() => Float)
  p95Latency: number;

  @Field(() => Int)
  totalRequests: number;

  @Field(() => Float)
  errorRate: number;
}

@ObjectType()
class ApplicationLatencyStats {
  @Field(() => ID)
  applicationId: string;

  @Field()
  applicationName: string;

  @Field(() => Int)
  totalRequests: number;

  @Field(() => Float)
  averageLatency: number;

  @Field(() => Float)
  p95Latency: number;

  @Field(() => Float)
  errorRate: number;
}

@ObjectType()
class OperationLatencyStats {
  @Field()
  operationName: string;

  @Field()
  operationType: string;

  @Field(() => ID)
  serviceId: string;

  @Field()
  serviceName: string;

  @Field(() => Float)
  averageLatency: number;

  @Field(() => Float)
  p95Latency: number;

  @Field(() => Int)
  totalRequests: number;

  @Field(() => Float)
  errorRate: number;
}

@ObjectType()
class LatencyTrend {
  @Field()
  date: string;

  @Field(() => Int)
  hour: number;

  @Field(() => Float)
  averageLatency: number;

  @Field(() => Float)
  p95Latency: number;

  @Field(() => Int)
  totalRequests: number;

  @Field(() => Float)
  errorRate: number;
}

@InputType()
class LatencyFiltersInput {
  @Field(() => [ID], { nullable: true })
  serviceIds?: string[];

  @Field(() => [ID], { nullable: true })
  applicationIds?: string[];

  @Field(() => [ID], { nullable: true })
  userIds?: string[];

  @Field({ nullable: true, description: 'Start date in YYYY-MM-DD format' })
  startDate?: string;

  @Field({ nullable: true, description: 'End date in YYYY-MM-DD format' })
  endDate?: string;

  @Field(() => [String], { nullable: true })
  operationNames?: string[];

  @Field(() => [String], { nullable: true })
  operationTypes?: string[];

  @Field({ nullable: true })
  hasErrors?: boolean;

  @Field(() => Float, { nullable: true })
  minLatency?: number;

  @Field(() => Float, { nullable: true })
  maxLatency?: number;

  @Field(() => [String], { nullable: true })
  authTypes?: string[];

  @Field(() => [String], { nullable: true, description: 'Filter by latency type: gateway_operation or downstream_service' })
  latencyTypes?: string[];
}

@ArgsType()
class PaginationArgs {
  @Field(() => Int, { defaultValue: 10 })
  limit: number = 10;

  @Field(() => Int, { defaultValue: 0 })
  offset: number = 0;
}

@TypeDIService()
@Resolver(() => RequestLatency)
export class RequestLatencyResolver {
  constructor(private readonly latencyService: RequestLatencyService) {}

  @Query(() => LatencyMetrics, { description: 'Get aggregated latency metrics with optional filters' })
  async latencyMetrics(
    @Arg('filters', () => LatencyFiltersInput, { nullable: true }) filters?: LatencyFiltersInput
  ): Promise<LatencyMetrics> {
    const metrics = await this.latencyService.getLatencyMetrics(filters || {});
    return (
      metrics[0] || {
        averageLatency: 0,
        p50Latency: 0,
        p90Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        maxLatency: 0,
        minLatency: 0,
        totalRequests: 0,
        errorRate: 0
      }
    );
  }

  @Query(() => [ServiceLatencyStats], { description: 'Get slowest services ranked by average latency' })
  async slowestServices(
    @Args() { limit }: PaginationArgs,
    @Arg('filters', () => LatencyFiltersInput, { nullable: true }) filters?: LatencyFiltersInput
  ): Promise<ServiceLatencyStats[]> {
    return this.latencyService.getSlowestServices(limit, filters || {});
  }

  @Query(() => [ApplicationLatencyStats], {
    description: 'Get most active applications by request volume and their performance'
  })
  async mostActiveApplications(
    @Args() { limit }: PaginationArgs,
    @Arg('filters', () => LatencyFiltersInput, { nullable: true }) filters?: LatencyFiltersInput
  ): Promise<ApplicationLatencyStats[]> {
    return this.latencyService.getMostActiveApplications(limit, filters || {});
  }

  @Query(() => [OperationLatencyStats], { description: 'Get slowest operations across all services' })
  async slowestOperations(
    @Args() { limit }: PaginationArgs,
    @Arg('filters', () => LatencyFiltersInput, { nullable: true }) filters?: LatencyFiltersInput
  ): Promise<OperationLatencyStats[]> {
    return this.latencyService.getSlowestOperations(limit, filters || {});
  }

  @Query(() => [LatencyTrend], { description: 'Get latency trends over time (hourly aggregation)' })
  async latencyTrends(
    @Arg('filters', () => LatencyFiltersInput, { nullable: true }) filters?: LatencyFiltersInput
  ): Promise<LatencyTrend[]> {
    return this.latencyService.getLatencyTrends(filters || {});
  }

  @Query(() => [RequestLatency], { description: 'Get detailed request latency records' })
  async requestLatencies(
    @Args() { limit, offset }: PaginationArgs,
    @Arg('filters', () => LatencyFiltersInput, { nullable: true }) filters?: LatencyFiltersInput
  ): Promise<RequestLatency[]> {
    return this.latencyService.getRequestLatencies(limit, offset, filters || {});
  }
}
