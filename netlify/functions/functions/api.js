import serverless from 'serverless-http';

import { createApp } from '../../bunny-home-backend/src/app.js';

const app = createApp();

export const handler = serverless(app);
