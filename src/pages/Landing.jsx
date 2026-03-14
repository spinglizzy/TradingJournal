import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AnimatedGroup } from '../components/ui/AnimatedGroup.jsx'
import { StarsBackground } from '../components/ui/StarsBackground.jsx'
import {
  ArrowRight, BarChart2, BookOpen, Brain, LineChart,
  Target, FileText, TrendingUp, Shield, Menu, X, ChevronRight
} from 'lucide-react'
import { cn } from '../lib/utils.js'

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
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
        <TrendingUp className="w-4 h-4 text-white" />
      </div>
      <span className="font-bold text-white text-base tracking-tight">TradeJournal</span>
    </div>
  )
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
            ? 'bg-gray-950/80 backdrop-blur-xl max-w-4xl rounded-2xl border border-gray-800/60 lg:px-5'
            : 'bg-transparent'
        )}
      >
        <div className="flex items-center justify-between gap-6 py-3.5 lg:py-4">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <Logo />
          </Link>

          {/* Desktop nav */}
          <ul className="hidden lg:flex items-center gap-8 text-sm">
            {NAV_ITEMS.map(item => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="text-gray-400 hover:text-white transition-colors duration-150"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              to="/dashboard"
              className={cn(
                'px-4 py-2 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-all duration-150',
                scrolled ? 'hidden' : ''
              )}
            >
              Login
            </Link>
            <Link
              to="/dashboard"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all duration-150"
            >
              {scrolled ? 'Get Started' : 'Sign Up'}
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setOpen(v => !v)}
            className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
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
                to="/dashboard"
                className="px-4 py-2.5 text-sm font-medium text-center text-gray-300 border border-gray-700 rounded-lg hover:border-gray-600 hover:text-white transition-all"
              >
                Login
              </Link>
              <Link
                to="/dashboard"
                className="px-4 py-2.5 text-sm font-medium text-center text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all"
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
    icon: <FileText className="w-5 h-5 text-indigo-400" />,
    title: 'Trade Log',
    description: 'Log every trade with full detail — entry, exit, size, R-multiple, screenshots, and notes. Never lose track of a trade again.',
    color: 'from-indigo-500/10 to-indigo-600/5',
    border: 'border-indigo-500/20',
  },
  {
    icon: <BarChart2 className="w-5 h-5 text-violet-400" />,
    title: 'Deep Analytics',
    description: 'Slice your performance by ticker, strategy, session, day of week, and more. Find exactly where your edge lives.',
    color: 'from-violet-500/10 to-violet-600/5',
    border: 'border-violet-500/20',
  },
  {
    icon: <Brain className="w-5 h-5 text-pink-400" />,
    title: 'Psychology Tracker',
    description: 'Track emotions, tilt score, rule violations, and mental state across sessions. Understand how psychology affects your P&L.',
    color: 'from-pink-500/10 to-pink-600/5',
    border: 'border-pink-500/20',
  },
  {
    icon: <BookOpen className="w-5 h-5 text-emerald-400" />,
    title: 'Trading Playbook',
    description: 'Document your setups, entry rules, and risk management. Keep your strategy sharp and consistent.',
    color: 'from-emerald-500/10 to-emerald-600/5',
    border: 'border-emerald-500/20',
  },
  {
    icon: <LineChart className="w-5 h-5 text-sky-400" />,
    title: 'Performance Journal',
    description: 'Write daily notes, review your sessions, and track growth over time. Build the habit of self-review.',
    color: 'from-sky-500/10 to-sky-600/5',
    border: 'border-sky-500/20',
  },
  {
    icon: <Target className="w-5 h-5 text-amber-400" />,
    title: 'Goals & Targets',
    description: 'Set monthly profit targets, win rate goals, and discipline metrics. Track progress and stay accountable.',
    color: 'from-amber-500/10 to-amber-600/5',
    border: 'border-amber-500/20',
  },
]

