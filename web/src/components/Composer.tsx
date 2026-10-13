import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useRef, useState } from 'react';
import { api, uploadFile } from '../api';
import { useAuth } from '../auth';
import { Avatar, ErrorNote, Icon } from './ui';

type Kind = 'update' | 'case_poll' | 'link';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'update', label: 'Update' },
  { id: 'case_poll', label: 'Case poll' },
  { id: 'link', label: 'Link' },
];

export function Composer() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>('update');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [image, setImage] = useState<File | null>(null);
  const [noPatientInfo, setNoPatientInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!user) return null;

  const needsPrivacy = kind === 'case_poll' || !!image;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const imageKey = image ? (await uploadFile(image, 'post')).key : undefined;
      await api.post('/api/posts', {
        kind,
        body,
        imageKey,
        linkUrl: kind === 'link' ? linkUrl : undefined,
        pollOptions: kind === 'case_poll' ? options.map((o) => o.trim()).filter(Boolean) : undefined,
        noPatientInfo,
      });
      setBody(''); setLinkUrl(''); setOptions(['', '']); setImage(null); setNoPatientInfo(false); setKind('update');
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['posts'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card composer" onSubmit={submit}>
      <div className="composer-top">
        <Avatar author={user} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === 'case_poll' ? 'Describe the case (age, presentation, findings). No names or identifiers.' : 'Share a clinical pearl, a question, or an update'}
          rows={3}
          maxLength={3000}
          aria-label="Post text"
        />
      </div>

      <div className="seg" role="tablist" aria-label="Post type">
        {KINDS.map((k) => (
          <button type="button" key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? 'is-active' : ''} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      {kind === 'link' && <input className="field" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" aria-label="Link" required />}
      {kind === 'case_poll' && (
        <div className="poll-edit">
          {options.map((o, i) => (
            <input key={i} className="field" value={o} maxLength={120} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`}
              onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          {options.length < 4 && <button type="button" className="btn btn-quiet" onClick={() => setOptions((o) => [...o, ''])}><Icon name="plus" size={16} /> Add option</button>}
        </div>
      )}

      {image && <p className="attached"><Icon name="image" size={16} /> {image.name} <button type="button" className="linkish" onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ''; }}>Remove</button></p>}

      {needsPrivacy && (
        <label className="check">
          <input type="checkbox" checked={noPatientInfo} onChange={(e) => setNoPatientInfo(e.target.checked)} />
          <span>I confirm nothing here could identify a patient (names, faces, record numbers, dates of birth).</span>
        </label>
      )}

      <ErrorNote error={error} />
      <div className="composer-bar">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}><Icon name="image" size={18} /> Photo</button>
        <button className="btn btn-primary" disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post'}</button>
      </div>
    </form>
  );
}
