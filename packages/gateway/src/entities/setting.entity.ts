import { GraphQLJSON } from 'graphql-scalars';
import { Field, ID, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Generic key/value settings store so we can manage runtime configuration via UI instead of env vars.
 * Supports basic scalar (string/number/boolean) values plus JSON.
 */
@ObjectType()
@Entity('settings')
export class Setting {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, unique: true })
  key: string;

  // Store value in multiple typed columns for efficient querying while keeping flexibility.
  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  stringValue?: string | null;

  @Field({ nullable: true })
  @Column({ type: 'bigint', nullable: true })
  numberValue?: string | null; // use string to avoid precision issues with bigints in JS

  @Field({ nullable: true })
  @Column({ type: 'boolean', nullable: true })
  boolValue?: boolean | null;

  @Field(() => GraphQLJSON, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  jsonValue?: any | null;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  valueType?: string | null; // string|number|boolean|json

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}

export type SettingValue = string | number | boolean | Record<string, any>;

export function coerceSettingValue(db: Setting): SettingValue | null {
  switch (db.valueType) {
    case 'string':
      return db.stringValue ?? null;
    case 'number':
      return db.numberValue !== null && db.numberValue !== undefined ? Number(db.numberValue) : null;
    case 'boolean':
      return typeof db.boolValue === 'boolean' ? db.boolValue : null;
    case 'json':
      return db.jsonValue ?? null;
    default:
      return null;
  }
}
