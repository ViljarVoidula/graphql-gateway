import fs from 'fs';
import path from 'path';

interface obj {
  [key: string]: any;
}

type ResolverFunction = (_root: any, data: obj) => void;

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

  addFieldToType(type: string, property: string, fn: ResolverFunction) {
    this.resolvers[type] = this.resolvers?.type ?? {};
    this.resolvers[type][property] = { [property]: fn };
    return this;
  }

  addMutation(property: string, fn: ResolverFunction) {
    this.resolvers['Mutation'][property] = { [property]: fn };
    return this;
  }

  addQuery(property: string, fn: ResolverFunction) {
    this.resolvers['Query'][property] = { [property]: fn };
    return this;
  }
}
