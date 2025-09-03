import { Field, InputType } from 'type-graphql';
import { IsEmail, MinLength, IsString } from 'class-validator';

@InputType()
export class UserInput {
  @Field()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @Field()
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}
