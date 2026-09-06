import { Router } from 'express';

import { asyncHandler } from '../asyncHandler.js';
import { badRequest, notFound } from '../errors.js';
import { storage } from '../storage.js';

const router = Router();

function readName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ sessions: await storage.listSessions() });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = readName(req.body?.name) || '新对话';
    const session = await storage.createSession(name);
    res.status(201).json({ session });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const name = readName(req.body?.name);
    if (!name) throw badRequest('invalid_name', '会话名称不能为空');

    const session = await storage.renameSession(req.params.id, name);
    if (!session) throw notFound('会话不存在');
    res.json({ session });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!(await storage.deleteSession(req.params.id))) throw notFound('会话不存在');
    res.json({ ok: true });
  }),
);

export default router;
