import { Field, ID, ObjectType, Directive } from "type-graphql";
import { Column, Entity, PrimaryGeneratedColumn, BeforeInsert, BeforeUpdate, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import * as bcrypt from "bcrypt";
import { Service } from "../../entities/service.entity";

@ObjectType()
@Entity()
@Directive('@authz(rules: ["isAuthenticated"])')
export class User {
  @Field(_type => ID)
  @PrimaryGeneratedColumn("uuid")
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

  @OneToMany("Session", "user")
  sessions?: any[];

  @Field(() => [Service])
  @OneToMany(() => Service, service => service.owner)
  ownedServices: Service[];

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password) {
      const saltRounds = 12;
      this.password = await bcrypt.hash(this.password, saltRounds);
    }
  }

  async comparePassword(plainTextPassword: string): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, this.password);
  }

  get isLocked(): boolean {
    return this.lockedUntil ? this.lockedUntil > new Date() : false;
  }
}