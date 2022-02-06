import axios from 'axios';
import { print, DocumentNode } from 'graphql';

import ws from 'ws';
import { createClient, Client } from 'graphql-ws';
import assert from 'assert';

interface ExecutorContext {
  url: string;
  timeout?: number;
  context?: {};
}

class RemoteExecutor {
  url: string;
  timeout: number;
  variables?: [];
  client: Client | undefined;

  constructor({ url, timeout }: ExecutorContext) {
    this.url = url;
    this.timeout = timeout || 10 * 1000;

    // If subscriptions should be part of spec then implement ws client

    // this.client = subscriptions
    //   ? createClient({ url: url.replace(/^https?/, 'ws'), webSocketImpl: ws })
    //   : undefined;
  }

  executor = async ({
    document,
    variables = [],
  }: {
    document: DocumentNode | string;
    variables?: [];
  }) => {
    const { url } = this;
    const query = typeof document === 'string' ? document : print(document);
    try {
      const { data } = await axios({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ query, variables }),
      });

      return data;
    } catch (error) {
      console.error(error);
    }
  };

  // see https://github.com/enisdenjo/graphql-ws#async-iterator
  subscriber = async ({
    document,
    variables = [],
  }: {
    document: DocumentNode | string;
    variables?: any;
  }) => {
    const query = typeof document === 'string' ? document : print(document);
    const pending: any = [];
    let deferred: {
      resolve: (done: boolean) => void;
      reject: (err: unknown) => void;
    } | null = null;

    let error: unknown = null,
      done = false;

    // gateway to check that this client is defined
    assert.ok(this.client, 'WS client is not set for this executor');
    const dispose = this.client.subscribe(
      {
        query,
        variables,
      },
      {
        next: (data) => {
          pending.push(data);
          deferred && deferred.resolve(false);
        },
        error: (err) => {
          error = err;
          deferred && deferred.reject(error);
        },
        complete: () => {
          done = true;
          deferred && deferred.resolve(true);
        },
      }
    );

    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        if (done) return { done: true };
        if (error) throw error;
        if (pending.length) return { value: pending.shift() };

        return (await new Promise<boolean>(
          (resolve, reject) => (deferred = { resolve, reject })
        ))
          ? { done: true }
          : { value: pending.shift() };
      },

      async return() {
        dispose();
        return { done: true };
      },
    };
  };
}

export default RemoteExecutor;
