export const ALARM_SCHEDULE_VERSION = 1 as const

export type AlarmTimezoneMode = 'fixed' | 'follow-device'
export type AlarmScheduleRecurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'selected-days' | 'annual'
export type AlarmDstResolution = 'exact' | 'gap-shifted-forward' | 'fold-earlier'

/**
 * The platform-neutral alarm contract. `localDate` and `localTime` are civil
 * values; `timezone` identifies how they are interpreted, not a UTC offset.
 */
export type AlarmScheduleDefinition = {
  version: typeof ALARM_SCHEDULE_VERSION
  reminderId: string
  localDate: string
  localTime: string
  timezone: string
  timezoneMode: AlarmTimezoneMode
  recurrence: AlarmScheduleRecurrence
  recurrenceDays: number[]
  scheduleRevision: number
}

export type ResolvedAlarmOccurrence = {
  at: Date
  timezone: string
  resolution: AlarmDstResolution
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const fallbackTimeZones = ['UTC', 'Africa/Lagos', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Kathmandu', 'Asia/Tokyo', 'Australia/Sydney']
const formatterCache = new Map<string, Intl.DateTimeFormat>()

const formatterFor = (timezone: string) => {
  const cached = formatterCache.get(timezone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  formatterCache.set(timezone, formatter)
  return formatter
}

export function canonicalTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

export const isValidIanaTimeZone = (value: unknown) => canonicalTimeZone(value) !== null

export function deviceTimeZone(): string {
  return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'
}

export function selectableTimeZones(): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...new Set([...fallbackTimeZones, ...supported])].sort((left, right) => left.localeCompare(right))
}

export function effectiveAlarmTimeZone(schedule: Pick<AlarmScheduleDefinition, 'timezone' | 'timezoneMode'>, currentDeviceTimeZone = deviceTimeZone()): string | null {
  return schedule.timezoneMode === 'follow-device' ? canonicalTimeZone(currentDeviceTimeZone) : canonicalTimeZone(schedule.timezone)
}

export const isLocalDate = (value: string) => {
  const match = LOCAL_DATE.exec(value)
  if (!match) return false
  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return candidate.getUTCFullYear() === Number(match[1]) && candidate.getUTCMonth() === Number(match[2]) - 1 && candidate.getUTCDate() === Number(match[3])
}

export const isLocalTime = (value: string) => LOCAL_TIME.test(value)

type CivilTime = { year: number; month: number; day: number; hour: number; minute: number }

function civilTime(date: string, time: string): CivilTime | null {
  const dateMatch = LOCAL_DATE.exec(date)
  const timeMatch = LOCAL_TIME.exec(time)
  if (!dateMatch || !timeMatch || !isLocalDate(date)) return null
  return { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]), hour: Number(timeMatch[1]), minute: Number(timeMatch[2]) }
}

function partsAt(timestamp: number, timezone: string): CivilTime {
  const parts = formatterFor(timezone).formatToParts(new Date(timestamp))
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') }
}

function sameCivilTime(left: CivilTime, right: CivilTime) {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute
}

function offsetAt(timestamp: number, timezone: string) {
  const local = partsAt(timestamp, timezone)
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - timestamp
}

function candidatesFor(civil: CivilTime, timezone: string) {
  const wallTimestamp = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute)
  const offsets = new Set([offsetAt(wallTimestamp - 86_400_000, timezone), offsetAt(wallTimestamp, timezone), offsetAt(wallTimestamp + 86_400_000, timezone)])
  return [...offsets]
    .map(offset => wallTimestamp - offset)
    .filter(candidate => sameCivilTime(partsAt(candidate, timezone), civil))
    .filter((candidate, index, candidates) => candidates.indexOf(candidate) === index)
    .sort((left, right) => left - right)
}

/**
 * DST policy: use the earlier instant when a local time occurs twice. If a
 * local time does not exist, use the first valid local minute after the gap.
 */
export function resolveAlarmOccurrence(schedule: Pick<AlarmScheduleDefinition, 'localDate' | 'localTime' | 'timezone' | 'timezoneMode'>, currentDeviceTimeZone = deviceTimeZone()): ResolvedAlarmOccurrence | null {
  const timezone = effectiveAlarmTimeZone(schedule, currentDeviceTimeZone)
  const local = civilTime(schedule.localDate, schedule.localTime)
  if (!timezone || !local) return null
  const direct = candidatesFor(local, timezone)
  if (direct.length) return { at: new Date(direct[0]), timezone, resolution: direct.length > 1 ? 'fold-earlier' : 'exact' }

  // A contemporary DST jump is shorter than three hours. Searching civil
  // minutes makes the resulting policy independent of the host timezone.
  const wallTimestamp = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
  for (let minute = 1; minute <= 180; minute++) {
    const wall = new Date(wallTimestamp + minute * 60_000)
    const shifted: CivilTime = { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate(), hour: wall.getUTCHours(), minute: wall.getUTCMinutes() }
    const matches = candidatesFor(shifted, timezone)
    if (matches.length) return { at: new Date(matches[0]), timezone, resolution: 'gap-shifted-forward' }
  }
  return null
}

export function createAlarmScheduleDefinition(input: Omit<AlarmScheduleDefinition, 'version'>, currentDeviceTimeZone = deviceTimeZone()): AlarmScheduleDefinition | null {
  const timezoneMode: AlarmTimezoneMode = input.timezoneMode === 'follow-device' ? 'follow-device' : 'fixed'
  const timezone = canonicalTimeZone(input.timezone)
  if (!timezone || !effectiveAlarmTimeZone({ timezone, timezoneMode }, currentDeviceTimeZone) || !input.reminderId || !isLocalDate(input.localDate) || !isLocalTime(input.localTime)) return null
  return {
    version: ALARM_SCHEDULE_VERSION,
    reminderId: input.reminderId,
    localDate: input.localDate,
    localTime: input.localTime,
    timezone,
    timezoneMode,
    recurrence: input.recurrence,
    recurrenceDays: [...new Set(input.recurrenceDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort(),
    scheduleRevision: Math.max(1, Math.floor(input.scheduleRevision) || 1),
  }
}

export const nextScheduleRevision = (revision: number | undefined) => Math.max(1, Math.floor(revision ?? 0) + 1)
