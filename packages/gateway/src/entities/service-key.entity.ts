import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Field, ObjectType, ID, registerEnumType } from 'type-graphql';

export enum ServiceKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired'
}

registerEnumType(ServiceKeyStatus, { name: 'ServiceKeyStatus' });

@ObjectType()
@Entity('service_keys')
export class ServiceKey {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  @Index()
  keyId: string;

  @Column()
  secretKey: string; // Not exposed in GraphQL for security

  @Field(() => ServiceKeyStatus)
  @Column({ type: 'enum', enum: ServiceKeyStatus, default: ServiceKeyStatus.ACTIVE })
  status: ServiceKeyStatus;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field({ nullable: true })
  @Column({ nullable: true })
  expiresAt?: Date;

  @ManyToOne('Service', 'keys')
  @JoinColumn({ name: 'service_id' })
  service: any;

  @Field(() => ID)
  @Column()
  serviceId: string;
}
