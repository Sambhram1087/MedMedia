import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';
import { Wordmark } from '../components/Shell';
import { ErrorNote } from '../components/ui';

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'doctor' | 'student'>('doctor');
  const [f, setF] = useState({ name: '', email: '', password: '', specialization: '', institution: '', course: '', studyYear: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(f.email, f.password);
      else
        await register({
          name: f.name, email: f.email, password: f.password, role, acceptTerms: terms,
          specialization: role === 'doctor' ? f.specialization || undefined : undefined,
          institution: f.institution || undefined,
          course: role === 'student' ? f.course || undefined : undefined,
          studyYear: role === 'student' && f.studyYear ? Number(f.studyYear) : undefined,
        });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-brand">
        <Wordmark />
        <h1>The verified network for people who practise and study medicine.</h1>
        <ul>
          <li>Discuss de-identified cases with colleagues you can trust</li>
          <li>Find jobs, research, courses and events in one place</li>
          <li>Every badge is checked against real credentials</li>
        </ul>
      </section>

      <form className="auth-form" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        {mode === 'register' && (
          <>
            <div className="seg" role="tablist" aria-label="I am a">
              {(['doctor', 'student'] as const).map((r) => (
                <button type="button" key={r} role="tab" aria-selected={role === r} className={role === r ? 'is-active' : ''} onClick={() => setRole(r)}>
                  {r === 'doctor' ? 'Doctor' : 'Student'}
                </button>
              ))}
            </div>
            <label>Full name<input className="field" value={f.name} onChange={set('name')} required autoComplete="name" /></label>
          </>
        )}
        <label>Email<input className="field" type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
        <label>Password<input className="field" type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>

        {mode === 'register' && (
          <>
            {role === 'doctor' ? (
              <label>Specialization<input className="field" value={f.specialization} onChange={set('specialization')} placeholder="e.g. Cardiology" /></label>
            ) : (
              <div className="row">
                <label>Course<input className="field" value={f.course} onChange={set('course')} placeholder="e.g. MBBS" /></label>
                <label className="narrow">Year<input className="field" type="number" min={1} max={8} value={f.studyYear} onChange={set('studyYear')} /></label>
              </div>
            )}
            <label>Hospital or college<input className="field" value={f.institution} onChange={set('institution')} /></label>
            <label className="check">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>I agree to the terms and will never post information that identifies a patient.</span>
            </label>
          </>
        )}

        <ErrorNote error={error} />
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="switch">
          {mode === 'login' ? 'New to MedMedia?' : 'Already have an account?'}{' '}
          <button type="button" className="linkish" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>

        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light, #e2e8f0)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
            Demo Accounts (1-click fill):
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              onClick={() => {
                setMode('login');
                setF((s) => ({ ...s, email: 'asha@demo.medmedia.app', password: 'Password123!' }));
                setError(null);
              }}
            >
              Dr. Asha (Admin)
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              onClick={() => {
                setMode('login');
                setF((s) => ({ ...s, email: 'rohan@demo.medmedia.app', password: 'Password123!' }));
                setError(null);
              }}
            >
              Dr. Rohan
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              onClick={() => {
                setMode('login');
                setF((s) => ({ ...s, email: 'meera@demo.medmedia.app', password: 'Password123!' }));
                setError(null);
              }}
            >
              Meera (Student)
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
