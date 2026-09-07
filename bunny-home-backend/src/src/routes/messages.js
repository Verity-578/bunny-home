import { Router } from 'express';

import { asyncHandler } from '../asyncHandler.js';
import { badRequest, notFound } from '../errors.js';
import { runChat } from '../services/chat.js';
import { storage } from '../storage.js';

const router = Router();

router.get(
  '/:sessionId/messages',
  asyncHandler(async (req, res) => {
    if (!(await storage.getSession(req.params.sessionId))) throw notFound('会话不存在');
    res.json({ messages: await storage.listMessages(req.params.sessionId, true) });
  }),
);

router.post(
  '/:sessionId/messages',
  asyncHandler(async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) throw badRequest('invalid_message', '消息内容不能为空');

    const model = typeof req.body?.model === 'string' ? req.body.model : 'local';
    const assistantMessage = await runChat({
      sessionId: req.params.sessionId,
      message,
      model,
    });
    res.status(201).json({ message: assistantMessage });
  }),
);

export default router;
