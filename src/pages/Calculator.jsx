import PositionCalculator from '../components/calculator/PositionCalculator.jsx'

export default function Calculator() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Position Size Calculator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Calculate your position size based on account balance and risk tolerance.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 card-glow">
        <PositionCalculator />
      </div>

      {/* Tips */}
      <div className="bg-gray-900/50 border border-gray-800/60 rounded-xl p-5">
        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Tips</p>
        <ul className="space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">•</span>
            Risk 1–2% per trade to protect your account from drawdown sequences.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">•</span>
            Save risk profiles for different strategies (e.g. scalping vs swing trading).
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">•</span>
            When logging a trade, click <strong className="text-gray-300">Calc Size</strong> next to Position Size to open this calculator pre-filled.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">•</span>
            The R-target table shows profit at each reward-to-risk ratio assuming a full position.
          </li>
        </ul>
      </div>
    </div>
  )
}
