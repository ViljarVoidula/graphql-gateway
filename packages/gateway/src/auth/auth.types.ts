import { ObjectType, Field } from 'type-graphql';
import { User } from '../services/users/user.entity';
import { Application } from '../entities/application.entity';
import { ApiKey } from '../entities/api-key.entity';

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

export interface ExtendedYogaContext {
  user?: { id: string; permissions: string[] } | null;
  application?: Application;
  apiKey?: ApiKey;
  authType?: 'session' | 'api-key' | null;
  session?: any;
  sessionId?: string | null;
}
