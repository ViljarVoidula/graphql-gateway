import fs from 'fs';
import path from 'path';

interface obj {
  [key: string]: any;
}

type ResolverFunction = (_root: any, data: obj, ctx: obj) => void;

export class Service {
  typeDef: string;
  resolvers: obj;
  loaders: obj;

  constructor(typeDefsPath: string) {
    this.typeDef = fs.readFileSync(path.normalize(typeDefsPath), {
      encoding: 'utf8',
    });

    this.resolvers = {
      Mutation: {},
      Query: {},
    };
    this.loaders = {};
  }
  /**
   *
   * @param type - GraphQL Type
   * @param property - Property to add that type
   * @param fn - resolver to return that property
   * @returns
   */
  addFieldToType(type: string, property: string, fn: ResolverFunction) {
    this.resolvers[type] = this.resolvers?.type ?? {};
    this.resolvers[type][property] = fn;
    return this;
  }
  /**
   *
   * @param property - Mutation Type
   * @param fn - resolver which will return GraphQL Type
   * @returns
   */
  addMutation(property: string, fn: ResolverFunction) {
    this.resolvers['Mutation'][property] = fn;
    return this;
  }
  /**
   *
   * @param property - Add query for specific Type
   * @param fn - Resolver for that query which returns Type response
   * @returns
   */
  addQuery(property: string, fn: ResolverFunction) {
    this.resolvers['Query'][property] = fn;
    return this;
  }
}
