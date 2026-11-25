-- 캠퍼스 부수기 랭킹 (Cloudflare D1)
CREATE TABLE IF NOT EXISTS runs (
  sid TEXT PRIMARY KEY,          -- 라운드 토큰 id, 한 번만 제출된다
  cid TEXT NOT NULL,             -- 브라우저마다 만든 무작위 id
  name TEXT NOT NULL,
  dept TEXT NOT NULL,
  score INTEGER NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  combo INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_ip ON runs (ip, created);

CREATE TABLE IF NOT EXISTS players (
  cid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dept TEXT NOT NULL,
  best INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_best ON players (best DESC);

CREATE TABLE IF NOT EXISTS depts (
  dept TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  players INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS depts_total ON depts (total DESC);
