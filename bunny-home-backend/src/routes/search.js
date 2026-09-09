import { Router } from 'express';

import { asyncHandler } from '../asyncHandler.js';
import { badRequest } from '../errors.js';
import { storage } from '../storage.js';

const router = Router();

function normalizeDate(value, end = false) {
  if (!value) return null;
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value.slice(0, 10);
  return base;
}

function matchesDate(value, from, to) {
  if (!value) return !from && !to;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const localDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  if (from && localDate < from) return false;
  if (to && localDate > to) return false;
  return true;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';
    const from = normalizeDate(typeof req.query.from === 'string' ? req.query.from : '');
    const to = normalizeDate(typeof req.query.to === 'string' ? req.query.to : '', true);
    if (!query) throw badRequest('search_required', '请输入搜索关键词');

    const messages = [];
    const memories = [];
    const favorites = [];
    const sessions = await storage.listSessions();

    if (scope === 'all' || scope === 'messages') {
      for (const session of sessions) {
        const history = await storage.listMessages(session.id, true);
        for (const message of history) {
          if (!message.content.toLowerCase().includes(query)) continue;
          if (!matchesDate(message.createdAt, from, to)) continue;
          messages.push({
            id: message.id,
            type: 'message',
            sessionId: session.id,
            sessionName: session.name,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          });
        }
      }
    }

    if (scope === 'all' || scope === 'memories') {
      const entries = await storage.listMemoryEntries(2000);
      for (const entry of entries) {
        const haystack = `${entry.title || ''} ${entry.content} ${(entry.tags || []).join(' ')}`.toLowerCase();
        if (!haystack.includes(query)) continue;
        if (!matchesDate(entry.createdAt, from, to)) continue;
        memories.push(entry);
      }
    }

    if (scope === 'all' || scope === 'favorites') {
      const allFavorites = await storage.listFavorites();
      for (const favorite of allFavorites) {
        if (!favorite.content.toLowerCase().includes(query)) continue;
        if (!matchesDate(favorite.createdAt, from, to)) continue;
        favorites.push(favorite);
      }
    }

    res.json({
      messages: messages.slice(0, 100),
      memories: memories.slice(0, 100),
      favorites: favorites.slice(0, 100),
    });
  }),
);

export default router;
