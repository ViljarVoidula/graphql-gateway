import { Field, InputType } from 'type-graphql';
import { IsString } from 'class-validator';

@InputType()
export class RefreshTokenInput {
  @Field()
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken!: string;
}
