import assert from 'node:assert/strict'
import { parseCSV } from './server/lib/csv.js'

assert.deepEqual(parseCSV('a,b\n1,2\n'), [['a', 'b'], ['1', '2']])
assert.deepEqual(parseCSV('a,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']])
assert.deepEqual(parseCSV('date,notes\n2026-01-02,"line one\nline two"\n2026-01-03,ok'),
  [['date', 'notes'], ['2026-01-02', 'line one\nline two'], ['2026-01-03', 'ok']])
assert.deepEqual(parseCSV('a,b\n\n,\n1,'), [['a', 'b'], ['1', '']])
console.log('csv: 4 passed')
