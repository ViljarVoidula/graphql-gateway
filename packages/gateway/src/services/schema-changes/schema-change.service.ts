import { Container, Service } from 'typedi';
import { Repository } from 'typeorm';
import { SchemaChange, SchemaChangeClassification } from '../../entities/schema-change.entity';

@Service()
export class SchemaChangeService {
  private repo: Repository<SchemaChange>;

  constructor() {
    this.repo = Container.get('SchemaChangeRepository');
  }

  listByService(options: {
    serviceId: string;
    limit?: number;
    offset?: number;
    from?: Date;
    to?: Date;
    classifications?: SchemaChangeClassification[];
    afterCreatedAt?: Date;
    afterId?: string;
  }): Promise<SchemaChange[]> {
    const { serviceId, limit = 50, offset = 0, from, to, classifications, afterCreatedAt, afterId } = options;
    const qb = this.repo
      .createQueryBuilder('sc')
      .where('sc.serviceId = :serviceId', { serviceId })
      .orderBy('sc.createdAt', 'DESC')
      .addOrderBy('sc.id', 'DESC')
      .take(limit);

    // Cursor pagination: fetch records strictly older than the cursor (createdAt/id) when provided
    if (afterCreatedAt) {
      if (afterId) {
        qb.andWhere('(sc.createdAt < :afterCreatedAt OR (sc.createdAt = :afterCreatedAt AND sc.id < :afterId))', {
          afterCreatedAt,
          afterId
        });
      } else {
        qb.andWhere('sc.createdAt < :afterCreatedAt', { afterCreatedAt });
      }
    } else if (offset) {
      // Backward compatibility: if offset passed without cursor, apply skip
      qb.skip(offset);
    }
    if (from) qb.andWhere('sc.createdAt >= :from', { from });
    if (to) qb.andWhere('sc.createdAt <= :to', { to });
    if (classifications && classifications.length) qb.andWhere('sc.classification IN (:...cls)', { cls: classifications });
    return qb.getMany();
  }
}
