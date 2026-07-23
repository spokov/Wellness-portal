export function toCSV(rows, delimiter = ',') {
  return rows.map((row) => row.map((value) => escapeCell(value, delimiter)).join(delimiter)).join('\r\n')
}

function escapeCell(value, delimiter) {
  let str = value === null || value === undefined ? '' : String(value)

  // Prevent spreadsheet applications from interpreting imported text as a formula.
  if (/^[=+\-@]/.test(str)) str = `'${str}`

  if (str.includes(delimiter) || /["\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  let comma = 0
  let semicolon = 0
  let inQuotes = false

  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i]
    if (char === '"') {
      if (inQuotes && firstLine[i + 1] === '"') i += 1
      else inQuotes = !inQuotes
    } else if (!inQuotes && char === ',') comma += 1
    else if (!inQuotes && char === ';') semicolon += 1
  }

  return semicolon > comma ? ';' : ','
}

function decodeCell(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value
}

export function parseCSV(input) {
  const text = String(input || '').replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(text)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(decodeCell(field))
      field = ''
    } else if (char === '\n') {
      row.push(decodeCell(field.replace(/\r$/, '')))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (inQuotes) throw new Error('Unclosed quoted field')

  if (field.length > 0 || row.length > 0) {
    row.push(decodeCell(field.replace(/\r$/, '')))
    rows.push(row)
  }

  return rows.filter((item) => !(item.length === 1 && item[0] === ''))
}
