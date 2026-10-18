import { Router } from 'express';

export function meRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ user: req.user });
  });

  return router;
}
