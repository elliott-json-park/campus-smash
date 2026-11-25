// 캠퍼스 부수기 랭킹 API (Cloudflare Workers + D1, 무료 플랜 기준)
//   POST /start   라운드 시작 토큰 발급 (서명만, 저장 없음)
//   POST /submit  라운드 결과 제출 (토큰 1회용, 경과 시간과 점수 상한 확인)
//   GET  /board   개인 TOP 50, 학과 순위, 내 순위
// 학과 목록은 js/depts.js와 같아야 한다.

const ROUND_SEC = 60;
const MAX_SCORE = 800000;          // 이론상 최대(35채 전부, 연쇄 3배, 남은 시간 보너스)보다 넉넉히 큰 값
const NAME_MAX = 10;
const ORIGINS = ['https://elliott-json-park.github.io', 'http://127.0.0.1:8123', 'http://localhost:8123'];

const DEPTS = [
  '불교학부', '문화유산학과',
  '국어국문문예창작학부', '영어영문학부', '일본학과', '중어중문학과', '철학과', '사학과',
  '수학과', '화학과', '통계학과', '물리반도체과학부', '물리학과',
  '법학과',
  '정치외교학전공', '행정학전공', '북한학전공', '경제학과', '국제통상학과', '사회학전공', '미디어커뮤니케이션학전공', '식품산업관리학과', '광고홍보학과', '사회복지학과',
  '경찰행정학부',
  '경영학과', '회계학과', '경영정보학과',
  '융합환경과학과', '생명과학과', '식품바이오융합공학과', '의생명공학과',
  '전자전기공학부', '정보통신공학과', '건설환경공학과', '화공생물공학과', '기계로봇에너지공학과', '건축공학부', '산업시스템공학과', '에너지신소재공학과',
  '컴퓨터AI학부', '시스템반도체학부', '의료인공지능공학과', '지능형네트워크융합학과', '지능IoT학과',
  '교육학과', '국어교육과', '역사교육과', '지리교육과', '수학교육과', '가정교육과', '체육교육과',
  '미술학부', '연극학부', '영화영상학과', '스포츠문화학과', '한국음악과',
  '약학과',
  '범죄학과', '사회복지상담학과', '글로벌무역학과',
  '열린전공학부', '다르마칼리지', '대학원', '교직원', '졸업생', '다른 학교'
];
const DEPT_SET = new Set(DEPTS);
const BAD = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '존나', '개새', '새끼', '지랄', '느금', '니애미', '애미', '애비', '섹스', '보지', '자지', '일베', '한남', '한녀', 'fuck', 'shit', 'sex', 'bitch'];

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function cors(req) {
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const json = (req, data, status, extra) => new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors(req), extra || {}) });

function cleanName(s) {
  s = String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > NAME_MAX) return null;
  const flat = s.toLowerCase().replace(/[\s_.\-0-9]/g, '');
  if (BAD.some((w) => flat.includes(w))) return null;
  return s;
}
const cleanCid = (s) => /^[a-z0-9]{12,40}$/.test(String(s || '')) ? String(s) : null;

async function board(env, cid) {
  const db = env.DB;
  const [top, depts, count] = await db.batch([
    db.prepare('SELECT name, dept, best, cid FROM players ORDER BY best DESC, updated ASC LIMIT 50'),
    db.prepare('SELECT dept, total, plays, players FROM depts ORDER BY total DESC LIMIT 80'),
    db.prepare('SELECT COUNT(*) AS n FROM players')
  ]);
  const out = {
    players: top.results.map((r) => ({ name: r.name, dept: r.dept, best: r.best, me: !!cid && r.cid === cid })),
    depts: depts.results,
    total: count.results[0].n
  };
  if (cid) {
    const me = await db.prepare('SELECT best, plays, name, dept FROM players WHERE cid = ?').bind(cid).first();
    if (me) {
      const r = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE best > ?').bind(me.best).first();
      out.me = { rank: r.n + 1, best: me.best, plays: me.plays, name: me.name, dept: me.dept };
    }
  }
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    try {
      if (path === '/start' && req.method === 'POST') {
        const t = Date.now(), sid = crypto.randomUUID().replace(/-/g, '');
        return json(req, { sid, t, sig: await hmac(env.SECRET, sid + '.' + t) });
      }
      if (path === '/submit' && req.method === 'POST') {
        const b = await req.json().catch(() => null);
        if (!b) return json(req, { error: 'bad' }, 400);
        const name = cleanName(b.name), cid = cleanCid(b.cid), dept = DEPT_SET.has(b.dept) ? b.dept : null;
        if (!name) return json(req, { error: 'name' }, 400);
        if (!cid || !dept) return json(req, { error: 'bad' }, 400);
        const sid = String(b.sid || ''), t = Number(b.t), sig = String(b.sig || '');
        if (!/^[a-f0-9]{32}$/.test(sid) || !Number.isFinite(t) || sig !== await hmac(env.SECRET, sid + '.' + t)) return json(req, { error: 'token' }, 403);
        const now = Date.now(), el = (now - t) / 1000;
        if (el < ROUND_SEC - 4 || el > 60 * 30) return json(req, { error: 'time' }, 403);
        const score = Math.floor(Number(b.score)), kills = Math.floor(Number(b.kills) || 0), combo = Math.floor(Number(b.combo) || 0);
        if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE || kills < 0 || kills > 80 || combo < 0 || combo > 80) return json(req, { error: 'score' }, 403);
        const ip = req.headers.get('CF-Connecting-IP') || '';
        const db = env.DB;
        const recent = await db.prepare('SELECT COUNT(*) AS n FROM runs WHERE ip = ? AND created > ?').bind(ip, now - 3600e3).first();
        if (recent.n >= 70) return json(req, { error: 'rate' }, 429);
        const prev = await db.prepare('SELECT best, dept FROM players WHERE cid = ?').bind(cid).first();
        const newInDept = !prev || prev.dept !== dept;
        try {
          await db.batch([
            db.prepare('INSERT INTO runs (sid, cid, name, dept, score, kills, combo, ip, created) VALUES (?,?,?,?,?,?,?,?,?)').bind(sid, cid, name, dept, score, kills, combo, ip, now),
            db.prepare('INSERT INTO players (cid, name, dept, best, plays, updated) VALUES (?,?,?,?,1,?) ON CONFLICT(cid) DO UPDATE SET name = excluded.name, dept = excluded.dept, plays = plays + 1, updated = CASE WHEN excluded.best > best THEN excluded.updated ELSE updated END, best = MAX(best, excluded.best)').bind(cid, name, dept, score, now),
            db.prepare('INSERT INTO depts (dept, total, plays, players) VALUES (?,?,1,1) ON CONFLICT(dept) DO UPDATE SET total = total + excluded.total, plays = plays + 1, players = players + ?').bind(dept, score, newInDept ? 1 : 0)
          ]);
        } catch (e) {
          if (String(e).includes('UNIQUE')) return json(req, { error: 'dup' }, 409);
          throw e;
        }
        const out = await board(env, cid);
        out.prevBest = prev ? prev.best : 0;
        return json(req, out);
      }
      if (path === '/board' && req.method === 'GET') {
        return json(req, await board(env, cleanCid(url.searchParams.get('cid'))), 200, { 'Cache-Control': 'no-store' });
      }
      if (path === '/') return json(req, { ok: true });
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server' }, 500);
    }
  }
};
