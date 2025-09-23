import { Field, ID, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('assets')
export class Asset {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, unique: true })
  key!: string; // e.g., public.docs.heroImage, public.docs.favicon

  @Field()
  @Column({ type: 'varchar', length: 128 })
  contentType!: string; // image/png, image/jpeg, image/x-icon

  // Binary data stored in Postgres
  @Column({ type: 'bytea' })
  data!: Buffer;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
