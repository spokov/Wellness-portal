import { parseDateOnly } from './date.js'

function completedYears(birthDate, asOf) {
  const birth = parseDateOnly(birthDate)
  const reference =
    typeof asOf === 'string' ? parseDateOnly(asOf) : asOf instanceof Date ? asOf : null

  if (!birth || !reference || reference < birth) return null

  let age = reference.getFullYear() - birth.getFullYear()
  const birthdayNotReached =
    reference.getMonth() < birth.getMonth() ||
    (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate())

  if (birthdayNotReached) age -= 1
  return age
}

export function calcAge(birthDate, asOf = new Date()) {
  return completedYears(birthDate, asOf)
}

export function calcAgeAt(birthDate, atDate) {
  return completedYears(birthDate, atDate)
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function slugifyFileName(value = 'export') {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\u0400-\u04FF._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'export'
}
