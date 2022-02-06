# Scope of this project

- Provide uniform GraphQL gateway service to upstream GraphQL services
- Gateway needs to support proxying interface Mutations and Queries for consumers
- Gateway needs to support adding new services during active runtime execution without user induced service disruption (hot-reloading)
- Visual representation of Schema for developers and UI to interact with root service

# Cases for further improvement

- Gateway type/resolver naming conflict resolution and transformation rules. Parse AST and throw error on conflict or set prefix as required ?
- More advanced configuration for directives loading
- Subscription proxy is not yet supported
- Before and after methods to service ?!
- Setup scaffolding using hygen.io templating for adding new internal extended services , types and resolvers for developers
- Gateway needs a persistent performant shared service state over instances (active-active sync - redis/amqp?)
- Support different strategies for fallback of remote schema fetch failure('cached', 'drop')
  - cached strategy will return last state of failed schema endpoint
  - drop strategy will remove endpoint from root schema (as is default in the time of documenting)

# Setup and configuration

- git clone {repo}
- yarn
- yarn dev
- yarn generate - to refresh types based on graphql schema
- yarn 

# Usecase

- register new remote Service endpoint during runtime

```
mutation{
  registerEndpoint(url: "https://rickandmortyapi.com/graphql"){
   success
  }
}
```
- validate schema was added 



{
  character(id: 3) {
    id
    name
  }
}


