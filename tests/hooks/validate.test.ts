import assert from 'assert';
import validate from '../../src/hooks/validate';

describe('"src/hooks/validate.ts" test', async function () {
  let schema, context;
  afterEach(async function () {
    context = undefined;
    schema = undefined;
  });

  it('hook returns a function', async function () {
    const hook = validate({});
    assert.ok(typeof hook === 'function', 'Hook is not a function.');
  });

  it('hook throws error if schema is not valid', async function () {
    await assert.rejects(validate({})({ arguments: [0, { data: {} }] }), {
      message: 'No data in context to validate',
    });
  });

  it('Hook throws input validation error if data does not match schema', async function () {
    await assert.rejects(
      validate({
        type: 'object',
        properties: {
          key: { type: 'string' },
        },
      })({ arguments: [0, { data: { key: 1 } }] }),
      {
        message: 'Input validation failure',
      }
    );
  });

  it('Hook execution returns context ', async function () {
    context = { arguments: [0, { data: { key: 'test' } }] };

    const result = await validate({
      type: 'object',
      properties: {
        key: { type: 'string' },
      },
    })(context);

    assert.deepStrictEqual(
      result.arguments,
      [
        0,
        {
          data: {
            key: 'test',
          },
        },
      ],
      'input context does not match output context'
    );
  });
});
