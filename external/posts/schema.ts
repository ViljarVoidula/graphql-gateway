import { PubSub } from 'graphql-subscriptions';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { readFileSync } from 'fs';

const typeDefs = readFileSync(`${__dirname}/schema.graphql`, {
  encoding: 'utf8',
});

const topic = 'NEW_POST';
const pubsub = new PubSub();
const posts: Array<Post> = [];

interface Post {
  id: number;
  message: string;
  userId: string;
}

export default makeExecutableSchema({
  typeDefs,
  resolvers: {
    Post: {
      user: (post: Post) => ({ id: post.userId }),
    },
    Query: {
      posts: () => posts,
    },
    Mutation: {
      createPost: (_root: any, { message }: Post) => {
        const newPost: Post = {
          id: posts.length + 1,
          userId: String(Math.round(Math.random() * 2) + 1),
          message,
        };
        posts.push(newPost);
        pubsub.publish(topic, { newPost });
        return newPost;
      },
    },
    Subscription: {
      newPost: {
        subscribe: () => pubsub.asyncIterator(topic),
      },
    },
  },
});
