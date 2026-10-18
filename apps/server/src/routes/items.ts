import { Router } from 'express';
import { z } from 'zod';
import type { BookmarkRepository } from '../bookmarks/repository.js';
import { NotFoundError } from '../lib/errors.js';

const listQuerySchema = z.object({
  tag: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => (value ? value : undefined)),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : undefined)),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

const idSchema = z.string().uuid();

export function itemsRouter(repo: BookmarkRepository): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const user = req.user!;

    const page = await repo.list(user.id, {
      tag: query.tag,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      items: page.items,
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    });
  });

  router.delete('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const user = req.user!;

    const removed = await repo.remove(user.id, id);
    if (!removed) {
      throw new NotFoundError('Закладка не найдена');
    }

    res.json({ ok: true });
  });

  return router;
}
