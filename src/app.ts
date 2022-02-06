import express from 'express';
import services from './services';
import { App } from './types';

const app: App = express();
/*
 * init middlewares|plugins of express
 */

// init services currently /graphql
services(app);

export default app;
