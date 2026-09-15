import { Router } from 'express';

import { authStatusFromRequest } from '../auth.js';
import { asyncHandler } from '../asyncHandler.js';
import { storage } from '../storage.js';

const router = Router();

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const settings = await storage.getSettings();
    res.json({
      ...authStatusFromRequest(req),
      name: settings.bunnyName || 'Bunny',
    });
  }),
);

router.post('/verify', (req, res) => {
  const password = process.env.APP_PASSWORD?.trim();
  const provided = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || provided === password) {
    return res.json({ ok: true });
  }
  return res.status(401).json({
    error: {
      code: 'wrong_password',
      message: '密码不对',
    },
  });
});

export default router;
