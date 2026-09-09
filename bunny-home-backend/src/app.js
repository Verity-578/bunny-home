import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { authMiddleware } from './auth.js';
import { config } from './config.js';
import { HttpError } from './errors.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import favoritesRouter from './routes/favorites.js';
import messagesRouter from './routes/messages.js';
import modelsRouter from './routes/models.js';
import memoryEntriesRouter from './routes/memoryEntries.js';
import sessionsRouter from './routes/sessions.js';
import settingsRouter from './routes/settings.js';

function findFrontendDist() {
  const candidates = [
    path.resolve(process.cwd(), 'bunny-home-frontend', 'dist'),
    path.resolve(process.cwd(), '..', 'bunny-home-frontend', 'dist'),
    path.resolve(process.cwd(), 'public'),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, 'index.html'))) || null;
}

export function createApp() {
  const app = express();
  const frontendDist = findFrontendDist();

  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '2mb' }));

  if (!frontendDist) {
    app.get('/', (_req, res) => {
      res.json({ service: 'bunny-home-backend', docs: '/api/health' });
    });
  }
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', authMiddleware);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/sessions', messagesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/favorites', favoritesRouter);
  app.use('/api/memories', memoryEntriesRouter);

  if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }

    console.error(err);
    return res.status(500).json({
      error: {
        code: 'internal_error',
        message: '服务暂时出了点问题',
      },
    });
  });

  return app;
}
