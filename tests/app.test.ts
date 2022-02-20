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

    // assert.ok(response.data.__schema, 'Graphql returns schema');
  });
});
