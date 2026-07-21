const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS profiles (
    owner_id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ideas (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    slot INTEGER NOT NULL,
    title TEXT NOT NULL,
    seed TEXT NOT NULL,
    tone TEXT NOT NULL,
    quip TEXT NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'pruned')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    pruned_at TEXT,
    PRIMARY KEY (owner_id, id)
  )`,
  "CREATE INDEX IF NOT EXISTS ideas_owner_status_idx ON ideas (owner_id, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS ideas_owner_active_slot_idx ON ideas (owner_id, slot) WHERE status = 'active'",
  `CREATE TABLE IF NOT EXISTS dojo_sessions (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    idea_json TEXT NOT NULL,
    turn INTEGER DEFAULT 0 NOT NULL,
    moves_json TEXT DEFAULT '[]' NOT NULL,
    state_json TEXT NOT NULL,
    progress_json TEXT NOT NULL,
    history_json TEXT DEFAULT '[]' NOT NULL,
    message_pending INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (owner_id, id)
  )`,
  "CREATE INDEX IF NOT EXISTS dojo_sessions_owner_updated_idx ON dojo_sessions (owner_id, updated_at)",
  `CREATE TABLE IF NOT EXISTS dojo_messages (
    owner_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    encounter INTEGER NOT NULL,
    exchange INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'idea')),
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (owner_id, session_id, sequence)
  )`,
  "CREATE INDEX IF NOT EXISTS dojo_messages_session_idx ON dojo_messages (owner_id, session_id)",
];

const schemaReady = new WeakMap();

function parseJson(value, fallback) {
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function ideaFromRow(row) {
  return {
    id: row.id,
    slot: Number(row.slot),
    name: row.title,
    title: row.title,
    seed: row.seed,
    description: row.seed,
    tone: row.tone,
    quip: row.quip,
    createdAt: row.created_at,
    ...(row.pruned_at ? { prunedAt: row.pruned_at } : {}),
  };
}

function sessionFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    idea: parseJson(row.idea_json, null),
    turn: Number(row.turn),
    moves: parseJson(row.moves_json, []),
    state: parseJson(row.state_json, {}),
    progress: parseJson(row.progress_json, {}),
    history: parseJson(row.history_json, []),
    messagePending: Boolean(row.message_pending),
    expiresAt: row.expires_at,
  };
}

async function first(statement) {
  const result = await statement.all();
  return result.results?.[0] || null;
}

export function createD1Store(db, user) {
  if (!db) throw new Error("Idea storage is unavailable.");
  const ownerId = user.ownerId;

  async function ensureSchema() {
    if (!schemaReady.has(db)) {
      schemaReady.set(db, db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement))));
    }
    await schemaReady.get(db);
  }

  async function ensureProfile() {
    await ensureSchema();
    await db.prepare(`INSERT INTO profiles (owner_id, display_name)
      VALUES (?, ?)
      ON CONFLICT(owner_id) DO UPDATE SET display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`)
      .bind(ownerId, user.name).run();
  }

  async function getGarden() {
    await ensureProfile();
    const result = await db.prepare(`SELECT * FROM ideas WHERE owner_id = ?
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, slot, created_at`).bind(ownerId).all();
    const values = (result.results || []).map(ideaFromRow);
    return {
      ideas: values.filter((idea) => !idea.prunedAt),
      prunedIdeas: values.filter((idea) => idea.prunedAt),
    };
  }

  async function saveIdea(idea) {
    await ensureProfile();
    const occupant = await first(db.prepare(`SELECT id FROM ideas
      WHERE owner_id = ? AND slot = ? AND status = 'active'`).bind(ownerId, idea.slot));
    if (occupant && occupant.id !== idea.id) {
      const error = new Error("That clearing is already growing an idea.");
      error.status = 409;
      throw error;
    }
    await db.prepare(`INSERT INTO ideas
      (owner_id, id, slot, title, seed, tone, quip, status, created_at, updated_at, pruned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(owner_id, id) DO UPDATE SET
        slot = excluded.slot, title = excluded.title, seed = excluded.seed,
        tone = excluded.tone, quip = excluded.quip, status = 'active',
        updated_at = CURRENT_TIMESTAMP, pruned_at = NULL`)
      .bind(ownerId, idea.id, idea.slot, idea.title, idea.seed, idea.tone, idea.quip, idea.createdAt).run();
    return idea;
  }

  async function pruneIdea(idea) {
    await ensureProfile();
    await db.prepare(`INSERT INTO ideas
      (owner_id, id, slot, title, seed, tone, quip, status, created_at, updated_at, pruned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pruned', ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(owner_id, id) DO UPDATE SET
        slot = excluded.slot, title = excluded.title, seed = excluded.seed,
        tone = excluded.tone, quip = excluded.quip, status = 'pruned',
        updated_at = CURRENT_TIMESTAMP, pruned_at = excluded.pruned_at`)
      .bind(ownerId, idea.id, idea.slot, idea.title, idea.seed, idea.tone, idea.quip, idea.createdAt, idea.prunedAt).run();
    return idea;
  }

  async function createSession(session) {
    await ensureProfile();
    await db.prepare(`INSERT INTO dojo_sessions
      (owner_id, id, idea_json, turn, moves_json, state_json, progress_json, history_json, message_pending, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
      .bind(ownerId, session.id, JSON.stringify(session.idea), session.turn, JSON.stringify(session.moves),
        JSON.stringify(session.state), JSON.stringify(session.progress), JSON.stringify(session.history), session.expiresAt).run();
    return session;
  }

  async function getSession(id) {
    await ensureProfile();
    const row = await first(db.prepare("SELECT * FROM dojo_sessions WHERE owner_id = ? AND id = ?")
      .bind(ownerId, id));
    if (!row) return null;
    if (new Date(row.expires_at) <= new Date()) {
      await db.prepare("DELETE FROM dojo_sessions WHERE owner_id = ? AND id = ?").bind(ownerId, id).run();
      return null;
    }
    return sessionFromRow(row);
  }

  async function updateSession(session) {
    await db.prepare(`UPDATE dojo_sessions SET
      idea_json = ?, turn = ?, moves_json = ?, state_json = ?, progress_json = ?,
      history_json = ?, message_pending = ?, updated_at = CURRENT_TIMESTAMP, expires_at = ?
      WHERE owner_id = ? AND id = ?`)
      .bind(JSON.stringify(session.idea), session.turn, JSON.stringify(session.moves), JSON.stringify(session.state),
        JSON.stringify(session.progress), JSON.stringify(session.history), session.messagePending ? 1 : 0,
        session.expiresAt, ownerId, session.id).run();
  }

  async function claimMessage(id) {
    const result = await db.prepare(`UPDATE dojo_sessions SET message_pending = 1, updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = ? AND id = ? AND message_pending = 0`).bind(ownerId, id).run();
    return Number(result.meta?.changes || 0) === 1;
  }

  async function releaseMessage(id) {
    await db.prepare("UPDATE dojo_sessions SET message_pending = 0 WHERE owner_id = ? AND id = ?")
      .bind(ownerId, id).run();
  }

  async function appendDialogue(session, message, reply, exchange) {
    const next = await first(db.prepare(`SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
      FROM dojo_messages WHERE owner_id = ? AND session_id = ?`).bind(ownerId, session.id));
    const sequence = Number(next?.sequence || 1);
    await db.batch([
      db.prepare(`INSERT INTO dojo_messages
        (owner_id, session_id, sequence, encounter, exchange, role, content)
        VALUES (?, ?, ?, ?, ?, 'user', ?)`)
        .bind(ownerId, session.id, sequence, session.progress.encounter, exchange, message),
      db.prepare(`INSERT INTO dojo_messages
        (owner_id, session_id, sequence, encounter, exchange, role, content)
        VALUES (?, ?, ?, ?, ?, 'idea', ?)`)
        .bind(ownerId, session.id, sequence + 1, session.progress.encounter, exchange, reply),
    ]);
  }

  return {
    ensureProfile,
    getGarden,
    saveIdea,
    pruneIdea,
    createSession,
    getSession,
    updateSession,
    claimMessage,
    releaseMessage,
    appendDialogue,
  };
}
