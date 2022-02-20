import axios from 'axios';
import assert from 'assert';

import { getIntrospectionQuery } from 'graphql';

describe('App tests ', async function () {
  it('throws 404', async function () {
    assert.rejects(axios.get('http://localhost:4001/path/to/nowhere'), {
      message: 'Request failed with status code 404',
    });
  });

  it('graphiQL is available', async function () {
    const { status } = await axios.get('http://localhost:4001/graphql', {
      headers: {
        Accept: 'text/html',
      },
    });

    assert.ok(status === 200, 'GraphiQL UI is not available');
  });

  it('Can run introspection query', async function () {
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
});
