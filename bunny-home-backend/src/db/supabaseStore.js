import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { HttpError } from '../errors.js';

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

const SETTING_COLUMNS = {
  systemPrompt: 'system_prompt',
  temperature: 'temperature',
  maxContextRounds: 'max_context_rounds',
  maxContextTokens: 'max_context_tokens',
  compressThreshold: 'compress_threshold',
  compressKeepRounds: 'compress_keep_rounds',
  maxReplyTokens: 'max_reply_tokens',
  themeColor: 'theme_color',
};

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    reasoningContent: row.reasoning_content,
    visible: row.visible,
    createdAt: row.created_at,
  };
}

function mapMemory(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    summary: row.summary,
    conversationId: row.conversation_id,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function mapSettings(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    systemPrompt: row.system_prompt,
    temperature: Number(row.temperature),
    maxContextRounds: Number(row.max_context_rounds),
    maxContextTokens: Number(row.max_context_tokens),
    compressThreshold: Number(row.compress_threshold),
    compressKeepRounds: Number(row.compress_keep_rounds),
    maxReplyTokens: Number(row.max_reply_tokens),
    themeColor: row.theme_color || '#2e7d91',
    updatedAt: row.updated_at,
  };
}

function databaseError(error) {
  const message = error?.message || String(error);
  if (error?.code === '42P01' || /relation .* does not exist/i.test(message)) {
    return new HttpError(
      500,
      'database_setup_required',
      'Supabase 表结构尚未创建，请先执行 supabase/schema.sql。',
    );
  }
  return new HttpError(500, 'database_error', `数据库操作失败：${message.slice(0, 300)}`);
}

export class SupabaseStore {
  constructor(url, key) {
    this.supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  async listSessions() {
    const { data, error } = await this.supabase
      .from('sessions')
      .select('id,name,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw databaseError(error);
    return (data || []).map(mapSession);
  }

  async getSession(id) {
    const { data, error } = await this.supabase
      .from('sessions')
      .select('id,name,created_at,updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw databaseError(error);
    return mapSession(data);
  }

  async createSession(name) {
    const now = nowIso();
    const { data, error } = await this.supabase
      .from('sessions')
      .insert({ id: randomUUID(), name, created_at: now, updated_at: now })
      .select()
      .single();
    if (error) throw databaseError(error);
    return mapSession(data);
  }

  async renameSession(id, name) {
    const { data, error } = await this.supabase
      .from('sessions')
      .update({ name, updated_at: nowIso() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw databaseError(error);
    return mapSession(data);
  }

  async deleteSession(id) {
    const { data, error } = await this.supabase
      .from('sessions')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw databaseError(error);
    return Boolean(data);
  }

  async addMessage({ sessionId, role, content, reasoningContent = null, visible = true }) {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        id: randomUUID(),
        session_id: sessionId,
        role,
        content,
        reasoning_content: reasoningContent,
        visible,
        created_at: nowIso(),
      })
      .select()
      .single();
    if (error) throw databaseError(error);

    await this.supabase.from('sessions').update({ updated_at: nowIso() }).eq('id', sessionId);
    return mapMessage(data);
  }

  async getMessage(id) {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw databaseError(error);
    return mapMessage(data);
  }

  async listMessages(sessionId, visibleOnly = true) {
    let query = this.supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (visibleOnly) query = query.eq('visible', true);
    const { data, error } = await query;
    if (error) throw databaseError(error);
    return (data || []).map(mapMessage);
  }

  async hideMessages(messages) {
    if (!messages.length) return;
    const { error } = await this.supabase
      .from('messages')
      .update({ visible: false })
      .in('id', messages.map((message) => message.id));
    if (error) throw databaseError(error);
  }

  async deleteMessage(id) {
    const { error } = await this.supabase.from('messages').delete().eq('id', id);
    if (error) throw databaseError(error);
    return true;
  }

  async listMemories(limit = 20) {
    const { data, error } = await this.supabase
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw databaseError(error);
    return (data || []).map(mapMemory);
  }

  async insertMemory({ summary, conversationId = null, metadata = {} }) {
    const { data, error } = await this.supabase
      .from('memories')
      .insert({
        id: randomUUID(),
        session_id: 'global',
        summary,
        conversation_id: conversationId,
        metadata,
        created_at: nowIso(),
      })
      .select()
      .single();
    if (error) throw databaseError(error);
    return mapMemory(data);
  }

  async getSettings() {
    const { data, error } = await this.supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (data) return mapSettings(data);

    const { data: created, error: createError } = await this.supabase
      .from('settings')
      .insert({
        id: 1,
        session_id: 'global',
        system_prompt: DEFAULT_SETTINGS.systemPrompt,
        temperature: DEFAULT_SETTINGS.temperature,
        max_context_rounds: DEFAULT_SETTINGS.maxContextRounds,
        max_context_tokens: DEFAULT_SETTINGS.maxContextTokens,
        compress_threshold: DEFAULT_SETTINGS.compressThreshold,
        compress_keep_rounds: DEFAULT_SETTINGS.compressKeepRounds,
        max_reply_tokens: DEFAULT_SETTINGS.maxReplyTokens,
        theme_color: DEFAULT_SETTINGS.themeColor,
        updated_at: nowIso(),
      })
      .select()
      .single();
    if (createError) throw databaseError(createError);
    return mapSettings(created);
  }

  async updateSettings(patch) {
    const values = {};
    for (const [key, column] of Object.entries(SETTING_COLUMNS)) {
      if (patch[key] !== undefined) values[column] = patch[key];
    }
    values.updated_at = nowIso();

    const { data, error } = await this.supabase
      .from('settings')
      .update(values)
      .eq('id', 1)
      .select()
      .maybeSingle();
    if (error) throw databaseError(error);
    return data ? mapSettings(data) : this.getSettings();
  }

  async listFavorites(sessionId = null) {
    let query = this.supabase
      .from('favorites')
      .select('*')
      .order('created_at', { ascending: false });
    if (sessionId) query = query.eq('session_id', sessionId);
    const { data, error } = await query;
    if (error) throw databaseError(error);
    return (data || []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      messageId: row.message_id,
      content: row.content,
      createdAt: row.created_at,
    }));
  }

  async addFavorite({ sessionId, messageId, content }) {
    const { data, error } = await this.supabase
      .from('favorites')
      .insert({
        session_id: sessionId,
        message_id: messageId,
        content,
        created_at: nowIso(),
      })
      .select()
      .single();
    if (error) throw databaseError(error);
    return {
      id: data.id,
      sessionId: data.session_id,
      messageId: data.message_id,
      content: data.content,
      createdAt: data.created_at,
    };
  }

  async deleteFavorite(id) {
    const { error } = await this.supabase.from('favorites').delete().eq('id', id);
    if (error) throw databaseError(error);
    return true;
  }
}
