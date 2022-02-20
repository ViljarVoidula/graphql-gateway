import Ajv from 'ajv';
import assert from 'assert';
import { InputValidationError } from '../utils/errors';
const ajv = new Ajv();

export default function (schema: Object) {
  return async (context: any) => {
    const [_, { data = {} }] = context?.arguments;

    assert.ok(Object.keys(data).length, 'No data in context to validate');
    const validate = ajv.compile(schema);

    if (!validate(data)) {
      throw new InputValidationError('Input validation failure', {
        errors: validate.errors,
        ...(data as {}),
      });
    }
    return context;
  };
}
