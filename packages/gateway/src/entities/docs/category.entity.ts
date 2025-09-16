import { Field, ID, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DocDocument } from './document.entity';

@ObjectType()
@Entity('docs_categories')
export class DocCategory {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ type: 'varchar', length: 120, unique: true })
  slug!: string;

  @Field()
  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Field({ nullable: true })
  @Column({ type: 'int', default: 0 })
  orderIndex!: number;

  @OneToMany(() => DocDocument, (d) => d.category)
  documents!: DocDocument[];

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
