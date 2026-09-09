import { Router } from 'express';

import { asyncHandler } from '../asyncHandler.js';
import { badRequest } from '../errors.js';
import { storage } from '../storage.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await storage.getSettings() });
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const patch = {};
    const input = req.body?.settings || req.body || {};

    if (typeof input.systemPrompt === 'string') {
      patch.systemPrompt = input.systemPrompt.trim();
    }

    if (typeof input.themeColor === 'string' && input.themeColor.trim()) {
      patch.themeColor = input.themeColor.trim();
    }

    const numberFields = [
      'temperature',
      'maxContextRounds',
      'maxContextTokens',
      'compressThreshold',
      'compressKeepRounds',
      'maxReplyTokens',
    ];
    for (const field of numberFields) {
      if (input[field] === undefined) continue;
      const value = Number(input[field]);
      if (!Number.isFinite(value) || value < 0) {
        throw badRequest('invalid_setting', `${field} 必须是有效数字`);
      }
      patch[field] = value;
    }

    const settings = await storage.updateSettings(patch);
    res.json({ settings });
  }),
);

export default router;
