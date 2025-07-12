import { ObjectType, Field } from 'type-graphql';
import { User } from '../services/users/user.entity';

@ObjectType()
export class AuthTokens {
  @Field()
  accessToken!: string;

  @Field()
  refreshToken!: string;

  @Field()
  expiresIn!: number;

  @Field()
  tokenType!: string;
}

@ObjectType()
export class AuthResponse {
  @Field(() => User)
  user!: User;

  @Field(() => AuthTokens)
  tokens!: AuthTokens;

  @Field()
  sessionId!: string;
}

@ObjectType()
export class RefreshTokenResponse {
  @Field(() => AuthTokens)
  tokens!: AuthTokens;

  @Field()
  user!: User;
}
