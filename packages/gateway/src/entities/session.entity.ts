import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ObjectType, Field, ID, Directive } from 'type-graphql';

@Entity('sessions')
@ObjectType()
@Directive('@authz(rules: ["isAuthenticated"])')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column('uuid')
  @Field()
  @Directive('@authz(rules: ["canAccessUserData"])')
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  sessionId!: string; // Not exposed in GraphQL

  @Column({ type: 'varchar', length: 45, nullable: true })
  @Field({ nullable: true })
  @Directive('@authz(rules: ["canAccessUserData"])')
  ipAddress?: string;

  @Column({ type: 'text', nullable: true })
  @Field({ nullable: true })
  @Directive('@authz(rules: ["canAccessUserData"])')
  userAgent?: string;

  @Column({ type: 'boolean', default: true })
  @Field()
  @Directive('@authz(rules: ["canAccessUserData"])')
  isActive!: boolean;

  @CreateDateColumn()
  @Field()
  createdAt!: Date;

  @UpdateDateColumn()
  @Field()
  lastActivity!: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Field({ nullable: true })
  @Directive('@authz(rules: ["canAccessUserData"])')
  expiresAt?: Date;

  @ManyToOne("User", "sessions")
  @JoinColumn({ name: 'userId' })
  user!: any;
}
