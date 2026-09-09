import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BookHeart,
  Bookmark,
  BookmarkCheck,
  Check,
  House,
  LockKeyhole,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import {
  addFavorite,
  createSession,
  deleteFavorite,
  deleteSession,
  getAuthStatus,
  getModels,
  getSettings,
  listFavorites,
  listMemoryEntries,
  listMessages,
  listSessions,
  renameSession,
  regenerateMessage,
  sendMessage,
  storePassword,
  updateSettings,
  verifyPassword,
} from './api.js';

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function makeLocalId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [models, setModels] = useState([{ value: 'local', label: '本地演示', ready: true }]);
  const [settings, setSettings] = useState(null);
  const [model, setModel] = useState(() => localStorage.getItem('bunny_model') || 'local');
  const [draft, setDraft] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [authState, setAuthState] = useState('loading');
  const [favorites, setFavorites] = useState([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [memoryEntries, setMemoryEntries] = useState([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [nowLabel, setNowLabel] = useState('');
  const bottomRef = useRef(null);

  const activeSession = sessions.find((session) => session.id === activeId) || null;

  useEffect(() => {
    let cancelled = false;
    getAuthStatus()
      .then((status) => {
        if (cancelled) return;
        setAuthState(status.required && !status.authenticated ? 'locked' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setAuthState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'ready') return;
    let cancelled = false;
    async function boot() {
      try {
        const [sessionData, modelData, settingsData, favoriteData, memoryData] = await Promise.all([
          listSessions(),
          getModels(),
          getSettings(),
          listFavorites(),
          listMemoryEntries(),
        ]);
        if (cancelled) return;
        setSessions(sessionData.sessions || []);
        setModels(modelData.models || []);
        setSettings(settingsData.settings);
        setFavorites(favoriteData.favorites || []);
        setMemoryEntries(memoryData.entries || []);
        setActiveId((sessionData.sessions || [])[0]?.id || null);
        const storedModel = localStorage.getItem('bunny_model');
        if (!storedModel) {
          const readyModel =
            (modelData.models || []).find((option) => option.ready && option.value !== 'local') ||
            (modelData.models || []).find((option) => option.ready);
          setModel(readyModel?.value || 'local');
        } else {
          setModel(storedModel);
        }
        setConnectionError('');
      } catch (error) {
        if (!cancelled) setConnectionError(error.message);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [authState]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeId) {
        setMessages([]);
        return;
      }
      setIsLoadingMessages(true);
      setConnectionError('');
      try {
        const data = await listMessages(activeId);
        if (!cancelled) setMessages(data.messages || []);
      } catch (error) {
        if (!cancelled) setConnectionError(error.message);
      } finally {
        if (!cancelled) setIsLoadingMessages(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isSending]);

  useEffect(() => {
    const update = () =>
      setNowLabel(
        new Date().toLocaleString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      );
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--accent',
      settings?.themeColor || '#2e7d91',
    );
  }, [settings?.themeColor]);

  useEffect(() => {
    localStorage.setItem('bunny_model', model);
  }, [model]);

  async function handleCreateSession() {
    try {
      const data = await createSession();
      setSessions((current) => [data.session, ...current]);
      setActiveId(data.session.id);
      setSidebarOpen(false);
      setConnectionError('');
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  async function handleRename(nextName) {
    if (!activeSession || !nextName.trim()) return;
    try {
      const data = await renameSession(activeSession.id, nextName.trim());
      setSessions((current) =>
        current.map((session) => (session.id === data.session.id ? data.session : session)),
      );
      setConnectionError('');
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDeleteSession() {
    if (!activeSession) return;
    const confirmed = window.confirm(`删除「${activeSession.name}」？会话内的消息也会一起删除。`);
    if (!confirmed) return;
    try {
      await deleteSession(activeSession.id);
      const remaining = sessions.filter((session) => session.id !== activeSession.id);
      setSessions(remaining);
      setActiveId(remaining[0]?.id || null);
      setConnectionError('');
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending || !activeSession) return;

    const optimisticMessage = {
      id: makeLocalId('user'),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);
    setDraft('');
    setIsSending(true);

    try {
      const data = await sendMessage({
        sessionId: activeSession.id,
        message: content,
        model,
      });
      setMessages((current) => [...current, data.message]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeLocalId('error'),
          role: 'assistant',
          content: `还没收到回应：${error.message}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleRegenerate(message) {
    if (!activeSession || isSending) return;
    setIsSending(true);
    try {
      const data = await regenerateMessage({
        sessionId: activeSession.id,
        model,
      });
      setMessages((current) =>
        current.map((item) => (item.id === message.id ? data.message : item)),
      );
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSaveSettings(nextSettings) {
    try {
      const data = await updateSettings(nextSettings);
      setSettings(data.settings);
      setSettingsOpen(false);
      setConnectionError('');
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  async function handleToggleFavorite(message) {
    if (!activeSession) return;
    const existing = favorites.find((favorite) => favorite.messageId === message.id);
    try {
      if (existing) {
        await deleteFavorite(existing.id);
        setFavorites((current) => current.filter((favorite) => favorite.id !== existing.id));
      } else {
        const data = await addFavorite({
          sessionId: message.sessionId || activeSession.id,
          messageId: message.id,
          content: message.content,
        });
        setFavorites((current) => [data.favorite, ...current]);
      }
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  async function handleOpenFavorites() {
    setFavoritesOpen(true);
    try {
      const data = await listFavorites();
      setFavorites(data.favorites || []);
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  async function handleOpenMemory() {
    setMemoryOpen(true);
    try {
      const data = await listMemoryEntries();
      setMemoryEntries(data.entries || []);
    } catch (error) {
      setConnectionError(error.message);
    }
  }

  async function handleUnlock(password) {
    await verifyPassword(password);
    storePassword(password);
    setAuthState('ready');
  }

  if (authState !== 'ready') {
    return <AuthGate state={authState} onUnlock={handleUnlock} />;
  }

  return (
    <div className="app-shell" style={{ '--accent': settings?.themeColor || '#2e7d91' }}>
      <div className={`scrim ${sidebarOpen ? 'is-visible' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand-row">
          <button
            type="button"
            className="icon-button home-button"
            title="Bunny's Home"
            onClick={() => setSidebarOpen(false)}
          >
            <House size={19} />
          </button>
          <div className="brand-copy">
            <strong>Bunny's Home</strong>
            <span>我们的地方</span>
          </div>
          <button
            type="button"
            className="icon-button mobile-only"
            title="收起"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <button type="button" className="new-chat-button" data-testid="new-session" onClick={handleCreateSession}>
          <Plus size={16} />
          新对话
        </button>

        <div className="session-heading">对话</div>
        <nav className="session-list" aria-label="会话列表">
          {sessions.map((session) => (
            <button
              type="button"
              key={session.id}
              className={`session-item ${session.id === activeId ? 'is-active' : ''}`}
              onClick={() => {
                setActiveId(session.id);
                setSidebarOpen(false);
              }}
            >
              <span className="session-dot" />
              <span className="session-meta">
                <span className="session-name">{session.name}</span>
                <span className="session-time">{formatTime(session.updatedAt)}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-pill">
            <Sparkles size={14} />
            本地已持久化
          </div>
        </div>
      </aside>

      <section className="chat-column">
        <header className="chat-header">
          <div className="header-left">
            <button
              type="button"
              className="icon-button mobile-only"
              title="打开对话列表"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>

            {activeSession ? (
              <>
                {isRenaming ? (
                  <form
                    className="rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleRename(renameDraft);
                    }}
                  >
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setIsRenaming(false);
                      }}
                    />
                    <button type="submit" className="icon-button" data-testid="rename-save" title="保存名称">
                      <Check size={17} />
                    </button>
                  </form>
                ) : (
                  <div className="session-title-block">
                    <h1>{activeSession.name}</h1>
                    <p>和 Bunny 说话 · {nowLabel}</p>
                  </div>
                )}

                <div className="session-actions">
                  {!isRenaming && (
                    <button
                      type="button"
                      className="icon-button"
                      data-testid="rename"
                      title="重命名"
                      onClick={() => {
                        setRenameDraft(activeSession.name);
                        setIsRenaming(true);
                      }}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button danger-button"
                    data-testid="delete-session"
                    title="删除会话"
                    onClick={handleDeleteSession}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </>
            ) : (
              <div className="session-title-block">
                <h1>Bunny's Home</h1>
                <p>还没有会话</p>
              </div>
            )}
          </div>

          <div className="header-actions">
            <label className="model-select">
              <Sparkles size={14} />
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                {models.map((option) => (
                  <option key={option.value} value={option.value} disabled={!option.ready}>
                    {option.ready ? option.label : `${option.label}（未配置）`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="icon-button"
              data-testid="open-memory"
              title="记忆库"
              onClick={handleOpenMemory}
            >
              <BookHeart size={19} />
            </button>
            <button
              type="button"
              className="icon-button"
              data-testid="open-favorites"
              title="收藏"
              onClick={handleOpenFavorites}
            >
              <Bookmark size={19} />
            </button>
            <button
              type="button"
              className="icon-button"
              data-testid="open-settings"
              title="设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>

        <main className="messages-area" aria-live="polite">
          {connectionError && <div className="error-banner">{connectionError}</div>}
          <div className="messages-list">
            {isLoadingMessages && (
              <div className="message-row from-bunny">
                <div className="bubble typing-bubble" aria-label="正在读取">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {messages.map((message, messageIndex) => (
              <article
                key={message.id}
                className={`message-row ${message.role === 'assistant' ? 'from-bunny' : 'from-user'}`}
              >
                <div className="bubble">
                  {message.role === 'assistant' &&
                    !isSending &&
                    messageIndex === messages.length - 1 && (
                      <button
                        type="button"
                        className="regenerate-toggle"
                        title="重新生成"
                        onClick={() => handleRegenerate(message)}
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                  <button
                    type="button"
                    className={`favorite-toggle ${
                      favorites.some((favorite) => favorite.messageId === message.id) ? 'is-active' : ''
                    }`}
                    title="收藏这条消息"
                    onClick={() => handleToggleFavorite(message)}
                  >
                    {favorites.some((favorite) => favorite.messageId === message.id) ? (
                      <BookmarkCheck size={16} />
                    ) : (
                      <Bookmark size={16} />
                    )}
                  </button>
                  <p>{message.content}</p>
                  {message.reasoningContent && (
                    <details className="reasoning">
                      <summary>思考过程</summary>
                      <p>{message.reasoningContent}</p>
                    </details>
                  )}
                  <time>{formatTime(message.createdAt)}</time>
                </div>
              </article>
            ))}

            {isSending && (
              <div className="message-row from-bunny">
                <div className="bubble typing-bubble" aria-label="正在回复">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        <form className="composer" onSubmit={handleSend}>
          <label className="composer-box">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="想说点什么……"
              rows={1}
            />
          </label>
          <button
            type="submit"
            className="send-button"
            data-testid="send"
            disabled={!draft.trim() || isSending || !activeSession}
            title="发送"
          >
            <ArrowUp size={18} />
          </button>
        </form>
      </section>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          models={models}
          model={model}
          onModelChange={setModel}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
      {favoritesOpen && (
        <FavoritesPanel
          favorites={favorites}
          onClose={() => setFavoritesOpen(false)}
          onDelete={async (id) => {
            await deleteFavorite(id);
            setFavorites((current) => current.filter((favorite) => favorite.id !== id));
          }}
        />
      )}
      {memoryOpen && (
        <MemoryPanel entries={memoryEntries} onClose={() => setMemoryOpen(false)} />
      )}
    </div>
  );
}

function AuthGate({ state, onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  if (state === 'loading') {
    return (
      <main className="auth-screen">
        <div className="auth-loading" aria-label="加载中">
          <Sparkles size={20} />
          Bunny's Home
        </div>
      </main>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setError('');
    try {
      await onUnlock(password);
    } catch {
      setError('密码不对，再试一次');
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-icon">
          <LockKeyhole size={24} />
        </div>
        <div className="auth-copy">
          <strong>Bunny's Home</strong>
          <span>我们的地方</span>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="输入访问密码"
            aria-label="访问密码"
          />
          <button type="submit" className="auth-submit" disabled={!password || checking}>
            <ArrowUp size={18} />
          </button>
        </form>
        {error && <p className="auth-error">{error}</p>}
      </div>
    </main>
  );
}

function MemoryPanel({ entries, onClose }) {
  return (
    <div className="drawer-layer">
      <div className="settings-panel" role="dialog" aria-modal="true" aria-label="记忆库">
        <div className="drawer-header">
          <div>
            <h2>记忆库</h2>
            <p>Bunny 记得的事，和她写下的日记</p>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="memory-list">
          {entries.length === 0 ? (
            <div className="favorites-empty">记忆还在慢慢生长</div>
          ) : (
            entries.map((entry) => (
              <article className={`memory-item kind-${entry.kind || 'memory'}`} key={entry.id}>
                <div className="memory-meta">
                  <BookHeart size={15} />
                  <strong>{entry.kind === 'diary' ? '日记' : '记忆'}</strong>
                  {entry.importance > 1 && <span className="importance">重要 {entry.importance}</span>}
                  <time>{formatTime(entry.createdAt)}</time>
                </div>
                {entry.title && <h3>{entry.title}</h3>}
                <p>{entry.content}</p>
                {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                  <div className="memory-tags">
                    {entry.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FavoritesPanel({ favorites, onClose, onDelete }) {
  return (
    <div className="drawer-layer">
      <div className="settings-panel" role="dialog" aria-modal="true" aria-label="收藏">
        <div className="drawer-header">
          <div>
            <h2>收藏</h2>
            <p>保留住想记住的话</p>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="favorites-list">
          {favorites.length === 0 ? (
            <div className="favorites-empty">还没有收藏</div>
          ) : (
            favorites.map((favorite) => (
              <article className="favorite-item" key={favorite.id}>
                <div className="favorite-meta">
                  <Bookmark size={15} />
                  <time>{formatTime(favorite.createdAt)}</time>
                </div>
                <p>{favorite.content}</p>
                <button
                  type="button"
                  className="icon-button danger-button"
                  title="删除收藏"
                  onClick={() => onDelete(favorite.id)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ settings, models, model, onModelChange, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('system');

  useEffect(() => {
    if (settings) {
      setForm({
        personaPrompt: settings.personaPrompt || settings.systemPrompt || '',
        languageStylePrompt: settings.languageStylePrompt || '',
        temperature: settings.temperature ?? 0.7,
        maxContextRounds: settings.maxContextRounds ?? 20,
        maxContextTokens: settings.maxContextTokens ?? 8000,
        compressThreshold: settings.compressThreshold ?? 12000,
        compressKeepRounds: settings.compressKeepRounds ?? 10,
        maxReplyTokens: settings.maxReplyTokens ?? 2000,
        themeColor: settings.themeColor || '#2e7d91',
        proactiveEnabled: Boolean(settings.proactiveEnabled),
        proactiveIntervalMinutes: settings.proactiveIntervalMinutes ?? 180,
        proactiveBatchCount: settings.proactiveBatchCount ?? 1,
        proactiveQuietStart: settings.proactiveQuietStart || '23:00',
        proactiveQuietEnd: settings.proactiveQuietEnd || '08:00',
        memoryCollectionEnabled: Boolean(settings.memoryCollectionEnabled),
        memoryEveryMessages: settings.memoryEveryMessages ?? 8,
      });
    }
  }, [settings]);

  useEffect(() => {
    if (form?.themeColor) {
      document.documentElement.style.setProperty('--accent', form.themeColor);
    }
  }, [form?.themeColor]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drawer-layer">
      <form className="settings-panel" role="dialog" aria-modal="true" aria-label="设置" onSubmit={handleSubmit}>
        <div className="drawer-header">
          <div>
            <h2>设置</h2>
            <p>对话的尺度与记忆</p>
          </div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-tabs">
            <button
              type="button"
              className={activeTab === 'system' ? 'is-active' : ''}
              onClick={() => setActiveTab('system')}
            >
              系统设置
            </button>
            <button
              type="button"
              className={activeTab === 'chat' ? 'is-active' : ''}
              onClick={() => setActiveTab('chat')}
            >
              对话设置
            </button>
          </div>

          {activeTab === 'system' && (
            <>
          <label className="field">
            <span>当前模型</span>
            <select value={model} onChange={(event) => onModelChange(event.target.value)}>
              {models.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.ready}>
                  {option.ready ? option.label : `${option.label}（未配置）`}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>主题颜色</span>
            <input
              type="color"
              value={form?.themeColor || '#2e7d91'}
              onChange={(event) => update('themeColor', event.target.value)}
            />
          </label>

          <label className="field">
            <span>人设设定</span>
            <textarea
              value={form?.personaPrompt || ''}
              onChange={(event) => update('personaPrompt', event.target.value)}
              rows={4}
            />
          </label>

          <label className="field">
            <span>语言风格</span>
            <textarea
              value={form?.languageStylePrompt || ''}
              onChange={(event) => update('languageStylePrompt', event.target.value)}
              rows={3}
            />
          </label>
            </>
          )}

          {activeTab === 'chat' && (
            <>
          <div className="proactive-card">
            <label className="toggle-row">
              <span>
                <strong>主动发消息</strong>
                <small>间隔到达时，Bunny 会主动来找你</small>
              </span>
              <input
                type="checkbox"
                checked={Boolean(form?.proactiveEnabled)}
                onChange={(event) => update('proactiveEnabled', event.target.checked)}
              />
            </label>
            {form?.proactiveEnabled && (
              <div className="proactive-fields">
                <label className="field">
                  <span>间隔分钟</span>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={form?.proactiveIntervalMinutes ?? 180}
                    onChange={(event) =>
                      update('proactiveIntervalMinutes', Number(event.target.value))
                    }
                  />
                </label>
                <label className="field">
                  <span>每次条数</span>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={form?.proactiveBatchCount ?? 1}
                    onChange={(event) =>
                      update('proactiveBatchCount', Number(event.target.value))
                    }
                  />
                </label>
                <label className="field">
                  <span>静默开始</span>
                  <input
                    type="time"
                    value={form?.proactiveQuietStart || '23:00'}
                    onChange={(event) => update('proactiveQuietStart', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>静默结束</span>
                  <input
                    type="time"
                    value={form?.proactiveQuietEnd || '08:00'}
                    onChange={(event) => update('proactiveQuietEnd', event.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="proactive-card">
            <label className="toggle-row">
              <span>
                <strong>主动记忆收集</strong>
                <small>聊天积累到一定轮数后自动整理记忆和日记</small>
              </span>
              <input
                type="checkbox"
                checked={Boolean(form?.memoryCollectionEnabled)}
                onChange={(event) => update('memoryCollectionEnabled', event.target.checked)}
              />
            </label>
            {form?.memoryCollectionEnabled && (
              <label className="field memory-interval-field">
                <span>每多少条消息整理一次</span>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={form?.memoryEveryMessages ?? 8}
                  onChange={(event) => update('memoryEveryMessages', Number(event.target.value))}
                />
              </label>
            )}
          </div>

          <div className="range-row">
            <label className="field">
              <span>温度：{Number(form?.temperature ?? 0).toFixed(1)}</span>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                value={form?.temperature ?? 0.7}
                onChange={(event) => update('temperature', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>保留轮数</span>
              <input
                type="number"
                min="1"
                max="100"
                value={form?.maxContextRounds ?? 20}
                onChange={(event) => update('maxContextRounds', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="range-row">
            <label className="field">
              <span>上下文上限</span>
              <input
                type="number"
                min="1000"
                step="1000"
                value={form?.maxContextTokens ?? 8000}
                onChange={(event) => update('maxContextTokens', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>回复上限</span>
              <input
                type="number"
                min="100"
                step="100"
                value={form?.maxReplyTokens ?? 2000}
                onChange={(event) => update('maxReplyTokens', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="range-row">
            <label className="field">
              <span>压缩阈值</span>
              <input
                type="number"
                min="1000"
                step="1000"
                value={form?.compressThreshold ?? 12000}
                onChange={(event) => update('compressThreshold', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>压缩后保留</span>
              <input
                type="number"
                min="1"
                max="50"
                value={form?.compressKeepRounds ?? 10}
                onChange={(event) => update('compressKeepRounds', Number(event.target.value))}
              />
            </label>
          </div>
            </>
          )}
        </div>

        <div className="drawer-footer">
          <button type="submit" className="save-button" data-testid="save-settings" disabled={saving || !form}>
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </form>
    </div>
  );
}
