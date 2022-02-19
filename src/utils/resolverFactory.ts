import { hooks, middleware, collect } from '@feathersjs/hooks';
/**
 *
 * @param fn - resolver function where to keep business logic
 * @param _hooks - side-effects handling
 * @returns runtime
 */
export default function ResolverFactory(
  fn: any,
  _hooks?: { before?: Array<any>; after?: Array<any>; error?: Array<any> }
) {
  debugger;
  return hooks(
    fn,
    middleware([
      collect({
        ..._hooks,
      }),
    ])
  );
}
