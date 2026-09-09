import { Router } from 'express';

import { asyncHandler } from '../asyncHandler.js';
import { badRequest } from '../errors.js';
import { storage } from '../storage.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ entries: await storage.listMemoryEntries(200) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) throw badRequest('invalid_memory', '记忆内容不能为空');
    const entry = await storage.addMemoryEntry({
      kind: ['memory', 'preference', 'relationship'].includes(req.body?.kind)
        ? req.body.kind
        : 'memory',
      title: typeof req.body?.title === 'string' ? req.body.title : '',
      content,
      importance: Number(req.body?.importance) || 1,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      sourceSessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : null,
    });
    res.status(201).json({ entry });
  }),
);

export default router;
