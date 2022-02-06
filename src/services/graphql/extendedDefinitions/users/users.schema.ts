import fs from 'fs';
import { UserDetails } from '../../../../types/types';

const typeDef = fs.readFileSync(`${__dirname}/users.graphql`, {
  encoding: 'utf8',
});
let storedUsers: Array<UserDetails> = [];

export const users = {
  typeDef,
  resolvers: {
    Query: {
      findUsersDetails: async function () {
        return storedUsers;
      },
      getUserDetails: async function (_root: any, { id }: UserDetails) {
        debugger;
        if (Number(id)) {
          const [response] = storedUsers.filter((el) => el.id === id);
          return response;
        } else {
          throw new Error(`Could not find user ${id}`);
        }
      },
    },
    Mutation: {
      addUserDetails: async function (_root: any, data: UserDetails) {
        const id = storedUsers.length + 1;
        const user = {
          id: id.toString(),
          name: data?.name ?? 'John',
          profession: data?.profession ?? 'Wizard',
        };
        storedUsers.push(user);
        return user;
      },
      patchUserDetails: async function (id: string, data: UserDetails) {
        storedUsers[Number(id)] = {
          id,
          ...(data.name ? { name: data.name } : {}),
          ...(data.profession ? { name: data.profession } : {}),
        };
        return storedUsers[Number(id)];
      },
      removeUserDetails: async function (id: string) {
        let response = { ...storedUsers[Number(id)] };
        storedUsers.splice(Number(id), 1);
        return response;
      },
    },
  },
};
