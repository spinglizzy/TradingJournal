import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { motion } from 'framer-motion'
import { AnimatedGroup } from '../components/ui/AnimatedGroup.jsx'
import { StarsBackground } from '../components/ui/StarsBackground.jsx'
import { ShootingStars } from '../components/ui/ShootingStars.jsx'
import {
  ArrowRight, BarChart2, BookOpen, Brain, LineChart,
  Target, FileText, TrendingUp, Shield, Menu, X, ChevronRight
} from 'lucide-react'
import { cn } from '../lib/utils.js'
import { NeonGradientCard } from '../components/ui/NeonGradientCard.jsx'
import { PulseJournalLogo } from '../components/ui/PulseJournalLogo.jsx'

// App accent: #9aea62 (lime green), hover: #7fd64a, light: #b5f08a

const NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'Analytics', href: '#analytics' },
  { label: 'Psychology', href: '#psychology' },
  { label: 'How It Works', href: '#how-it-works' },
]

const transitionVariants = {
  container: {
    visible: {
      transition: { staggerChildren: 0.08, delayChildren: 0.2 },
    },
  },
  item: {
    hidden: { opacity: 0, filter: 'blur(12px)', y: 14 },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: { type: 'spring', bounce: 0.3, duration: 1.4 },
    },
  },
}

function Logo() {
  return <PulseJournalLogo size="md" />
}

