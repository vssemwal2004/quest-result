import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react'
import { api } from '@/lib/api'
import { setToken, useToken } from '@/lib/auth'
import { QuestLockup } from '../brand/QuestLockup'
import { RobotMark } from '../brand/RobotMark'
import { errorMessage } from '../lib/errors'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { Spinner } from '../ui/Spinner'

const TRACES = [
  'M-20 180 H260 L320 240 H560 L600 200 H780',
  'M1460 120 H1180 L1120 180 H900 L860 140 H700',
  'M-20 700 H180 L240 640 H460 L520 700 H720',
  'M1460 760 H1240 L1180 700 H980 L940 740 H760',
  'M300 920 V820 L360 760 V600',
  'M1140 -20 V90 L1080 150 V300',
]

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  size: 2 + (i % 3),
  duration: 11 + ((i * 7) % 9),
  delay: -((i * 13) % 17),
}))

function CircuitBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {TRACES.map((d, i) => (
            <g key={i}>
              <path d={d} stroke="rgba(56,225,255,.16)" strokeWidth="2" />
              <path
                d={d}
                pathLength={1000}
                stroke="#38e1ff"
                strokeWidth="2.5"
                className="aq-trace-pulse"
                style={{ animationDelay: `${-i * 1.3}s`, filter: 'drop-shadow(0 0 6px #38e1ff)' }}
              />
            </g>
          ))}
        </g>
        <g fill="#38e1ff" opacity=".55">
          {[
            [780, 200],
            [700, 140],
            [720, 700],
            [760, 740],
            [360, 600],
            [1080, 300],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" />
          ))}
        </g>
      </svg>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="aq-particle"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-navy-950 to-transparent" />
    </div>
  )
}

export function LoginPage() {
  useDocumentTitle('Sign in')
  const token = useToken()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: Location } | null)?.from
  const target = from && from.pathname.startsWith('/admin') && from.pathname !== '/admin/login' ? from.pathname + from.search : '/admin'

  if (token && !busy) return <Navigate to={target} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.login(email.trim(), password)
      setToken(res.token)
      navigate(target, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-quest-gradient">
      <CircuitBackdrop />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center lg:items-start lg:text-left"
        >
          <RobotMark className="mb-4 hidden h-28 w-28 animate-floaty drop-shadow-[0_0_30px_rgba(56,225,255,.45)] lg:block" />
          <QuestLockup size="lg" />
          <span className="mt-6 inline-flex rounded-full bg-white px-5 py-1.5 font-display text-sm font-extrabold uppercase tracking-[0.18em] text-navy-900 shadow-[0_6px_30px_rgba(255,255,255,.25)]">
            Results Console
          </span>
          <div className="relative mt-6 hidden lg:block">
            <p className="font-script text-4xl leading-tight text-gold-300 drop-shadow">Reveal every winner,</p>
            <p className="font-script text-4xl leading-tight text-gold-300 drop-shadow">one press at a time.</p>
            <svg viewBox="0 0 300 24" className="mt-1 h-5 w-72" aria-hidden>
              <path d="M4 18 C 80 4, 200 2, 296 12" stroke="#ffd23f" strokeWidth="4" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md justify-self-center lg:justify-self-end"
        >
          <form
            onSubmit={submit}
            noValidate
            className="glass-strong relative overflow-hidden rounded-3xl p-7 sm:p-9"
            aria-labelledby="login-title"
          >
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-electric/20 blur-3xl" aria-hidden />
            <h1 id="login-title" className="font-display text-2xl font-extrabold tracking-tight text-white">
              Admin sign in
            </h1>
            <p className="mt-1 text-sm text-white/60">Manage winners, prize tiers and the live reveal.</p>

            <div className="mt-7 space-y-4">
              <div>
                <label htmlFor="login-email" className="label">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    className="input pl-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="login-password" className="label">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="input pl-10 pr-11"
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <motion.p
                id="login-error"
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {error}
              </motion.p>
            )}

            <button type="submit" className="btn-gold mt-7 w-full py-3.5 text-base" disabled={busy}>
              {busy ? <Spinner className="h-5 w-5" label="Signing in" /> : <LogIn className="h-5 w-5" aria-hidden />}
              {busy ? 'Signing in…' : 'Sign in'}
              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" aria-hidden />
            </button>
            <p className="mt-5 text-center text-xs text-white/40">Session expires after 12 hours. Sign out on shared machines.</p>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
