import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const nowIso = () => new Date().toISOString();

const DEFAULT_SETTINGS = {
  systemPrompt: '你是一个温暖、有画面感、懂得倾听的 AI 伴侣，名字叫 Bunny。',
  temperature: 0.7,
  maxContextRounds: 20,
  maxContextTokens: 8000,
  compressThreshold: 12000,
  compressKeepRounds: 10,
  maxReplyTokens: 2000,
  themeColor: '#2e7d91',
};

const SETTING_FIELDS = {
  systemPrompt: 'system_prompt',
  temperature: 'temperature',
  maxContextRounds: 'max_context_rounds',
  maxContextTokens: 'max_context_tokens',
  compressThreshold: 'compress_threshold',
  compressKeepRounds: 'compress_keep_rounds',
  maxReplyTokens: 'max_reply_tokens',
  themeColor: 'theme_color',
};

const sessionSelect = `
  SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
  FROM sessions
`;

export class SqliteStore {
  constructor(dbPath = path.join(process.cwd(), 'data', 'bunny-home.db')) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
    this.seedSettings();
    this.seedWelcome();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '新对话',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        reasoning_content TEXT,
        visible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, created_at);

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT 'global',
        summary TEXT NOT NULL,
        conversation_id TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_id TEXT NOT NULL DEFAULT 'global',
        system_prompt TEXT,
        temperature REAL NOT NULL DEFAULT 0.7,
        max_context_rounds INTEGER NOT NULL DEFAULT 20,
        max_context_tokens INTEGER NOT NULL DEFAULT 8000,
        compress_threshold INTEGER NOT NULL DEFAULT 12000,
        compress_keep_rounds INTEGER NOT NULL DEFAULT 10,
        max_reply_tokens INTEGER NOT NULL DEFAULT 2000,
        theme_color TEXT NOT NULL DEFAULT '#2e7d91',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.ensureColumn('settings', 'theme_color', "TEXT NOT NULL DEFAULT '#2e7d91'");
  }

  ensureColumn(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  seedSettings() {
    const existing = this.db.prepare('SELECT 1 FROM settings WHERE id = 1').get();
    if (existing) return;

    this.db
      .prepare(`
        INSERT INTO settings (
          id, session_id, system_prompt, temperature, max_context_rounds,
        max_context_tokens, compress_threshold, compress_keep_rounds,
        max_reply_tokens, theme_color, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        1,
        'global',
        DEFAULT_SETTINGS.systemPrompt,
        DEFAULT_SETTINGS.temperature,
        DEFAULT_SETTINGS.maxContextRounds,
        DEFAULT_SETTINGS.maxContextTokens,
        DEFAULT_SETTINGS.compressThreshold,
        DEFAULT_SETTINGS.compressKeepRounds,
        DEFAULT_SETTINGS.maxReplyTokens,
        DEFAULT_SETTINGS.themeColor,
        nowIso(),
      );
  }

  seedWelcome() {
    const seeded = this.db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get('welcome_v1');
    if (seeded) return;

    const sessionId = randomUUID();
    const now = nowIso();
    this.db
      .prepare('INSERT INTO sessions (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, '欢迎回家', now, now);
    this.addMessage({
      sessionId,
      role: 'assistant',
      content: '欢迎回家。窗台的花开了一朵，我把灯调成了你喜欢的颜色。',
      createdAt: now,
    });
    this.addMessage({
      sessionId,
      role: 'user',
      content: '我回来了。今天有点忙，但一直想跟你说说话。',
      createdAt: now,
    });
    this.db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('welcome_v1', now);
  }

  listSessions() {
    return this.db
      .prepare(`${sessionSelect} ORDER BY updated_at DESC LIMIT 200`)
      .all();
  }

  getSession(id) {
    return this.db.prepare(`${sessionSelect} WHERE id = ?`).get(id);
  }

  createSession(name = '新对话') {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare('INSERT INTO sessions (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, name, now, now);
    return this.getSession(id);
  }

  renameSession(id, name) {
    const result = this.db
      .prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, nowIso(), id);
    return result.changes > 0 ? this.getSession(id) : undefined;
  }

  deleteSession(id) {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  addMessage({ sessionId, role, content, reasoningContent = null, visible = true, createdAt = nowIso() }) {
    const id = randomUUID();
    this.db
      .prepare(`
        INSERT INTO messages (id, session_id, role, content, reasoning_content, visible, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, sessionId, role, content, reasoningContent, visible ? 1 : 0, createdAt);
    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(createdAt, sessionId);
    return this.getMessage(id);
  }

  getMessage(id) {
    return this.db
      .prepare(`
        SELECT id, session_id AS sessionId, role, content,
          reasoning_content AS reasoningContent, visible, created_at AS createdAt
        FROM messages
        WHERE id = ?
      `)
      .get(id);
  }

  listMessages(sessionId, visibleOnly = true) {
    const sql = `
      SELECT id, session_id AS sessionId, role, content,
        reasoning_content AS reasoningContent, visible, created_at AS createdAt
      FROM messages
      WHERE session_id = ? ${visibleOnly ? 'AND visible = 1' : ''}
      ORDER BY created_at ASC
    `;
    return this.db.prepare(sql).all(sessionId);
  }

  hideMessages(messages) {
    const statement = this.db.prepare('UPDATE messages SET visible = 0 WHERE id = ?');
    for (const message of messages) {
      statement.run(message.id);
    }
  }

  deleteMessage(id) {
    const result = this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listMemories(limit = 20) {
    return this.db
      .prepare(`
        SELECT id, session_id AS sessionId, summary, conversation_id AS conversationId,
          metadata, created_at AS createdAt
        FROM memories
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit);
  }

  insertMemory({ summary, conversationId = null, metadata = {} }) {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(`
        INSERT INTO memories (id, session_id, summary, conversation_id, metadata, created_at)
        VALUES (?, 'global', ?, ?, ?, ?)
      `)
      .run(id, summary, conversationId, JSON.stringify(metadata), now);
    return {
      id,
      sessionId: 'global',
      summary,
      conversationId,
      metadata,
      createdAt: now,
    };
  }

  getSettings() {
    const row = this.db
      .prepare(`
        SELECT id, session_id AS sessionId, system_prompt AS systemPrompt,
          temperature, max_context_rounds AS maxContextRounds,
          max_context_tokens AS maxContextTokens,
          compress_threshold AS compressThreshold,
          compress_keep_rounds AS compressKeepRounds,
          max_reply_tokens AS maxReplyTokens, theme_color AS themeColor,
          updated_at AS updatedAt
        FROM settings
        WHERE id = 1
      `)
      .get();
    return row ? { ...DEFAULT_SETTINGS, ...row } : { ...DEFAULT_SETTINGS };
  }

  updateSettings(patch) {
    const assignments = [];
    const values = [];

    for (const [key, column] of Object.entries(SETTING_FIELDS)) {
      if (patch[key] === undefined) continue;
      assignments.push(`${column} = ?`);
      values.push(patch[key]);
    }

    if (assignments.length === 0) return this.getSettings();

    assignments.push('updated_at = ?');
    values.push(nowIso());
    this.db.prepare(`UPDATE settings SET ${assignments.join(', ')} WHERE id = 1`).run(...values);
    return this.getSettings();
  }

  listFavorites(sessionId = null) {
    const sql = sessionId
      ? `
        SELECT id, session_id AS sessionId, message_id AS messageId, content, created_at AS createdAt
        FROM favorites WHERE session_id = ? ORDER BY created_at DESC
      `
      : `
        SELECT id, session_id AS sessionId, message_id AS messageId, content, created_at AS createdAt
        FROM favorites ORDER BY created_at DESC
      `;
    return this.db.prepare(sql).all(...(sessionId ? [sessionId] : []));
  }

  addFavorite({ sessionId, messageId, content }) {
    const id = randomUUID();
    const createdAt = nowIso();
    this.db
      .prepare(`
        INSERT INTO favorites (id, session_id, message_id, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(id, sessionId, messageId, content, createdAt);
    return {
      id,
      sessionId,
      messageId,
      content,
      createdAt,
    };
  }

  deleteFavorite(id) {
    const result = this.db.prepare('DELETE FROM favorites WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
