/**
 * End-to-end smoke test against a running server.
 *   npm run seed && npm run dev   (in one terminal)
 *   npm run smoke                 (in another; BASE_URL defaults to http://localhost:5000)
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:5000';
let failures = 0;

function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${name}${ok ? '' : '  ->  ' + JSON.stringify(extra)}`);
  if (!ok) failures++;
}

class Client {
  cookie = '';
  async call(method: string, url: string, body?: unknown, raw?: BodyInit, headers: Record<string, string> = {}) {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers };
  }
}

async function main() {
  const asha = new Client();
  const stamp = Date.now();
  const newcomer = new Client();

  console.log('Health');
  check('liveness', (await asha.call('GET', '/healthz')).status === 200);
  check('readiness (db)', (await asha.call('GET', '/api/health')).json?.db === 'up');

  console.log('Auth');
  check('feed requires login', (await asha.call('GET', '/api/posts')).status === 401);
  const login = await asha.call('POST', '/api/auth/login', { email: 'asha@demo.medmedia.app', password: 'Password123!' });
  check('login works', login.status === 200 && !!login.json?.user, login.json);
  check('wrong password rejected', (await new Client().call('POST', '/api/auth/login', { email: 'asha@demo.medmedia.app', password: 'x' })).status === 401);
  const email = `new${stamp}@example.com`;
  const reg = await newcomer.call('POST', '/api/auth/register', { name: 'New Student', email, password: 'Password123!', role: 'student', course: 'MBBS', acceptTerms: true });
  check('register works', reg.status === 201, reg.json);
  check('duplicate email rejected', (await new Client().call('POST', '/api/auth/register', { name: 'Dup', email, password: 'Password123!', role: 'student', acceptTerms: true })).status === 400);
  check('terms required', (await new Client().call('POST', '/api/auth/register', { name: 'No Terms', email: `x${stamp}@example.com`, password: 'Password123!', role: 'student' })).status === 400);

  console.log('Posts');
  const bare = await asha.call('POST', '/api/posts', { kind: 'update', body: `Hello ${stamp}` });
  check('create post', bare.status === 201 && bare.json.post.author.verified, bare.json);
  const noConsent = await asha.call('POST', '/api/posts', { kind: 'case_poll', body: 'Case?', pollOptions: ['A', 'B'] });
  check('case poll needs patient-privacy confirmation', noConsent.status === 400, noConsent.json);
  const poll = await asha.call('POST', '/api/posts', { kind: 'case_poll', body: 'Which one?', pollOptions: ['A', 'B', 'C'], noPatientInfo: true });
  check('create case poll', poll.status === 201 && poll.json.post.poll.options.length === 3, poll.json);
  const pid = poll.json.post.id;
  const vote = await newcomer.call('POST', `/api/posts/${pid}/vote`, { option: 1 });
  check('vote counts', vote.json?.poll?.options?.[1]?.votes === 1 && vote.json.poll.myVote === 1, vote.json);
  const vote2 = await newcomer.call('POST', `/api/posts/${pid}/vote`, { option: 2 });
  check('cannot vote twice', vote2.json?.poll?.total === 1 && vote2.json.poll.myVote === 1, vote2.json);
  const like1 = await newcomer.call('POST', `/api/posts/${pid}/like`);
  const like2 = await newcomer.call('POST', `/api/posts/${pid}/like`);
  check('like is idempotent', like1.json?.likeCount === 1 && like2.json?.likeCount === 1, [like1.json, like2.json]);
  check('unlike', (await newcomer.call('DELETE', `/api/posts/${pid}/like`)).json?.likeCount === 0);
  const cm = await newcomer.call('POST', `/api/posts/${pid}/comments`, { body: 'Interesting case' });
  check('comment', cm.status === 201, cm.json);
  check('comment listed', (await asha.call('GET', `/api/posts/${pid}/comments`)).json?.items?.length === 1);
  check('bad uuid -> 400', (await asha.call('GET', '/api/posts/not-a-uuid/comments')).status === 400);
  check('stranger cannot delete', (await newcomer.call('DELETE', `/api/posts/${pid}`)).status === 403);

  console.log('Pagination');
  for (let i = 0; i < 5; i++) await asha.call('POST', '/api/posts', { kind: 'update', body: `page test ${stamp} ${i}` });
  const p1 = await asha.call('GET', '/api/posts?limit=3');
  const p2 = await asha.call('GET', `/api/posts?limit=3&cursor=${p1.json.nextCursor}`);
  const ids = new Set([...p1.json.items, ...p2.json.items].map((p: any) => p.id));
  check('pages do not overlap', ids.size === 6 && !!p1.json.nextCursor, [p1.json.nextCursor, ids.size]);

  console.log('Follow & profiles');
  const meId = login.json.user.id;
  check('follow', (await newcomer.call('POST', `/api/users/${meId}/follow`)).json?.following === true);
  const prof = await newcomer.call('GET', `/api/users/${meId}`);
  check('profile shows follower + hides email', prof.json.user.followerCount >= 1 && prof.json.user.following === true && prof.json.user.email === undefined, prof.json);
  const followingFeed = await newcomer.call('GET', '/api/posts?scope=following');
  check('following feed contains followed author', followingFeed.json.items.length > 0 && followingFeed.json.items.every((p: any) => p.author.id === meId || p.author.name === 'New Student'));
  check('unfollow', (await newcomer.call('DELETE', `/api/users/${meId}/follow`)).json?.following === false);

  console.log('Verification gating');
  const clipTry = await newcomer.call('POST', '/api/clips', { caption: 'x', category: 'clinical', videoKey: 'public/clip/2026-01-01/00000000-0000-0000-0000-000000000000.mp4', noPatientInfo: true });
  check('unverified user cannot post clips', clipTry.status === 403, clipTry.json);
  const oppTry = await newcomer.call('POST', '/api/opportunities', { kind: 'event', title: 'Test event', organization: 'Org', description: 'A long enough description' });
  check('unverified user cannot post opportunities', oppTry.status === 403);

  console.log('Uploads');
  const cfg = await newcomer.call('GET', '/api/uploads/config');
  check('upload config', cfg.json?.driver === 'local' || cfg.json?.driver === 's3');
  if (cfg.json?.driver === 'local') {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'doc.png');
    const up = await newcomer.call('POST', '/api/uploads?purpose=verification', undefined, form);
    check('upload verification doc (private)', up.status === 201 && up.json.url === null && up.json.key.startsWith('private/'), up.json);
    const fake = new FormData();
    fake.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'image/png' }), 'evil.png');
    const bad = await newcomer.call('POST', '/api/uploads?purpose=post', undefined, fake);
    check('fake image rejected by content sniffing', bad.status === 400, bad.json);
    const wrongType = new FormData();
    wrongType.append('file', new Blob([png], { type: 'text/html' }), 'x.html');
    check('wrong mime rejected', (await newcomer.call('POST', '/api/uploads?purpose=post', undefined, wrongType)).status === 400);
    const sub = await newcomer.call('POST', '/api/auth/verification', { docKey: up.json.key });
    check('submit for verification -> pending', sub.json?.user?.verificationStatus === 'pending', sub.json);
    check('private file is not web-accessible', (await newcomer.call('GET', '/media/' + up.json.key.replace(/^public\//, ''))).status === 404);
    check('non-admin cannot list verifications', (await newcomer.call('GET', '/api/admin/verifications')).status === 403);
    check('non-admin cannot read documents', (await newcomer.call('GET', `/api/admin/users/${reg.json.user.id}/document`)).status === 403);

    console.log('Admin review');
    const admin = asha; // ADMIN_EMAILS includes asha in the smoke environment
    const adminLogin = await admin.call('POST', '/api/auth/login', { email: 'asha@demo.medmedia.app', password: 'Password123!' });
    if (adminLogin.json?.user?.isAdmin) {
      const list = await admin.call('GET', '/api/admin/verifications');
      check('admin sees pending request', list.json?.items?.some((i: any) => i.email === email));
      const doc = await admin.call('GET', `/api/admin/users/${reg.json.user.id}/document`);
      check('admin can read document', doc.status === 200);
      const ok = await admin.call('POST', `/api/admin/users/${reg.json.user.id}/verification`, { status: 'verified' });
      check('admin approves', ok.json?.status === 'verified', ok.json);
      const opp = await newcomer.call('POST', '/api/opportunities', { kind: 'event', title: 'Student CME day', organization: 'MMC', description: 'A long enough description', location: 'Chennai' });
      check('now verified: can post event', opp.status === 201, opp.json);
      const job = await newcomer.call('POST', '/api/opportunities', { kind: 'job', title: 'Student job', organization: 'MMC', description: 'A long enough description' });
      check('students cannot post jobs', job.status === 403, job.json);
    } else {
      console.log('  skip  admin checks (add asha@demo.medmedia.app to ADMIN_EMAILS to run them)');
    }
  }

  console.log('Opportunities & search');
  const opps = await asha.call('GET', '/api/opportunities?kind=job');
  check('filter by kind', opps.json?.items?.length > 0 && opps.json.items.every((o: any) => o.kind === 'job'), opps.json);
  const filtered = await asha.call('GET', '/api/opportunities?location=chen&q=cardio');
  check('location + prefix text search', filtered.json?.items?.some((o: any) => /cardiolog/i.test(o.title)), filtered.json);
  const search = await asha.call('GET', '/api/search?q=cardi');
  check('search finds people + opportunities by prefix', search.json?.people?.length > 0 && search.json?.opportunities?.length > 0, search.json);
  check('search rejects 1 char', (await asha.call('GET', '/api/search?q=a')).status === 400);
  check("search handles SQL-ish input", (await asha.call('GET', "/api/search?q=%27%3B%20drop%20table%20users%3B--")).status === 200);

  console.log('Misc');
  check('unknown api route -> 404 json', (await asha.call('GET', '/api/nope')).status === 404);
  const bigJson = await asha.call('POST', '/api/posts', { kind: 'update', body: 'x'.repeat(200_000) });
  check('oversized body rejected', bigJson.status === 413, bigJson.status);
  check('security headers present', !!(await asha.call('GET', '/api/nope')).headers.get('content-security-policy'));

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
