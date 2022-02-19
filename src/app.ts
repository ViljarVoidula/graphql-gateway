import express from 'express';
import graphql from './graphql';
import { App } from './types';

const app: App = express();
/*
 * init middlewares|plugins of express
 */

// init services currently /graphql
graphql(app);

export default app;
