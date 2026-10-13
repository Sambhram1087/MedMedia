import { config } from './config';
import { pool, q } from './db';
import { hashPassword } from './lib/security';
import { runMigrations } from './migrate';

/** Demo data for local development. All demo accounts use the password: Password123! */
async function main() {
  if (config.isProd && process.env.SEED_ALLOW !== 'true') {
    throw new Error('Refusing to seed a production database. Set SEED_ALLOW=true to override.');
  }
  await runMigrations();
  const hash = await hashPassword('Password123!');

  const users = [
    ['Dr. Asha Menon', 'asha@demo.medmedia.app', 'doctor', 'Cardiologist', 'Apollo Hospitals, Chennai', 'Chennai', null],
    ['Dr. Rohan Iyer', 'rohan@demo.medmedia.app', 'doctor', 'Orthopaedic Surgeon', 'MIOT International', 'Chennai', null],
    ['Meera Nair', 'meera@demo.medmedia.app', 'student', null, 'Madras Medical College', 'Chennai', 'MBBS'],
  ];
  const ids: string[] = [];
  for (const [name, email, role, spec, inst, loc, course] of users) {
    const rows = await q(
      `INSERT INTO users (name, email, password_hash, role, headline, specialization, institution, location, course, verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'verified')
       ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name, email, hash, role, spec ?? course, spec, inst, loc, course],
    );
    ids.push(rows[0].id);
  }

  const [{ n }] = await q<{ n: number }>('SELECT count(*)::int AS n FROM posts');
  if (n === 0) {
    await q(`INSERT INTO posts (author_id, kind, body) VALUES ($1,'update',$2)`, [ids[0], 'Reminder for night-shift teams: document the time of the last troponin draw in the handover note. It saved us an hour yesterday.']);
    await q(`INSERT INTO posts (author_id, kind, body, poll_options) VALUES ($1,'case_poll',$2,$3)`, [
      ids[1],
      '58-year-old with sudden severe chest pain radiating to the back, BP 190/110 in the right arm and 150/90 in the left. What is your first imaging choice?',
      JSON.stringify(['Bedside echo', 'CT angiography', 'Chest X-ray', 'MRI']),
    ]);
    await q(`INSERT INTO posts (author_id, kind, body) VALUES ($1,'update',$2)`, [ids[2], 'Looking for a study group for the FMGE revision block starting next month. Happy to share notes on pharmacology.']);
  }

  const [{ m }] = await q<{ m: number }>('SELECT count(*)::int AS m FROM opportunities');
  if (m === 0) {
    const ops = [
      ['job', 'Consultant Cardiologist', 'Apollo Hospitals', 'Chennai', 'Full-time', 'Senior', 'Lead the non-invasive cardiology unit. Cath lab experience preferred.'],
      ['research', 'Clinical research fellow, diabetes outcomes', 'ICMR', 'Remote', 'Part-time', 'Entry', 'Join a multi-centre study on early intervention in type 2 diabetes. Data collection and literature review.'],
      ['event', 'Emergency Medicine Update 2026', 'IMA Chennai', 'Chennai', null, null, 'One-day CME on trauma triage, airway management and sepsis bundles.'],
      ['course', 'Advanced ECG interpretation', 'MedLearn Academy', 'Online', null, 'Mid', 'Six-week online course with weekly case reviews.'],
    ];
    for (const [kind, title, org, loc, type, level, desc] of ops) {
      await q(
        `INSERT INTO opportunities (kind, title, organization, location, employment_type, experience_level, description, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [kind, title, org, loc, type, level, desc, ids[0]],
      );
    }
  }
  console.log('Seeded. Sign in with asha@demo.medmedia.app / Password123!');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
