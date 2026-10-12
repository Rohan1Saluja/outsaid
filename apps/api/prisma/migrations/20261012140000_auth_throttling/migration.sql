CREATE TABLE outsaid."LoginThrottle" (
  "key" CHAR(64) PRIMARY KEY CHECK ("key" ~ '^[a-f0-9]{64}$'),
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL CHECK ("attempts" > 0)
);
CREATE INDEX "LoginThrottle_windowStart_idx" ON outsaid."LoginThrottle" ("windowStart");
REVOKE ALL ON outsaid."LoginThrottle" FROM PUBLIC;
ALTER TABLE outsaid."LoginThrottle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsaid."Session" ADD CONSTRAINT "Session_tokenHash_hex" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');
