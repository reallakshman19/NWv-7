import { ACQUISITION_STATES, SCHEDULE_STATES, isDigestDate } from './contracts.js';

const WEEKDAYS = Object.freeze(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);

function minuteOfDay(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) throw new Error('invalid_publication_time');
  return Number(match[1]) * 60 + Number(match[2]);
}

function weekdayForDate(digestDate) {
  const [year, month, day] = digestDate.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function localClock(now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function calendarBounds(calendar) {
  const start = minuteOfDay(calendar.expectedPublicationStart);
  const end = minuteOfDay(calendar.expectedPublicationEnd || calendar.expectedPublicationStart);
  const grace = Number(calendar.publicationGraceMinutes || 0);
  return { start, end, deadline: end + Math.max(0, grace) };
}

export function isScheduledPublicationDay(calendar, digestDate) {
  if (!isDigestDate(digestDate)) throw new Error('invalid_digest_date');
  return (calendar.publicationDays || []).includes(weekdayForDate(digestDate));
}

export function resolvePublicationState(calendar, digestDate, now = new Date()) {
  if (!isScheduledPublicationDay(calendar, digestDate)) {
    return { scheduleState: SCHEDULE_STATES.NOT_SCHEDULED, missingAcquisitionState: ACQUISITION_STATES.OK, phase: 'NOT_SCHEDULED' };
  }
  const clock = localClock(now, calendar.publisherTimezone);
  if (clock.date < digestDate) {
    return { scheduleState: SCHEDULE_STATES.NOT_YET_EXPECTED, missingAcquisitionState: ACQUISITION_STATES.WARNING, phase: 'FUTURE_DATE' };
  }
  if (clock.date > digestDate) {
    return { scheduleState: SCHEDULE_STATES.EXPECTED, missingAcquisitionState: ACQUISITION_STATES.CRITICAL, phase: 'DEADLINE_PASSED' };
  }
  const bounds = calendarBounds(calendar);
  if (clock.minute < bounds.start) {
    return { scheduleState: SCHEDULE_STATES.NOT_YET_EXPECTED, missingAcquisitionState: ACQUISITION_STATES.WARNING, phase: 'BEFORE_WINDOW' };
  }
  if (clock.minute <= bounds.deadline) {
    return { scheduleState: SCHEDULE_STATES.EXPECTED, missingAcquisitionState: ACQUISITION_STATES.WARNING, phase: 'WINDOW_OR_GRACE' };
  }
  return { scheduleState: SCHEDULE_STATES.EXPECTED, missingAcquisitionState: ACQUISITION_STATES.CRITICAL, phase: 'DEADLINE_PASSED' };
}
