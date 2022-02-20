import axios from 'axios';
import assert from 'assert';

import { getIntrospectionQuery } from 'graphql';

describe('app tests ', async function () {
  it('throws 404', async function () {
    assert.rejects(axios.get('http://localhost:4001/path/to/nowhere'), {
      message: 'Request failed with status code 404',
    });
  });

  it('graphiql is available', async function () {
    const { status } = await axios.get('http://localhost:4001/graphql', {
      headers: {
        Accept: 'text/html',
      },
    });

    assert.ok(status === 200, 'GraphiQL UI is not available');
  });

  it('can run introspection query', async function () {
    const query = await getIntrospectionQuery();

    const { data: response } = await axios.post(
      'http://localhost:4001/graphql?',
      {
        operationName: 'IntrospectionQuery',
        query,
      }
    );

    assert.ok(response.data.__schema, 'Graphql returns schema');
  });

  it('can query pokemon from external stitched api ', async function () {
    const query = `{
      getPokemon(pokemon: syclant){
        sprite
        species
    
      }
    }`;

    const { data: response } = await axios.post(
      'http://localhost:4001/graphql?',
      {
        query,
      }
    );
    assert.deepStrictEqual(
      {
        getPokemon: {
          sprite: 'https://play.pokemonshowdown.com/sprites/gen5/syclant.png',
          species: 'syclant',
        },
      },
      response.data,
      'Could not get Pokemon value from remote schema'
    );
  });

  it('can add user to gateway api ', async function () {
    const query = `mutation {
      addUserData(data: {name: "teet", profession: "Wizard"}) {
        id
        name
        profession
        pokemonStatus
      }
    }
    `;

    const { data: response } = await axios.post(
      'http://localhost:4001/graphql?',
      {
        query,
      }
    );
    assert.deepStrictEqual(
      {
        id: '1',
        name: 'teet',
        profession: 'Wizard',
        pokemonStatus: 'dead',
      },
      response.data.addUserData,
      'Could not add user via mutation'
    );
  });

  it('can fetch user from gateway api ', async function () {
    const query = `{
      getUserData(id: 1) {
        id
      }
    }    
    `;

    const { data: response } = await axios.post(
      'http://localhost:4001/graphql?',
      {
        query,
      }
    );
    assert.deepStrictEqual(
      {
        id: '1',
      },
      response.data.getUserData,
      'Could not fetch a user via query'
    );
  });

  it('can fetch all users from gateway api ', async function () {
    const query = `{
      findUserData {
        id
      }
    }`;

    const { data: response } = await axios.post(
      'http://localhost:4001/graphql?',
      {
        query,
      }
    );

    assert.deepStrictEqual(
      response.data.findUserData[0],
      {
        id: '1',
      },
      'Could not fetch users via query'
    );
  });

  it('can remove a user from gateway api ', async function () {
    const query = `mutation{
      removeUserData(id: 1){
        id
      }
    }`;

    const { data: response } = await axios.post(
      'http://localhost:4001/graphql?',
      {
        query,
      }
    );

    assert.deepStrictEqual(
      response.data.removeUserData,
      {
        id: '1',
      },
      'Could not remove user via query'
    );
  });
});
