// A password <input> with a show/hide toggle and an optional inline strength meter. Shared by the
// customer auth forms (CSS-class styled — pass no inputStyle, it inherits .ca-signin input) and the
// staff sign-in (inline-styled — pass inputStyle={S.input}). The toggle and meter are inline-styled so
// they look right in both. box-sizing:border-box is global (site.css), so width:100% + paddingRight is safe.
import React, { useId, useState } from 'react';
import { scorePassword } from './passwordStrength.mjs';

const TOGGLE = {
  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
  background: 'none', border: 0, color: 'var(--gs-text-faint,#8a8f8a)', font: 'inherit',
  fontSize: '.7rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
  cursor: 'pointer', padding: '4px 6px', lineHeight: 1,
};
const BAR_COLOR = { 1: '#ff6b6b', 2: '#ffb020', 3: '#c8ff00', 4: '#9be36b' };

function StrengthMeter({ value }) {
  const { score, label, hint } = scorePassword(value);
  if (!value) return null;
  return (
    <div aria-live="polite" style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= score ? BAR_COLOR[score] : 'rgba(255,255,255,.13)', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ marginTop: 5, fontSize: '.72rem', fontWeight: 700, color: 'var(--gs-text-faint,#8a8f8a)' }}>
        Password strength: <span style={{ color: BAR_COLOR[score] }}>{label}</span>{hint ? <span style={{ fontWeight: 600 }}> · {hint}</span> : null}
      </div>
    </div>
  );
}

export default function PasswordInput({
  id, value, onChange, autoComplete = 'new-password', placeholder, required = false,
  minLength, inputStyle, showStrength = false, ariaInvalid, ariaDescribedby,
}) {
  const [show, setShow] = useState(false);
  const reactId = useId();
  const inputId = id || reactId;
  return (
    <>
      <span style={{ position: 'relative', display: 'block' }}>
        <input
          id={inputId} type={show ? 'text' : 'password'} value={value} onChange={onChange}
          autoComplete={autoComplete} placeholder={placeholder} required={required} minLength={minLength}
          aria-invalid={ariaInvalid} aria-describedby={ariaDescribedby}
          style={{ ...(inputStyle || {}), width: '100%', boxSizing: 'border-box', paddingRight: '3.4em' }}
        />
        <button type="button" onClick={() => setShow((v) => !v)} style={TOGGLE}
          aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} aria-controls={inputId} tabIndex={-1}>
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
      {showStrength ? <StrengthMeter value={value} /> : null}
    </>
  );
}
