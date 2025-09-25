import * as bcrypt from 'bcrypt';
import { Directive, Field, ID, ObjectType } from 'type-graphql';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Service } from '../../entities/service.entity';

@ObjectType()
@Entity()
@Directive('@authz(rules: ["isAuthenticated"])')
export class User {
  @Field((_type) => ID)
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Field()
  @Column({ unique: true })
  email!: string;

  // Don't expose password field in GraphQL schema
  @Column()
  password!: string;

  @Column('simple-array', { default: '' })
  @Field(() => [String])
  @Directive('@authz(rules: ["canAccessUserData"])')
  permissions!: string[];

  @Column({ default: false })
  @Field()
  isEmailVerified!: boolean;

  // Email verification fields (not exposed in GraphQL)
  @Column({ nullable: true })
  emailVerificationToken?: string | null;

  @Column({ nullable: true })
  emailVerificationTokenExpiry?: Date | null;

  @Column({ nullable: true })
  @Field({ nullable: true })
  @Directive('@authz(rules: ["canAccessUserData"])')
  lastLoginAt?: Date;

  @Column({ default: 0 })
  @Field()
  @Directive('@authz(rules: ["canAccessUserData"])')
  failedLoginAttempts!: number;

  @Column({ nullable: true })
  @Field({ nullable: true })
  @Directive('@authz(rules: ["canAccessUserData"])')
  lockedUntil?: Date;

  @CreateDateColumn()
  @Field()
  createdAt!: Date;

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date;

  @OneToMany('Session', 'user')
  sessions?: any[];

  @Field(() => [Service])
  @OneToMany(() => Service, (service) => service.owner)
  ownedServices!: Service[];

  private passwordChanged = false;

  @BeforeInsert()
  async hashPasswordOnInsert() {
    if (this.password) {
      const saltRounds = process.env.NODE_ENV === 'test' ? 4 : 12;
      this.password = await bcrypt.hash(this.password, saltRounds);
    }
  }

  @BeforeUpdate()
  async hashPasswordOnUpdate() {
    // Only hash if password was explicitly changed via setPassword method
    if (this.password && this.passwordChanged) {
      const saltRounds = process.env.NODE_ENV === 'test' ? 4 : 12;
      this.password = await bcrypt.hash(this.password, saltRounds);
      this.passwordChanged = false;
    }
  }

  setPassword(newPassword: string) {
    this.password = newPassword;
    this.passwordChanged = true;
  }

  async comparePassword(plainTextPassword: string): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, this.password);
  }

  get isLocked(): boolean {
    return this.lockedUntil ? this.lockedUntil > new Date() : false;
  }
}
