import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Field, InputType } from 'type-graphql';

@InputType()
export class UserUpdateInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray({ message: 'Permissions must be an array' })
  permissions?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean({ message: 'isEmailVerified must be a boolean' })
  isEmailVerified?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean({ message: 'resetFailedAttempts must be a boolean' })
  resetFailedAttempts?: boolean;
}
