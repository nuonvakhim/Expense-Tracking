import React, { useState } from 'react';
import { Button } from './ui/Button';
import { api, ApiError, type AuthUser } from '../api/client';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

type Mode = 'LOGIN' | 'REGISTER';

/** Mirrors the server's rule in server/src/validation.ts — keep the two in step. */
const MIN_PASSWORD_LENGTH = 6;

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<Mode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === 'REGISTER';

  const switchMode = () => {
    setMode(isRegister ? 'LOGIN' : 'REGISTER');
    setError(null);
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Checked here only to save a round trip and give faster feedback — the
    // server validates independently and is the actual authority.
    if (isRegister) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const user = isRegister
        ? await api.register(email, password)
        : await api.login(email, password);
      onAuthenticated(user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the server. Please try again.',
      );
      // Never leave a password sitting in a form field after a failure.
      setPassword('');
      setConfirm('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyles =
    'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            ExpenseTracker V2
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isRegister ? 'Create an account to get started' : 'Sign in to your records'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <form onSubmit={(e) => { void handleSubmit(e); }} className="p-6 space-y-5">
            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 p-3 rounded-xl text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputStyles}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                name="password"
                // Tells the password manager which flow this is, so it offers to
                // save a new password rather than autofilling the old one.
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputStyles}
                placeholder="••••••••••••"
              />
              {isRegister && (
                <p className="text-[10px] text-slate-400 mt-1">
                  At least {MIN_PASSWORD_LENGTH} characters. Length beats symbols — a short
                  phrase is stronger than a mangled word.
                </p>
              )}
            </div>

            {isRegister && (
              <div>
                <label
                  htmlFor="auth-confirm"
                  className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider"
                >
                  Confirm Password
                </label>
                <input
                  id="auth-confirm"
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputStyles}
                  placeholder="••••••••••••"
                />
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              {isRegister ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={switchMode}
              className="text-sm text-slate-600 hover:text-blue-600 font-medium"
            >
              {isRegister
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