const STATS = [
  { value: '15+', label: 'Dashboard Widgets' },
  { value: '6', label: 'Analytics Tabs' },
  { value: '100%', label: 'Your Data' },
  { value: '0', label: 'Hidden Fees' },
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

// Mock dashboard preview — styled cards that look like the app
function AppPreview() {
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 shadow-2xl shadow-black/60">
      {/* Fake top nav */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
        <div className="w-5 h-5 rounded bg-indigo-600/80 flex items-center justify-center">
          <TrendingUp className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-gray-300">TradeJournal</span>
        <div className="ml-auto flex gap-2">
          {['Dashboard', 'Trades', 'Analytics', 'Psychology'].map(t => (
            <span key={t} className="text-xs text-gray-600 hidden sm:block">{t}</span>
          ))}
        </div>
      </div>

      {/* Fake stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Total P&L', value: '+$4,820', color: 'text-emerald-400' },
          { label: 'Win Rate', value: '63.2%', color: 'text-emerald-400' },
          { label: 'Profit Factor', value: '2.14', color: 'text-emerald-400' },
          { label: 'Total Trades', value: '87', color: 'text-gray-300' },
        ].map(card => (
          <div key={card.label} className="bg-gray-950 rounded-xl p-3 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className={`text-sm font-bold font-mono ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Fake chart area */}
      <div className="bg-gray-950 rounded-xl border border-gray-800 p-3 mb-3">
        <div className="text-xs text-gray-500 mb-2">Cumulative P&L</div>
        <div className="flex items-end gap-1 h-14">
          {[20, 35, 28, 45, 38, 52, 48, 65, 58, 72, 68, 84].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-indigo-600/60 to-indigo-500/30"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* Fake trade rows */}
      <div className="space-y-1.5">
        {[
          { ticker: 'NQ', pnl: '+$320', wr: 'LONG', color: 'text-emerald-400' },
          { ticker: 'ES', pnl: '-$85', wr: 'SHORT', color: 'text-red-400' },
          { ticker: 'TSLA', pnl: '+$215', wr: 'LONG', color: 'text-emerald-400' },
        ].map((row, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-950 rounded-lg px-3 py-2 border border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">{row.ticker}</span>
              <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{row.wr}</span>
            </div>
            <span className={`text-xs font-mono font-semibold ${row.color}`}>{row.pnl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ backgroundColor: 'var(--color-base, #030712)' }}>
      {/* Stars background — matches Layout.jsx exactly */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
        <StarsBackground starDensity={0.00015} minTwinkleSpeed={0.6} maxTwinkleSpeed={1.2} />
      </div>

      {/* All page content above the stars */}
      <div className="relative" style={{ zIndex: 1 }}>
      <Header />

      {/* Hero */}
      <section className="relative pt-28 pb-20 md:pt-40 md:pb-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-4xl mx-auto">
            <AnimatedGroup variants={transitionVariants}>
              {/* Badge */}
              <div className="inline-flex items-center gap-3 bg-gray-900 border border-gray-700/60 rounded-full px-4 py-1.5 text-sm mb-8 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-gray-300">Built for serious traders</span>
                <span className="text-gray-700">|</span>
                <a href="#features" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                  See features <ArrowRight className="w-3 h-3" />
                </a>
              </div>

              {/* Headline */}
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.08] mb-6">
                Track Every Trade.{' '}
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
                  Master Your Edge.
                </span>
              </h1>

              {/* Subheadline */}
              <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
                A complete trading journal with psychology tracking, deep analytics, and performance insights.
                Understand your edge — and protect it.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/dashboard"
                  className="group flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/35"
                >
                  Start for Free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <a
                  href="#features"
                  className="flex items-center gap-2 px-6 py-3 text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 font-medium rounded-xl transition-all duration-200"
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
            <div className="relative max-w-5xl mx-auto">
              {/* Fade overlay at bottom */}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-gray-950 to-transparent z-10 pointer-events-none rounded-b-2xl" />
              <div className="border border-gray-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                <AppPreview />
              </div>
            </div>
          </AnimatedGroup>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-gray-800/50 bg-gray-900/30 py-8">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {STATS.map(s => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
                <div className="text-sm text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">Everything you need</div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Your complete trading toolkit</h2>
            <p className="text-gray-400 text-lg">
              Every feature built around one goal: turning your trading data into actionable insights.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.07, duration: 0.5 }}
                className={`bg-gradient-to-br ${f.color} border ${f.border} rounded-2xl p-6 hover:scale-[1.02] transition-transform duration-200`}
              >
                <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Analytics highlight */}
      <section id="analytics" className="py-24 bg-gray-900/30 border-y border-gray-800/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-3">Deep Analytics</div>
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
                  'CSV export for any date range',
                ].map(item => (
                  <li key={item} className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-4 h-4 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mini analytics preview */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl">
              <div className="text-xs text-gray-500 mb-3 font-medium">Win Rate by Day of Week</div>
              <div className="space-y-2">
                {[
                  { day: 'Monday', wr: 58, pnl: '+$820' },
                  { day: 'Tuesday', wr: 71, pnl: '+$1,240' },
                  { day: 'Wednesday', wr: 44, pnl: '-$310' },
                  { day: 'Thursday', wr: 65, pnl: '+$950' },
                  { day: 'Friday', wr: 52, pnl: '+$120' },
                ].map(row => (
                  <div key={row.day} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-20 flex-shrink-0">{row.day}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${row.wr >= 50 ? 'bg-indigo-500' : 'bg-red-500/70'}`}
                        style={{ width: `${row.wr}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-10 text-right font-mono">{row.wr}%</span>
                    <span className={`text-xs font-mono font-semibold w-16 text-right ${row.pnl.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.pnl}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500">Best day: Tuesday</span>
                <span className="text-xs text-indigo-400 font-medium">71% win rate</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Psychology highlight */}
      <section id="psychology" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Psychology preview card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl order-2 lg:order-1">
              <div className="text-xs text-gray-500 mb-4 font-medium">Session Psychology Review</div>
              <div className="space-y-4">
                {/* Tilt gauge mockup */}
                <div className="bg-gray-950 rounded-xl p-4 border border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Tilt Score</span>
                    <span className="text-xs font-bold text-emerald-400">28 — Calm</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-emerald-500">Calm</span>
                    <span className="text-xs text-amber-500">Caution</span>
                    <span className="text-xs text-red-500">Tilt</span>
                  </div>
                </div>

                {/* Emotions */}
                <div>
                  <div className="text-xs text-gray-500 mb-2">Emotions logged this week</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'Focused', color: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/20' },
                      { label: 'Confident', color: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/20' },
                      { label: 'FOMO', color: 'bg-amber-600/20 text-amber-300 border-amber-500/20' },
                      { label: 'Patient', color: 'bg-sky-600/20 text-sky-300 border-sky-500/20' },
                      { label: 'Revenge Trade', color: 'bg-red-600/20 text-red-300 border-red-500/20' },
                    ].map(e => (
                      <span key={e.label} className={`text-xs px-2.5 py-1 rounded-full border ${e.color}`}>{e.label}</span>
                    ))}
                  </div>
                </div>

                {/* Rule adherence */}
                <div className="bg-gray-950 rounded-xl p-3 border border-gray-800">
                  <div className="text-xs text-gray-500 mb-2">Rule Adherence</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
                    </div>
                    <span className="text-xs font-bold text-indigo-300">82%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="text-xs font-semibold text-pink-400 uppercase tracking-widest mb-3">Psychology Tracking</div>
              <h2 className="text-4xl font-bold text-white mb-5 leading-tight">
                Your mindset is<br />
                <span className="text-gray-400">part of your edge.</span>
              </h2>
              <p className="text-gray-400 leading-relaxed mb-8">
                Most traders ignore psychology until it blows up their account.
                TradeJournal tracks your emotional state, rule violations, and tilt score so you can catch patterns before they become problems.
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
                    <div className="w-4 h-4 rounded-full bg-pink-600/20 border border-pink-500/30 flex items-center justify-center flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-pink-400" />
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
      <section id="how-it-works" className="py-24 bg-gray-900/30 border-y border-gray-800/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Simple workflow</div>
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
                {/* Connector line */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-[calc(100%-0px)] w-full h-px bg-gradient-to-r from-gray-700 to-transparent z-0" />
                )}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 relative z-10">
                  <div className="text-4xl font-bold text-gray-800 mb-3">{step.step}</div>
                  <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA section */}
      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            {/* Glow */}
            <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
              <div className="w-96 h-40 rounded-full bg-indigo-600/15 blur-3xl" />
            </div>

            <div className="inline-flex items-center gap-2 bg-indigo-600/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-8">
              <Shield className="w-3.5 h-3.5" />
              Free to use · Your data stays yours
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-white mb-5">
              Ready to trade with<br />
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                full clarity?
              </span>
            </h2>
            <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">
              Join traders who track their edge, manage their psychology, and build consistent performance over time.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/dashboard"
                className="group flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/35 text-base"
              >
                Open the App
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} TradeJournal. Built for traders.
          </p>
          <div className="flex gap-6 text-xs text-gray-600">
            <a href="#features" className="hover:text-gray-400 transition-colors">Features</a>
            <a href="#analytics" className="hover:text-gray-400 transition-colors">Analytics</a>
            <a href="#psychology" className="hover:text-gray-400 transition-colors">Psychology</a>
          </div>
        </div>
      </footer>
      </div>{/* end z-index wrapper */}
    </div>
  )
}
