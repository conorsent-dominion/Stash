import { Router } from 'express';
import type { BookmarkRepository } from '../bookmarks/repository.js';

export function tagsRouter(repo: BookmarkRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const user = req.user!;
    const tags = await repo.tags(user.id);
    res.json({ tags });
  });

  return router;
}
