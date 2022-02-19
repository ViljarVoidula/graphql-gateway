import { UserDetails } from '../../../types/types';
import { Service } from '../../base.service';

let storedUsers: Array<UserDetails> = [];

const userService = new Service(__dirname + '/users.graphql');

/*
  User service setup
*/

userService
  .addFieldToType('UserData', 'pokemonStatus', async function () {
    return 'dead';
  })
  .addQuery('findUserData', async function () {
    return storedUsers;
  })
  .addQuery('getUserData', async function (id: string) {
    if (Number(id)) {
      const [response] = storedUsers.filter((el) => el.id === id);
      return response;
    } else {
      throw new Error(`Could not find user ${id}`);
    }
  })
  .addMutation('addUserData', async function (_root: any, data: UserDetails) {
    const id = storedUsers.length + 1;
    const user = {
      id: id.toString(),
      name: data?.name ?? 'John',
      profession: data?.profession ?? 'Wizard',
    };
    storedUsers.push(user);

    return user;
  })
  .addMutation('patchUserData', async function (id: string, data: UserDetails) {
    storedUsers[Number(id)] = {
      id,
      ...(data.name ? { name: data.name } : {}),
      ...(data.profession ? { name: data.profession } : {}),
    };
    return storedUsers[Number(id)];
  })
  .addMutation('removeUserData', async function (id: string) {
    let response = { ...storedUsers[Number(id)] };
    storedUsers.splice(Number(id), 1);

    return response;
  });

export default userService;
