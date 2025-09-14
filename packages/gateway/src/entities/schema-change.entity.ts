import { Field, ID, ObjectType, registerEnumType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Service } from './service.entity';

export enum SchemaChangeClassification {
  BREAKING = 'breaking',
  NON_BREAKING = 'non_breaking',
  UNKNOWN = 'unknown'
}

registerEnumType(SchemaChangeClassification, { name: 'SchemaChangeClassification' });

@ObjectType()
@Entity('schema_changes')
export class SchemaChange {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index()
  @Column()
  serviceId: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  previousHash?: string | null;

  @Field()
  @Column({ type: 'varchar', length: 64 })
  newHash: string;

  // Unified diff text (or JSON string) for readability
  @Field()
  @Column({ type: 'text' })
  diff: string;

  // Optionally store the full SDL snapshot for this version
  @Field()
  @Column({ type: 'text' })
  schemaSDL: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => SchemaChangeClassification)
  @Column({
    type: 'enum',
    enum: SchemaChangeClassification,
    default: SchemaChangeClassification.UNKNOWN
  })
  classification: SchemaChangeClassification;
}
