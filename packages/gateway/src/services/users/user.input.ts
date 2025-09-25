import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Field, InputType } from 'type-graphql';

@InputType()
export class UserInput {
  @Field()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @Field()
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray({ message: 'Permissions must be an array of strings' })
  @IsString({ each: true, message: 'Each permission must be a string' })
  permissions?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean({ message: 'isEmailVerified must be a boolean value' })
  isEmailVerified?: boolean;
}
