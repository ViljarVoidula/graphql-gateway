import { UserDetails } from '../../../types/types';
import { Service } from '../base.class';
import ResolverFactory from '../../../utils/resolverFactory';
import validate from '../../../hooks/validate';

let storedUsers: Array<UserDetails> = [];
const userService = new Service(__dirname + '/schema.graphql');

const addUserSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    profession: {
      type: 'string',
      enum: ['Wizard', 'Carpenter', 'Taxi driver'],
    },
  },
};

/*
  User service setup
*/

userService
  .addFieldToType(
    'UserData',
    'pokemonStatus',
    ResolverFactory(async function () {
      return 'dead';
    })
  )
  .addQuery(
    'findUserData',
    ResolverFactory(async function () {
      return storedUsers;
    })
  )
  .addQuery(
    'getUserData',
    ResolverFactory(async function (_: any, { id }: any, _ctx: any) {
      if (Number(id)) {
        const [response] = storedUsers.filter((el) => el.id === id);
        return response;
      } else {
        throw new Error(`Could not find user ${id}`);
      }
    })
  )
  .addMutation(
    'addUserData',
    ResolverFactory(
      async function (_root: any, { data }: any) {
        const id = storedUsers.length + 1;
        const user = {
          id: id.toString(),
          name: data?.name ?? 'John',
          profession: data?.profession ?? 'Wizard',
        };
        storedUsers.push(user);

        return user;
      },
      // example of optional side-effect handler with hooks
      {
        before: [validate(addUserSchema)],
        after: [
          (ctx: any) => {
            console.info(
              'running after the resolver side-effects, call callback uris with success etc'
            );
          },
        ],
        error: [
          (ctx: any) => {
            console.error('handle errors, rollback or do a magic trick');
          },
        ],
      }
    )
  )
  .addMutation(
    'patchUserData',
    ResolverFactory(async function (id: string, data: UserDetails) {
      storedUsers[Number(id)] = {
        id,
        ...(data.name ? { name: data.name } : {}),
        ...(data.profession ? { name: data.profession } : {}),
      };
      return storedUsers[Number(id)];
    })
  )

  .addMutation(
    'removeUserData',
    ResolverFactory(async function (id: string) {
      let response = { ...storedUsers[Number(id)] };
      storedUsers.splice(Number(id), 1);

      return response;
    })
  );

export default userService;
