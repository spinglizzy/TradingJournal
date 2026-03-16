// Central registry of all available widgets.
// Each entry describes the widget's identity, default config, and which component to render.

import TotalPnLWidget           from './widgets/TotalPnLWidget.jsx'
import WinRateWidget            from './widgets/WinRateWidget.jsx'
import ProfitFactorWidget       from './widgets/ProfitFactorWidget.jsx'
import ExpectancyWidget         from './widgets/ExpectancyWidget.jsx'
import TotalTradesWidget        from './widgets/TotalTradesWidget.jsx'
import BestWorstTradeWidget     from './widgets/BestWorstTradeWidget.jsx'
import CurrentStreakWidget      from './widgets/CurrentStreakWidget.jsx'
import EquityCurveWidget        from './widgets/EquityCurveWidget.jsx'
import DailyPnLWidget           from './widgets/DailyPnLWidget.jsx'
import CalendarHeatmapWidget    from './widgets/CalendarHeatmapWidget.jsx'
import MonthlyComparisonWidget  from './widgets/MonthlyComparisonWidget.jsx'
import PerformanceBySetupWidget from './widgets/PerformanceBySetupWidget.jsx'
import WinLossByDayWidget       from './widgets/WinLossByDayWidget.jsx'
import RecentTradesWidget       from './widgets/RecentTradesWidget.jsx'
import OpenTradesWidget         from './widgets/OpenTradesWidget.jsx'
import GoalsWidget             from './widgets/GoalsWidget.jsx'

export const WIDGET_REGISTRY = {
  'total-pnl': {
    name: 'Total P&L',
    description: 'Cumulative profit & loss for the period',
    category: 'summary',
    defaultSize: 'small',
    allowedSizes: ['small', 'medium'],
    component: TotalPnLWidget,
    icon: '💰',
  },
  'win-rate': {
    name: 'Win Rate',
    description: 'Percentage of winning trades',
    category: 'summary',
    defaultSize: 'small',
    allowedSizes: ['small', 'medium'],
    component: WinRateWidget,
    icon: '🎯',
  },
  'profit-factor': {
    name: 'Profit Factor',
    description: 'Ratio of gross profit to gross loss',
    category: 'summary',
    defaultSize: 'small',
    allowedSizes: ['small', 'medium'],
    component: ProfitFactorWidget,
    icon: '⚖️',
  },
  'expectancy': {
    name: 'Expectancy',
    description: 'Average amount you expect to win per trade',
    category: 'summary',
    defaultSize: 'small',
    allowedSizes: ['small', 'medium'],
    component: ExpectancyWidget,
    icon: '📊',
  },
  'total-trades': {
    name: 'Total Trades',
    description: 'Count of closed and open trades',
    category: 'summary',
    defaultSize: 'small',
    allowedSizes: ['small', 'medium'],
    component: TotalTradesWidget,
    icon: '📋',
  },
  'best-worst-trade': {
    name: 'Best / Worst Trade',
    description: 'Your best and worst single trade',
    category: 'summary',
    defaultSize: 'small',
    allowedSizes: ['small', 'medium'],
    component: BestWorstTradeWidget,
    icon: '🏆',
  },
  'current-streak': {
    name: 'Current Streak',
    description: 'Current winning or losing streak',
    category: 'summary',
    defaultSize: 'small',
    allowedSizes: ['small', 'medium'],
    component: CurrentStreakWidget,
    icon: '🔥',
  },
  'equity-curve': {
    name: 'Equity Curve',
    description: 'Cumulative P&L over time with drawdown shading',
    category: 'chart',
    defaultSize: 'large',
    allowedSizes: ['medium', 'large', 'full'],
    component: EquityCurveWidget,
    icon: '📈',
  },
  'daily-pnl': {
    name: 'Daily P&L',
    description: 'Bar chart of daily profit & loss',
    category: 'chart',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large', 'full'],
    component: DailyPnLWidget,
    icon: '📊',
  },
  'calendar-heatmap': {
    name: 'Calendar Heatmap',
    description: 'Month view with green/red cells sized by P&L',
    category: 'chart',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large', 'full'],
    component: CalendarHeatmapWidget,
    icon: '📅',
  },
  'monthly-comparison': {
    name: 'Monthly Comparison',
    description: 'This month vs last month vs average',
    category: 'chart',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large', 'full'],
    component: MonthlyComparisonWidget,
    icon: '📉',
  },
  'performance-by-setup': {
    name: 'Performance by Setup',
    description: 'Horizontal bar chart by trade setup',
    category: 'chart',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large', 'full'],
    component: PerformanceBySetupWidget,
    icon: '🎰',
  },
  'win-loss-by-day': {
    name: 'Win/Loss by Day',
    description: 'Performance breakdown by day of the week',
    category: 'chart',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large', 'full'],
    component: WinLossByDayWidget,
    icon: '📅',
  },
  'recent-trades': {
    name: 'Recent Trades',
    description: 'Last 10 closed trades',
    category: 'table',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large', 'full'],
    component: RecentTradesWidget,
    icon: '📋',
  },
  'open-trades': {
    name: 'Open / Planned Trades',
    description: 'Currently open or planned positions',
    category: 'table',
    defaultSize: 'medium',
    allowedSizes: ['medium', 'large', 'full'],
    component: OpenTradesWidget,
    icon: '🔓',
  },
  'goals': {
    name: 'Goals Progress',
    description: 'Active goals with progress bars and streak counters',
    category: 'summary',
    defaultSize: 'medium',
    allowedSizes: ['small', 'medium', 'large'],
    component: GoalsWidget,
    icon: '🎯',
    minW: 1, minH: 3,
  },
}

export const CATEGORIES = {
  summary: 'Summary Cards',
  chart:   'Charts',
  table:   'Tables',
}

// Default layout for first-time users
export const DEFAULT_LAYOUT = [
  { id: 'w-total-pnl',     type: 'total-pnl',          size: 'small',  x: 0, y: 0, w: 2, h: 1, settings: {} },
  { id: 'w-profit-factor', type: 'profit-factor',      size: 'small',  x: 2, y: 0, w: 3, h: 1, settings: {} },
  { id: 'w-win-rate',      type: 'win-rate',           size: 'small',  x: 5, y: 0, w: 3, h: 1, settings: {} },
  { id: 'w-expectancy',    type: 'expectancy',         size: 'small',  x: 8, y: 0, w: 4, h: 2, settings: {} },
  { id: 'w-streak',        type: 'current-streak',     size: 'small',  x: 8, y: 2, w: 4, h: 2, settings: {} },
  { id: 'w-best-worst',    type: 'best-worst-trade',   size: 'small',  x: 8, y: 4, w: 4, h: 3, settings: {} },
  { id: 'w-calendar',      type: 'calendar-heatmap',   size: 'medium', x: 0, y: 1, w: 8, h: 6, settings: {} },
]
