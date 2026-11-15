CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  version INTEGER NOT NULL,
  data TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('customer', 'seller')),
  lang TEXT NOT NULL CHECK(lang IN ('fa', 'en')),
  status TEXT NOT NULL CHECK(status IN ('assistant', 'waiting', 'human', 'closed')),
  updated INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK(sender IN ('visitor', 'assistant', 'team')),
  text TEXT NOT NULL,
  products TEXT NOT NULL DEFAULT '[]',
  created INTEGER NOT NULL,
  request_id TEXT,
  UNIQUE(conversation, sender, request_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_thread ON messages(conversation, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS team_queue ON conversations(status, updated);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS message_activity AFTER INSERT ON messages
BEGIN
  UPDATE conversations SET updated = NEW.created WHERE id = NEW.conversation;
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS team_sessions (secret TEXT PRIMARY KEY, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS conversation_owners (
  conversation TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS owner_threads ON conversation_owners(owner, created DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS staff_owner (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  owner TEXT NOT NULL
);
