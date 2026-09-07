import { Router } from 'express';

import { modelCatalog } from '../providers/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ models: modelCatalog });
});

export default router;
