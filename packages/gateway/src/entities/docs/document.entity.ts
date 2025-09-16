import { Field, ID, ObjectType } from 'type-graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { DocCategory } from './category.entity';
import { DocRevision } from './revision.entity';

@ObjectType()
@Entity('docs_documents')
export class DocDocument {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160, unique: true })
  slug!: string;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @ManyToOne(() => DocCategory, (c) => c.documents, { nullable: true })
  category?: DocCategory | null;

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;

  @Field({ nullable: true })
  @Column({ type: 'uuid', nullable: true })
  primaryRevisionId?: string | null;

  @OneToMany(() => DocRevision, (r) => r.document)
  revisions!: DocRevision[];

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
