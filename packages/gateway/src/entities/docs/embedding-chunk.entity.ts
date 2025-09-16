import { Field, Float, ID, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
class DocEmbeddingMeta {
  @Field({ nullable: true })
  section?: string;
  @Field({ nullable: true })
  anchorRef?: string;
  @Field({ nullable: true })
  extra?: string; // free-form serialized metadata if needed
}

@ObjectType()
@Entity('docs_embedding_chunks')
export class DocEmbeddingChunk {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ type: 'varchar', length: 160, name: 'doc_slug' })
  @Index('docs_embedding_chunks_doc_slug_idx')
  docSlug!: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  anchor?: string | null;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  contentText?: string | null;

  @Field(() => DocEmbeddingMeta, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  meta?: DocEmbeddingMeta | null;

  @Index()
  @Column({ type: 'int', default: 0 })
  position!: number;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 32, default: 'DOC' })
  source!: string; // DOC | SCHEMA | FAQ

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  contentHash?: string | null;

  @Field({ nullable: true })
  @Column({ type: 'int', nullable: true })
  tokenCount?: number | null;

  @Field(() => [Float], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  embedding?: number[]; // stored via pgvector extension eventually

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
