import { Field, InputType } from 'type-graphql';
import { IsEmail, IsString } from 'class-validator';

@InputType()
export class LoginInput {
  @Field()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @Field()
  @IsString({ message: 'Password must be a string' })
  password!: string;
}
