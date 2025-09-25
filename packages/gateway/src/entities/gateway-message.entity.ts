import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('gateway_messages')
export class GatewayPublishedMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ length: 200 })
  topic!: string;

  @Column({ nullable: true })
  type?: string | null;

  @Column({ nullable: true })
  tenantId?: string | null;

  @Index()
  @Column({ nullable: true })
  userId?: string | null;

  @Index()
  @Column({ nullable: true })
  appId?: string | null; // target app id if applicable

  @Index()
  @Column({ nullable: true })
  senderApplicationId?: string | null; // who published (from app_ key)

  @Index()
  @Column({ nullable: true })
  apiKeyId?: string | null; // which key was used

  @Column({ nullable: true })
  severity?: string | null; // info | warn | error

  @Column({ type: 'jsonb' })
  payload!: any;

  // Timestamp as provided on the message
  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;
}
