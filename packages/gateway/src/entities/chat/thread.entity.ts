import { Field, ID, ObjectType } from 'type-graphql';
import { CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ChatMessage } from './message.entity';

@ObjectType()
@Entity('chat_threads')
export class ChatThread {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToMany(() => ChatMessage, (m) => m.thread)
  messages!: ChatMessage[];

  @Field()
  @CreateDateColumn()
  createdAt!: Date;
}
