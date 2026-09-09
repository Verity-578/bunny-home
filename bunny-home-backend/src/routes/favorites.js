import { Router } from 'express';

import { asyncHandler } from '../asyncHandler.js';
import { badRequest, notFound } from '../errors.js';
import { storage } from '../storage.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const sessionId =
      typeof req.query.sessionId === 'string' && req.query.sessionId
        ? req.query.sessionId
        : null;
    res.json({ favorites: await storage.listFavorites(sessionId) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (!sessionId || !messageId || !content) {
      throw badRequest('invalid_favorite', '收藏信息不完整');
    }
    const favorite = await storage.addFavorite({ sessionId, messageId, content });
    res.status(201).json({ favorite });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!(await storage.deleteFavorite(req.params.id))) throw notFound('收藏不存在');
    res.json({ ok: true });
  }),
);

export default router;
