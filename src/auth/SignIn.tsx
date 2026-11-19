import { useEffect, useRef, useState, type FormEvent } from 'react';
import { APP_NAME } from '../lib/config';
import { supabase } from '../lib/supabase';
import './SignIn.css';

const NEUTRAL = 'If this email has access, a code is on its way.';
const BAD_CODE = "That code didn't work. Check it or send a new one.";
const RESEND_SECONDS = 60;

type Step = 'email' | 'code';

export default function SignIn() {
  const [step, setStep] = useState<Step>('email');
  const [emailInput, setEmailInput] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const focusEmail = useRef(false);

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
    else if (focusEmail.current) {
      focusEmail.current = false;
      emailRef.current?.focus();
    }
  }, [step]);

  // Always returns a calm message. The server's own text is never shown, so
  // "not invited" looks the same as "sent".
  async function requestCode(address: string) {
    setBusy(true);
    // Every outcome, including a 429, gets the same text so replies cannot hint
    // which emails have access. The 60 s resend lock covers the wait.
    try {
      await supabase.auth.signInWithOtp({
        email: address,
        options: { data: { time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
      });
    } catch {
      // Network trouble: same neutral message.
    }
    setBusy(false);
    setMessage(NEUTRAL);
    setNow(Date.now());
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setStep('code');
  }

  function onEmailSubmit(e: FormEvent) {
    e.preventDefault();
    const address = emailInput.trim().toLowerCase();
    if (!address || busy) return;
    setEmail(address);
    setCode('');
    void requestCode(address);
  }

  async function onCodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    let failed = false;
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      failed = !!error;
    } catch {
      failed = true;
    }
    setBusy(false);
    // On success the session hook swaps this screen out.
    if (failed) setMessage(BAD_CODE);
  }

  function useDifferentEmail() {
    focusEmail.current = true;
    setStep('email');
    setCode('');
    setMessage('');
    setResendAt(0);
  }

  return (
    <main className="signin">
      <h1>{APP_NAME}</h1>
      {step === 'email' ? (
        <form onSubmit={onEmailSubmit} className="signin-card">
          <p className="signin-hint">Enter your email and we will send you a 6-digit code.</p>
          <label htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={onCodeSubmit} className="signin-card">
          <p className="signin-hint">Enter the 6-digit code from your email.</p>
          <label htmlFor="signin-code">6-digit code</label>
          <input
            id="signin-code"
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onPaste={(e) => {
              // maxLength would cut "123 456" to "123 45" before onChange runs.
              e.preventDefault();
              setCode(e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6));
            }}
          />
          <button type="submit" disabled={busy}>
            Sign in
          </button>
          <button
            type="button"
            className="signin-link"
            disabled={busy || secondsLeft > 0}
            onClick={() => void requestCode(email)}
          >
            {secondsLeft > 0 ? `Send a new code (${secondsLeft}s)` : 'Send a new code'}
          </button>
          <button type="button" className="signin-link" disabled={busy} onClick={useDifferentEmail}>
            Use a different email
          </button>
        </form>
      )}
      <p role="status" aria-live="polite" className="signin-message">
        {message}
      </p>
    </main>
  );
}
