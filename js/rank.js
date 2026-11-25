// 랭킹 서버와 주고받는 부분. 서버가 없거나 느려도 게임은 그대로 돌아간다.
(function () {
'use strict';
const API = 'https://campus-smash-rank.mo-campus.workers.dev';
const KEY = 'campusSmashMe';
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function save(me) { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {} }
const me = load();
if (!me.cid || !/^[a-z0-9]{12,40}$/.test(me.cid)) {
  const a = new Uint8Array(12); (crypto.getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }));
  me.cid = Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20); save(me);
}
async function call(path, body, ms) {
  const ctl = 'AbortController' in window ? new AbortController() : null, t = ctl && setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl && ctl.signal } : { signal: ctl && ctl.signal, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'http'), { code: j.error || r.status });
    return j;
  } finally { if (t) clearTimeout(t); }
}
window.RANK = {
  me,
  setMe(name) { me.name = name; delete me.dept; save(me); },
  board: () => call('/board?cid=' + me.cid),
  start: () => call('/start', {}, 6000),
  submit: (tok, r) => call('/submit', Object.assign({}, tok, { cid: me.cid, name: me.name, score: r.score, kills: r.kills, combo: r.combo }), 10000)
};
})();
