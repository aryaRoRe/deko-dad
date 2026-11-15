CREATE TABLE IF NOT EXISTS telegram_users (
  chat_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'seller')),
  lang TEXT NOT NULL CHECK(lang IN ('fa', 'en')),
  conversation TEXT REFERENCES conversations(id) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_threads (
  conversation TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES telegram_users(chat_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id TEXT PRIMARY KEY,
  claim TEXT,
  retry_at INTEGER NOT NULL,
  handled_at INTEGER
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS telegram_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_key TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  text TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  claim TEXT,
  sent_at INTEGER,
  failed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS telegram_pending ON telegram_outbox (available_at, id)
WHERE sent_at IS NULL AND failed_at IS NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS telegram_team_message AFTER INSERT ON messages
WHEN NEW.sender = 'team'
BEGIN
  INSERT OR IGNORE INTO telegram_outbox (delivery_key, chat_id, text, available_at)
  SELECT 'team:' || NEW.id, chat_id, 'DEKO-' || UPPER(SUBSTR(NEW.conversation, -8)) || CHAR(10) || NEW.text, NEW.created
  FROM telegram_threads WHERE conversation = NEW.conversation;
END;