function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed z-20 w-full px-3">
      <nav
        className={cn(
          'mx-auto mt-3 max-w-6xl px-6 transition-all duration-300',
          scrolled
            ? 'bg-gray-950/80 backdrop-blur-xl max-w-4xl rounded-2xl lg:px-5'
            : 'bg-transparent'
        )}
        style={scrolled ? { border: '1px solid color-mix(in srgb, #9aea62 15%, transparent)' } : {}}
      >
        <div className="flex items-center justify-between gap-6 py-3.5 lg:py-4">
          <Link to="/" className="flex-shrink-0">
            <Logo />
          </Link>

          <ul className="hidden lg:flex items-center gap-8 text-sm">
            {NAV_ITEMS.map(item => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="text-gray-400 transition-colors duration-150 hover:text-white"
                  onMouseEnter={e => e.target.style.color = '#b5f08a'}
                  onMouseLeave={e => e.target.style.color = ''}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden lg:flex items-center gap-3">
            <Link
              to="/login"
              className={cn(
                'px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-lg transition-all duration-150',
                scrolled ? 'hidden' : ''
              )}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-150"
              style={{ backgroundColor: '#9aea62', color: '#0a1a0a', border: '1px solid rgba(255,255,255,0.2)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#7fd64a'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#9aea62'}
            >
              {scrolled ? 'Get Started' : 'Sign Up'}
            </Link>
          </div>

          <button
            onClick={() => setOpen(v => !v)}
            className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {open && (
          <div className="lg:hidden border-t border-gray-800 py-4 space-y-4">
            <ul className="space-y-3">
              {NAV_ITEMS.map(item => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
              <Link
                to="/login"
                className="px-4 py-2.5 text-sm font-medium text-center text-gray-300 hover:text-white rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2.5 text-sm font-semibold text-center rounded-lg transition-all"
                style={{ backgroundColor: '#9aea62', color: '#0a1a0a', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                Sign Up Free
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}

const FEATURES = [
  {
    icon: <FileText className="w-5 h-5" style={{ color: '#9aea62' }} />,
    title: 'Trade Log',
    description: 'Log every trade with full detail — entry, exit, size, R-multiple, screenshots, and notes. Never lose track of a trade again.',
  },
  {
    icon: <BarChart2 className="w-5 h-5" style={{ color: '#b5f08a' }} />,
    title: 'Deep Analytics',
    description: 'Slice your performance by ticker, strategy, session, day of week, and more. Find exactly where your edge lives.',
  },
  {
    icon: <Brain className="w-5 h-5" style={{ color: '#9aea62' }} />,
    title: 'Psychology Tracker',
    description: 'Track emotions, tilt score, rule violations, and mental state across sessions. Understand how psychology affects your P&L.',
  },
  {
    icon: <BookOpen className="w-5 h-5" style={{ color: '#b5f08a' }} />,
    title: 'Trading Playbook',
    description: 'Document your setups, entry rules, and risk management. Keep your strategy sharp and consistent.',
  },
  {
    icon: <LineChart className="w-5 h-5" style={{ color: '#9aea62' }} />,
    title: 'Performance Journal',
    description: 'Write daily notes, review your sessions, and track growth over time. Build the habit of self-review.',
  },
  {
    icon: <Target className="w-5 h-5" style={{ color: '#b5f08a' }} />,
    title: 'Goals & Targets',
    description: 'Set monthly profit targets, win rate goals, and discipline metrics. Track progress and stay accountable.',
  },
]


const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Log Your Trades',
    description: 'Enter trades manually or import from your broker via CSV. Capture every detail that matters.',
  },
  {
    step: '02',
    title: 'Review Your Analytics',
    description: 'The dashboard automatically builds your performance picture — P&L curves, win rates, best setups, and more.',
  },
  {
    step: '03',
    title: 'Track Your Psychology',
    description: 'Rate your mindset after each session. Identify emotional patterns that are costing you money.',
  },
  {
    step: '04',
    title: 'Refine Your Edge',
    description: 'Use the data to cut losing setups, double down on winners, and evolve your playbook over time.',
  },
]

function AppPreview() {
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
        <div
          className="w-5 h-5 rounded flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, #9aea62 20%, transparent)', border: '1px solid color-mix(in srgb, #9aea62 30%, transparent)' }}
        >
          <TrendingUp className="w-3 h-3" style={{ color: '#9aea62' }} />
        </div>
        <span className="text-xs font-semibold text-gray-300">PulseJournal</span>
        <div className="ml-auto flex gap-2">
          {['Dashboard', 'Trades', 'Analytics', 'Psychology'].map(t => (
            <span key={t} className="text-xs text-gray-600 hidden sm:block">{t}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Total P&L', value: '+$4,820', accent: true },
          { label: 'Win Rate', value: '63.2%', accent: true },
          { label: 'Profit Factor', value: '2.14', accent: true },
          { label: 'Total Trades', value: '87', accent: false },
        ].map(card => (
          <div key={card.label} className="bg-gray-950 rounded-xl p-3 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div
              className="text-sm font-bold font-mono"
              style={{ color: card.accent ? '#9aea62' : '#d1d5db' }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-950 rounded-xl border border-gray-800 p-3 mb-3">
        <div className="text-xs text-gray-500 mb-2">Cumulative P&L</div>
        <div className="flex items-end gap-1 h-14">
          {[20, 35, 28, 45, 38, 52, 48, 65, 58, 72, 68, 84].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${h}%`,
                background: 'linear-gradient(to top, color-mix(in srgb, #9aea62 60%, transparent), color-mix(in srgb, #9aea62 15%, transparent))'
              }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {[
          { ticker: 'NQ', pnl: '+$320', dir: 'LONG', pos: true },
          { ticker: 'ES', pnl: '-$85', dir: 'SHORT', pos: false },
          { ticker: 'TSLA', pnl: '+$215', dir: 'LONG', pos: true },
        ].map((row, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-950 rounded-lg px-3 py-2 border border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">{row.ticker}</span>
              <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{row.dir}</span>
            </div>
            <span
              className="text-xs font-mono font-semibold"
              style={{ color: row.pos ? '#9aea62' : '#f87171' }}
            >
              {row.pnl}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Reusable tilt card — wraps any screenshot with mouse-tracking 3D tilt
function TiltImage({ src, alt, restRx = 6, restRy = -2, wrapperClassName = '', fadeBottom = false }) {
  const containerRef = useRef(null)
  const [tilt, setTilt] = useState({ rx: restRx, ry: restRy })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = useCallback((e) => {
    const el = containerRef.current
    if (!el) return
    const { left, top, width, height } = el.getBoundingClientRect()
    const dx = (e.clientX - (left + width / 2))  / (width / 2)
    const dy = (e.clientY - (top  + height / 2)) / (height / 2)
    setTilt({ rx: restRx - dy * 4, ry: restRy + dx * 8 })
  }, [restRx, restRy])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    setTilt({ rx: restRx, ry: restRy })
  }, [restRx, restRy])

  return (
    <div className={`relative ${wrapperClassName}`} style={{ perspective: '1200px' }}>
      {fadeBottom && (
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-gray-950 to-transparent z-10 pointer-events-none rounded-b-2xl" />
      )}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        className="rounded-2xl shadow-2xl overflow-hidden"
        style={{
          border: '1px solid color-mix(in srgb, #9aea62 20%, transparent)',
          boxShadow: isHovered
            ? '0 50px 100px rgba(0,0,0,0.75), 0 0 0 1px color-mix(in srgb, #9aea62 25%, transparent)'
            : '0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px color-mix(in srgb, #9aea62 15%, transparent)',
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${isHovered ? 1.02 : 1.0})`,
          transformStyle: 'preserve-3d',
          transformOrigin: 'center center',
          transition: isHovered
            ? 'transform 0.1s ease-out, box-shadow 0.2s ease-out'
            : 'transform 0.6s ease-out, box-shadow 0.4s ease-out',
          willChange: 'transform',
        }}
      >
        <img src={src} alt={alt} className="w-full block" draggable={false} />
      </div>
    </div>
  )
}

function DashboardPreviewCard() {
  return (
    <TiltImage
      src="/dashboard.png"
      alt="PulseJournal Dashboard"
      restRx={6}
      restRy={-2}
      wrapperClassName="max-w-5xl mx-auto"
      fadeBottom
    />
  )
}

export default function Landing() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ backgroundColor: '#030712' }}>
      {/* Stars */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
        <StarsBackground starDensity={0.00015} minTwinkleSpeed={0.6} maxTwinkleSpeed={1.2} starColor="154, 234, 98" />
        <ShootingStars starColor="#9aea62" trailColor="#4ade80" minSpeed={25} maxSpeed={50} minDelay={400} maxDelay={1200} starWidth={28} starHeight={2} />
        <ShootingStars starColor="#b5f08a" trailColor="#9aea62" minSpeed={20} maxSpeed={40} minDelay={600} maxDelay={1600} starWidth={22} starHeight={2} />
        <ShootingStars starColor="#7fd64a" trailColor="#22c55e" minSpeed={15} maxSpeed={35} minDelay={800} maxDelay={2000} starWidth={35} starHeight={3} />
      </div>

      {/* Subtle atmospheric glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-3xl pointer-events-none"
        style={{ zIndex: 0, background: 'radial-gradient(ellipse, color-mix(in srgb, #9aea62 4%, transparent), transparent 70%)' }}
      />

      <div className="relative" style={{ zIndex: 1 }}>
        <Header />

        {/* Hero */}
        <section className="relative pt-28 pb-20 md:pt-40 md:pb-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center max-w-4xl mx-auto">
              <AnimatedGroup variants={transitionVariants}>
                {/* Badge */}
                <div
                  className="inline-flex items-center gap-3 bg-gray-900/80 rounded-full px-4 py-1.5 text-sm mb-8 shadow-sm"
                  style={{ border: '1px solid color-mix(in srgb, #9aea62 20%, transparent)' }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: '#9aea62' }}
                  />
                  <span className="text-gray-300">Built for serious traders</span>
                  <span className="text-gray-700">|</span>
                  <a
                    href="#features"
                    className="flex items-center gap-1 transition-colors"
                    style={{ color: '#9aea62' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#b5f08a'}
                    onMouseLeave={e => e.currentTarget.style.color = '#9aea62'}
                  >
                    See features <ArrowRight className="w-3 h-3" />
                  </a>
                </div>

                {/* Headline */}
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.08] mb-6">
                  Track Every Trade.{' '}
                  <span
                    className="bg-clip-text text-transparent"
                    style={{ backgroundImage: 'linear-gradient(to right, #9aea62, #b5f08a, #9aea62)' }}
                  >
                    Master Your Edge.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
                  A complete trading journal with psychology tracking, deep analytics, and performance insights.
                  Understand your edge — and protect it.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    to="/signup"
                    className="group flex items-center gap-2 px-6 py-3 font-semibold rounded-xl transition-all duration-200"
                    style={{ backgroundColor: '#9aea62', color: '#0a1a0a', boxShadow: '0 4px 20px color-mix(in srgb, #9aea62 30%, transparent)', border: '1px solid rgba(255,255,255,0.2)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#7fd64a'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#9aea62'}
                  >
                    Start
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <a
                    href="#features"
                    className="flex items-center gap-2 px-6 py-3 text-gray-300 hover:text-white font-medium rounded-xl transition-all duration-200"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    See How It Works
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </AnimatedGroup>
            </div>

            {/* App preview */}
            <AnimatedGroup
              variants={{
                container: { visible: { transition: { delayChildren: 0.6 } } },
                item: {
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0.2, duration: 1.2 } },
                },
              }}
              className="mt-16 md:mt-20 relative"
            >
              <DashboardPreviewCard />
            </AnimatedGroup>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 md:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9aea62' }}>Everything you need</div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Your complete trading toolkit</h2>
              <p className="text-gray-400 text-lg">
                Every feature built around one goal: turning your trading data into actionable insights.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ delay: i * 0.07, duration: 0.5 }}
                  className="hover:scale-[1.02] transition-transform duration-200"
                >
                  <NeonGradientCard
                    borderSize={1.5}
                    borderRadius={20}
                    neonColors={{ firstColor: '#9aea62', secondColor: '#00d4ff' }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                      style={{
                        backgroundColor: 'color-mix(in srgb, #9aea62 10%, #0d1117)',
                        border: '1px solid color-mix(in srgb, #9aea62 25%, transparent)',
                      }}
                    >
                      {f.icon}
                    </div>
                    <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: '#8b9db5' }}>{f.description}</p>
                  </NeonGradientCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Analytics highlight */}
        <section
          id="analytics"
          className="py-24"
          style={{ borderTop: '1px solid color-mix(in srgb, #9aea62 8%, transparent)', borderBottom: '1px solid color-mix(in srgb, #9aea62 8%, transparent)', backgroundColor: 'color-mix(in srgb, #9aea62 2%, #030712)' }}
        >
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#b5f08a' }}>Deep Analytics</div>
                <h2 className="text-4xl font-bold text-white mb-5 leading-tight">
                  Stop guessing.<br />
                  <span className="text-gray-400">Start knowing.</span>
                </h2>
                <p className="text-gray-400 leading-relaxed mb-8">
                  Slice your performance any way you want — by ticker, setup, strategy, day of week, session hour, or timeframe.
                  Find the patterns hidden in your trade history.
                </p>
                <ul className="space-y-3">
                  {[
                    'P&L curves and equity tracking',
                    'Win rate by time, ticker & setup',
                    'Profit factor and R-multiple analysis',
                    'Custom report builder with saved presets',
                    'Deep dive into your best and worst setups',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-sm text-gray-300">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'color-mix(in srgb, #9aea62 15%, transparent)', border: '1px solid color-mix(in srgb, #9aea62 30%, transparent)' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#9aea62' }} />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <TiltImage src="/analytics.png" alt="PulseJournal Analytics" restRx={2} restRy={3} />
            </div>
          </div>
        </section>

        {/* Psychology highlight */}
        <section id="psychology" className="py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1">
                <TiltImage src="/psychology.png" alt="PulseJournal Psychology" restRx={2} restRy={-3} />
              </div>

              <div className="order-1 lg:order-2">
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#b5f08a' }}>Psychology Tracking</div>
                <h2 className="text-4xl font-bold text-white mb-5 leading-tight">
                  Your mindset is<br />
                  <span className="text-gray-400">part of your edge.</span>
                </h2>
                <p className="text-gray-400 leading-relaxed mb-8">
                  Most traders ignore psychology until it blows up their account.
                  PulseJournal tracks your emotional state, rule violations, and tilt score so you can catch patterns before they become problems.
                </p>
                <ul className="space-y-3">
                  {[
                    'Session tilt score and emotional state',
                    'Custom emotion and mistake tags',
                    'Rule adherence tracking over time',
                    'Correlation between mindset and P&L',
                    'Weekly psychology review summaries',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-sm text-gray-300">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'color-mix(in srgb, #9aea62 15%, transparent)', border: '1px solid color-mix(in srgb, #9aea62 30%, transparent)' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#b5f08a' }} />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="py-24"
          style={{ borderTop: '1px solid color-mix(in srgb, #9aea62 8%, transparent)', borderBottom: '1px solid color-mix(in srgb, #9aea62 8%, transparent)', backgroundColor: 'color-mix(in srgb, #9aea62 2%, #030712)' }}
        >
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9aea62' }}>Simple workflow</div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">How it works</h2>
              <p className="text-gray-400 text-lg">Four steps from raw trades to real insights.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {HOW_IT_WORKS.map((step, i) => (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="relative"
                >
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div
                      className="hidden lg:block absolute top-6 left-full w-full h-px z-0"
                      style={{ background: 'linear-gradient(to right, color-mix(in srgb, #9aea62 20%, transparent), transparent)' }}
                    />
                  )}
                  <div className="relative z-10">
                    <NeonGradientCard
                      borderSize={1.5}
                      borderRadius={20}
                      neonColors={{ firstColor: '#9aea62', secondColor: '#00d4ff' }}
                    >
                      <div className="text-4xl font-bold mb-3" style={{ color: 'color-mix(in srgb, #9aea62 30%, transparent)' }}>{step.step}</div>
                      <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#8b9db5' }}>{step.description}</p>
                    </NeonGradientCard>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 md:py-32">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div
                className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none"
              >
                <div
                  className="w-96 h-40 rounded-full blur-3xl"
                  style={{ background: 'color-mix(in srgb, #9aea62 8%, transparent)' }}
                />
              </div>

              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-8"
                style={{ backgroundColor: 'color-mix(in srgb, #9aea62 8%, transparent)', border: '1px solid color-mix(in srgb, #9aea62 20%, transparent)', color: '#9aea62' }}
              >
                <Shield className="w-3.5 h-3.5" />
                Your data stays yours
              </div>

              <h2 className="text-4xl md:text-5xl font-bold text-white mb-5">
                Ready to trade with<br />
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(to right, #9aea62, #b5f08a)' }}
                >
                  full clarity?
                </span>
              </h2>
              <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
                Join traders who track their edge, manage their psychology, and build consistent performance over time.
              </p>

              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 px-8 py-3.5 font-semibold rounded-xl transition-all duration-200 text-base"
                style={{ backgroundColor: '#9aea62', color: '#0a1a0a', boxShadow: '0 4px 24px color-mix(in srgb, #9aea62 25%, transparent)', border: '1px solid rgba(255,255,255,0.2)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#7fd64a'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#9aea62'}
              >
                Get Started
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-10" style={{ borderTop: '1px solid color-mix(in srgb, #9aea62 10%, transparent)' }}>
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
              <Logo />
              <div className="flex gap-6 text-xs text-gray-600">
                {['Features', 'Analytics', 'Psychology'].map(label => (
                  <a
                    key={label}
                    href={`#${label.toLowerCase()}`}
                    className="transition-colors hover:text-gray-400"
                    onMouseEnter={e => e.target.style.color = '#9aea62'}
                    onMouseLeave={e => e.target.style.color = ''}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-900 text-xs text-gray-600">
              <p>© {new Date().getFullYear()} PulseJournal. Built for traders.</p>
              <div className="flex gap-6">
                <Link
                  to="/privacy"
                  className="transition-colors hover:text-gray-400"
                  onMouseEnter={e => e.target.style.color = '#9aea62'}
                  onMouseLeave={e => e.target.style.color = ''}
                >
                  Privacy Policy
                </Link>
                <Link
                  to="/terms"
                  className="transition-colors hover:text-gray-400"
                  onMouseEnter={e => e.target.style.color = '#9aea62'}
                  onMouseLeave={e => e.target.style.color = ''}
                >
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
