import { Router } from 'express';

import { authStatusFromRequest } from '../auth.js';

const router = Router();

router.get('/status', (req, res) => {
  res.json(authStatusFromRequest(req));
});

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
