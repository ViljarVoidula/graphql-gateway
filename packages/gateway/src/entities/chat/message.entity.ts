import { Field, ID, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatThread } from './thread.entity';

@ObjectType()
class Citation {
  @Field()
  sourceId!: string;
  @Field({ nullable: true })
  snippet?: string;
  @Field({ nullable: true })
  score?: number;
}

@ObjectType()
@Entity('chat_messages')
export class ChatMessage {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Explicitly name the FK column to match migration (thread_id)
  @ManyToOne(() => ChatThread, (t) => t.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thread_id' })
  thread!: ChatThread;

  @Field()
  @Column({ type: 'varchar', length: 8 })
  role!: string; // user|assistant|system

  @Field()
  @Column({ type: 'text' })
  content!: string;

  @Field(() => [Citation], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  citations?: Citation[];

  @Field()
  @CreateDateColumn()
  createdAt!: Date;
}
