// "Норми на мазнини в тялото" - reference chart by gender and age.
// Each row: [minAge, maxAge, excellentMax, goodMax, averageRef, dangerMin]
// (averageRef is the chart's own "Средно" figure, kept for reference/display;
// the actual average/danger boundary is dangerMin, i.e. the ">X" column).

const WOMEN = [
  [20, 24, 18.2, 22.1, 25.0, 29.6],
  [25, 29, 18.9, 22.0, 25.4, 29.8],
  [30, 34, 19.7, 22.7, 26.4, 30.5],
  [35, 39, 21.1, 24.0, 27.7, 31.5],
  [40, 44, 22.6, 25.6, 29.3, 32.8],
  [45, 49, 24.3, 27.3, 30.9, 34.1],
  [50, 54, 25.2, 28.2, 31.8, 35.1],
  [55, 59, 26.6, 29.7, 33.1, 36.2],
  [60, Infinity, 27.4, 30.7, 34.0, 37.3],
]

const MEN = [
  [20, 24, 10.8, 14.9, 19.0, 23.3],
  [25, 29, 12.8, 16.5, 20.3, 24.3],
  [30, 34, 14.5, 18.0, 21.5, 25.2],
  [35, 39, 16.1, 19.3, 22.6, 26.1],
  [40, 44, 17.5, 20.5, 23.6, 26.9],
  [45, 49, 18.6, 21.5, 24.5, 27.6],
  [50, 54, 19.2, 22.1, 25.1, 28.2],
  [55, 59, 19.8, 22.7, 25.6, 28.7],
  [60, Infinity, 20.2, 23.3, 26.2, 29.3],
]

function findRow(table, age) {
  return table.find(([min, max]) => age >= min && age <= max)
}

// Returns 'excellent' | 'good' | 'average' | 'danger' | null (null = no
// reference available, e.g. unknown gender, missing age, or age under 20).
export function classifyFatPercent(value, gender, age) {
  if (value === '' || value === null || value === undefined || age == null) return null
  const num = Number(value)
  if (Number.isNaN(num)) return null

  const table = gender === 'Мъж' ? MEN : gender === 'Жена' ? WOMEN : null
  if (!table) return null

  const row = findRow(table, age)
  if (!row) return null

  const [, , excellentMax, goodMax, , dangerMin] = row
  if (num <= excellentMax) return 'excellent'
  if (num <= goodMax) return 'good'
  if (num < dangerMin) return 'average'
  return 'danger'
}

// Identifies the "body fat %" parameter by name, without accidentally
// matching "Вътрешни мазнини" (visceral fat), which is a different metric.
export function isFatParameterName(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('вътрешни') || n.includes('visceral')) return false
  return n.includes('мазнини') || n.includes('fat')
}
