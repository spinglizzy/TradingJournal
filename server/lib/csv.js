/**
 * CSV -> array of rows. One pass over the whole text so a quoted field can hold
 * commas, "" escapes and line breaks (our own export quotes multi-line notes).
 * Shared by the import route and ImportExport.jsx, like gateVerdict.js.
 */
export function parseCSV(text) {
  const rows = []
  let row = [], cur = '', inQuote = false
  const endField = () => { row.push(cur.trim()); cur = '' }
  const endRow = () => {
    endField()
    if (row.some(f => f !== '')) rows.push(row)
    row = []
  }
  const s = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuote) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQuote = false
      else cur += ch
    } else if (ch === '"') inQuote = true
    else if (ch === ',') endField()
    else if (ch === '\n') endRow()
    else cur += ch
  }
  endRow()
  return rows
}
