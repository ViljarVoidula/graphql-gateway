import { Field, ID, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DocDocument } from './document.entity';

@ObjectType()
class DocFrontmatter {
  @Field()
  title!: string;
  @Field({ nullable: true })
  description?: string;
  @Field({ nullable: true })
  category?: string;
  @Field(() => [String], { nullable: true })
  keywords?: string[];
  @Field({ nullable: true })
  order?: number;
  @Field({ nullable: true })
  toc?: boolean;
}

@ObjectType()
class DocHeading {
  @Field()
  value!: string;
  @Field()
  slug!: string;
  @Field()
  depth!: number;
}

@ObjectType()
@Entity('docs_document_revisions')
export class DocRevision {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => DocDocument, (d) => d.revisions, { onDelete: 'CASCADE' })
  document!: DocDocument;

  @Field()
  @Column({ type: 'int' })
  version!: number;

  @Field()
  @Column({ type: 'varchar', length: 32 })
  state!: string; // DRAFT, IN_REVIEW, APPROVED, PUBLISHED, ARCHIVED

  @Field()
  @Column({ type: 'text' })
  mdxRaw!: string;

  @Field(() => DocFrontmatter, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  frontmatterJson?: DocFrontmatter;

  @Field(() => [DocHeading], { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  headings?: DocHeading[];

  @Field()
  @Column({ type: 'varchar', length: 64 })
  createdBy!: string; // user id reference

  @Field({ nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt?: Date | null;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
