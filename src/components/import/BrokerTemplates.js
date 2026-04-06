// Pre-built column mapping templates for common brokers/platforms
// mappings: { journalField: 'CSV Column Name' }
// transforms: optional value transformers per field

export const BROKER_TEMPLATES = [
  {
    id: 'interactive_brokers',
    name: 'Interactive Brokers',
    description: 'Trade Activity export (Activity → Trades)',
    mappings: {
      date:          'Date/Time',
      ticker:        'Symbol',
      direction:     'Buy/Sell',
      entry_price:   'T. Price',
      position_size: 'Quantity',
      fees:          'Comm/Fee',
    },
    transforms: {
      direction:  v => { const u = String(v).toUpperCase(); return u === 'BOT' || u === 'BUY' ? 'long' : 'short' },
      date:       v => v?.split(',')[0]?.trim() || v,  // "2024-01-15, 09:30:00" → "2024-01-15"
      position_size: v => Math.abs(parseFloat(v) || 0),
      fees:       v => Math.abs(parseFloat(v) || 0),
    },
  },
  {
    id: 'trading212',
    name: 'Trading 212',
    description: 'History export (CSV)',
    mappings: {
      date:          'Time',
      ticker:        'Ticker',
      direction:     'Action',
      entry_price:   'Price / share',
      position_size: 'No. of shares',
      fees:          'Currency conversion fee',
      notes:         'Notes',
    },
    transforms: {
      direction: v => {
        const u = String(v).toUpperCase()
        return (u.includes('BUY') || u === 'LONG') ? 'long' : 'short'
      },
      date: v => v?.split(' ')[0] || v,
    },
  },
  {
    id: 'commsec',
    name: 'CommSec',
    description: 'Transaction History export',
    mappings: {
      date:          'Date',
      ticker:        'Code',
      direction:     'Type',
      entry_price:   'Price',
      position_size: 'Qty',
      fees:          'Brokerage',
      notes:         'Details',
    },
    transforms: {
      direction: v => {
        const u = String(v).toUpperCase()
        return (u === 'B' || u === 'BUY' || u.includes('BUY')) ? 'long' : 'short'
      },
      date: v => {
        // "15/01/2024" → "2024-01-15"
        const parts = v?.split('/')
        if (parts?.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
        return v
      },
    },
  },
  {
    id: 'metatrader4',
    name: 'MetaTrader 4',
    description: 'Account History export (detailed statement)',
    mappings: {
      date:          'Open Time',
      ticker:        'Symbol',
      direction:     'Type',
      entry_price:   'Open Price',
      exit_price:    'Close Price',
      stop_loss:     'S / L',
      position_size: 'Lots',
      fees:          'Commission',
      notes:         'Comment',
    },
    transforms: {
      direction: v => {
        const l = String(v).toLowerCase()
        return (l === 'buy' || l === 'buy limit' || l === 'buy stop') ? 'long' : 'short'
      },
      date: v => v?.split(' ')[0] || v,
    },
  },
  {
    id: 'metatrader5',
    name: 'MetaTrader 5',
    description: 'Deals History export',
    mappings: {
      date:          'Time',
      ticker:        'Symbol',
      direction:     'Direction',
      entry_price:   'Price',
      position_size: 'Volume',
      fees:          'Commission',
      notes:         'Comment',
    },
    transforms: {
      direction: v => String(v).toLowerCase().includes('buy') ? 'long' : 'short',
      date: v => v?.split(' ')[0] || v,
    },
  },
  {
    id: 'tradingview',
    name: 'TradingView',
    description: 'Paper trading / broker trades export',
    mappings: {
      date:          'Date',
      ticker:        'Instrument',
      direction:     'Side',
      entry_price:   'Entry',
      exit_price:    'Exit',
      position_size: 'Qty',
      fees:          'Commission',
      notes:         'Comment',
    },
    transforms: {
      direction: v => String(v).toLowerCase() === 'buy' ? 'long' : 'short',
    },
  },
  {
    id: 'webull',
    name: 'Webull',
    description: 'Trade history export',
    mappings: {
      date:          'Date',
      ticker:        'Symbol',
      direction:     'Side',
      entry_price:   'Avg Price',
      position_size: 'Filled Qty',
      fees:          'Commission',
    },
    transforms: {
      direction: v => String(v).toLowerCase() === 'buy' ? 'long' : 'short',
    },
  },
  {
    id: 'alpaca',
    name: 'Alpaca',
    description: 'Order history CSV export',
    mappings: {
      date:          'Filled At',
      ticker:        'Symbol',
      direction:     'Side',
      entry_price:   'Avg Price',
      position_size: 'Qty',
      fees:          'Commission',
    },
    transforms: {
      direction:     v => String(v).toLowerCase() === 'buy' ? 'long' : 'short',
      date:          v => v?.split('T')[0] || v,   // ISO datetime → date
      position_size: v => Math.abs(parseFloat(v) || 0),
      fees:          v => Math.abs(parseFloat(v) || 0),
    },
  },
  {
    id: 'generic',
    name: 'Generic / Custom',
    description: 'Standard columns — customize as needed',
    mappings: {
      date:          'date',
      ticker:        'ticker',
      direction:     'direction',
      entry_price:   'entry_price',
      exit_price:    'exit_price',
      stop_loss:     'stop_loss',
      position_size: 'position_size',
      fees:          'fees',
      notes:         'notes',
      setup:         'setup',
      timeframe:     'timeframe',
    },
    transforms: {},
  },
]

export const JOURNAL_FIELDS = [
  { key: 'date',          label: 'Date',          required: true,  hint: 'YYYY-MM-DD' },
  { key: 'ticker',        label: 'Ticker/Symbol',  required: true,  hint: 'e.g. AAPL' },
  { key: 'direction',     label: 'Direction',      required: false, hint: 'long/short or buy/sell' },
  { key: 'entry_price',   label: 'Entry Price',    required: true,  hint: 'Number' },
  { key: 'exit_price',    label: 'Exit Price',     required: false, hint: 'Number (leave empty for open)' },
  { key: 'stop_loss',     label: 'Stop Loss',      required: false, hint: 'Number' },
  { key: 'position_size', label: 'Position Size',  required: true,  hint: 'Shares or units' },
  { key: 'fees',          label: 'Fees/Commission',required: false, hint: 'Number' },
  { key: 'notes',         label: 'Notes',          required: false, hint: 'Text' },
  { key: 'setup',         label: 'Setup/Pattern',  required: false, hint: 'Text' },
  { key: 'timeframe',     label: 'Timeframe',      required: false, hint: 'e.g. 1h, daily' },
]
