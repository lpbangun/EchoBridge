import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDuration,
  formatDurationShort,
  formatDate,
  formatRelativeDate,
  contextLabel,
  contextMetaLabel,
  contextIcon,
  statusColor,
} from '../../lib/utils.js';

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------
describe('formatDuration', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats 65 seconds as 01:05', () => {
    expect(formatDuration(65)).toBe('01:05');
  });

  it('formats 3661 seconds as 01:01:01 (HH:MM:SS)', () => {
    expect(formatDuration(3661)).toBe('01:01:01');
  });

  it('returns --:-- for null', () => {
    expect(formatDuration(null)).toBe('--:--');
  });

  it('returns --:-- for undefined', () => {
    expect(formatDuration(undefined)).toBe('--:--');
  });

  it('returns --:-- for negative values', () => {
    expect(formatDuration(-10)).toBe('--:--');
  });
});

// ---------------------------------------------------------------------------
// formatDurationShort
// ---------------------------------------------------------------------------
describe('formatDurationShort', () => {
  it('formats 0 seconds as "< 1 min"', () => {
    expect(formatDurationShort(0)).toBe('< 1 min');
  });

  it('formats 29 seconds as "< 1 min"', () => {
    // Math.round(29/60) = 0, which is < 1
    expect(formatDurationShort(29)).toBe('< 1 min');
  });

  it('formats 30 seconds as "1 min" (rounds up)', () => {
    // Math.round(30/60) = Math.round(0.5) = 1
    expect(formatDurationShort(30)).toBe('1 min');
  });

  it('formats 59*60 seconds as "59 min"', () => {
    expect(formatDurationShort(59 * 60)).toBe('59 min');
  });

  it('formats 90*60 seconds as "1h 30min"', () => {
    expect(formatDurationShort(90 * 60)).toBe('1h 30min');
  });

  it('formats 3600 seconds as "1h"', () => {
    expect(formatDurationShort(3600)).toBe('1h');
  });

  it('returns empty string for null', () => {
    expect(formatDurationShort(null)).toBe('');
  });

  it('returns empty string for negative values', () => {
    expect(formatDurationShort(-5)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns "Today, ..." for a date today', () => {
    const now = new Date();
    now.setHours(14, 30, 0, 0);
    const result = formatDate(now.toISOString());
    expect(result).toMatch(/^Today, /);
  });

  it('returns "Yesterday, ..." for a date yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(14, 30, 0, 0);
    const result = formatDate(yesterday.toISOString());
    expect(result).toMatch(/^Yesterday, /);
  });

  it('returns "Mon DD, time" for an older date', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    old.setHours(9, 15, 0, 0);
    const result = formatDate(old.toISOString());
    // Should not start with "Today" or "Yesterday"
    expect(result).not.toMatch(/^Today/);
    expect(result).not.toMatch(/^Yesterday/);
    // Should contain a short month name and comma
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, /);
  });
});

// ---------------------------------------------------------------------------
// formatRelativeDate
// ---------------------------------------------------------------------------
describe('formatRelativeDate', () => {
  it('returns empty string for empty input', () => {
    expect(formatRelativeDate('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatRelativeDate(null)).toBe('');
  });

  it('returns "Just now" for a date less than 60 seconds ago', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
    expect(formatRelativeDate(recent.toISOString())).toBe('Just now');
  });

  it('returns "X minutes ago" for dates minutes ago', () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeDate(fiveMinAgo.toISOString())).toBe('5 minutes ago');
  });

  it('returns singular "1 minute ago"', () => {
    const now = new Date();
    const oneMinAgo = new Date(now.getTime() - 90 * 1000); // 1.5 min => 1 min
    expect(formatRelativeDate(oneMinAgo.toISOString())).toBe('1 minute ago');
  });

  it('returns "X hours ago" for dates hours ago', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(formatRelativeDate(threeHoursAgo.toISOString())).toBe('3 hours ago');
  });

  it('returns singular "1 hour ago"', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    expect(formatRelativeDate(oneHourAgo.toISOString())).toBe('1 hour ago');
  });

  it('returns "Yesterday" for exactly 1 day ago', () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(formatRelativeDate(oneDayAgo.toISOString())).toBe('Yesterday');
  });

  it('returns "X days ago" for 2-6 days ago', () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeDate(threeDaysAgo.toISOString())).toBe('3 days ago');
  });

  it('returns "X weeks ago" for 7-29 days ago', () => {
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    expect(formatRelativeDate(twoWeeksAgo.toISOString())).toBe('2 weeks ago');
  });

  it('returns singular "1 week ago"', () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(formatRelativeDate(oneWeekAgo.toISOString())).toBe('1 week ago');
  });

  it('falls back to formatDate for dates >= 30 days ago', () => {
    const now = new Date();
    const longAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(longAgo.toISOString());
    // Should produce a formatted date string, not a relative description
    expect(result).not.toMatch(/ago$/);
    expect(result).not.toBe('Just now');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// contextLabel
// ---------------------------------------------------------------------------
describe('contextLabel', () => {
  it('maps class_lecture', () => {
    expect(contextLabel('class_lecture')).toBe('Class Lecture');
  });

  it('maps startup_meeting', () => {
    expect(contextLabel('startup_meeting')).toBe('Startup Meeting');
  });

  it('maps research_discussion', () => {
    expect(contextLabel('research_discussion')).toBe('Research Discussion');
  });

  it('maps working_session', () => {
    expect(contextLabel('working_session')).toBe('Working Session');
  });

  it('maps talk_seminar', () => {
    expect(contextLabel('talk_seminar')).toBe('Talk / Seminar');
  });

  it('returns the context string for unknown contexts', () => {
    expect(contextLabel('some_unknown')).toBe('some_unknown');
  });

  it('returns "Unknown" for null', () => {
    expect(contextLabel(null)).toBe('Unknown');
  });

  it('returns "Unknown" for undefined', () => {
    expect(contextLabel(undefined)).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// contextMetaLabel
// ---------------------------------------------------------------------------
describe('contextMetaLabel', () => {
  it('maps class_lecture to "Course"', () => {
    expect(contextMetaLabel('class_lecture')).toBe('Course');
  });

  it('maps startup_meeting to "Project"', () => {
    expect(contextMetaLabel('startup_meeting')).toBe('Project');
  });

  it('maps research_discussion to "Topic"', () => {
    expect(contextMetaLabel('research_discussion')).toBe('Topic');
  });

  it('maps working_session to "Project"', () => {
    expect(contextMetaLabel('working_session')).toBe('Project');
  });

  it('maps talk_seminar to "Event"', () => {
    expect(contextMetaLabel('talk_seminar')).toBe('Event');
  });

  it('returns "Topic" for unknown contexts', () => {
    expect(contextMetaLabel('unknown_thing')).toBe('Topic');
  });
});

// ---------------------------------------------------------------------------
// contextIcon
// ---------------------------------------------------------------------------
describe('contextIcon', () => {
  it('maps class_lecture to "BookOpen"', () => {
    expect(contextIcon('class_lecture')).toBe('BookOpen');
  });

  it('maps startup_meeting to "Rocket"', () => {
    expect(contextIcon('startup_meeting')).toBe('Rocket');
  });

  it('maps research_discussion to "FlaskConical"', () => {
    expect(contextIcon('research_discussion')).toBe('FlaskConical');
  });

  it('maps working_session to "Lightbulb"', () => {
    expect(contextIcon('working_session')).toBe('Lightbulb');
  });

  it('maps talk_seminar to "Mic"', () => {
    expect(contextIcon('talk_seminar')).toBe('Mic');
  });

  it('returns "FileText" for unknown contexts', () => {
    expect(contextIcon('something_else')).toBe('FileText');
  });
});

// ---------------------------------------------------------------------------
// statusColor
// ---------------------------------------------------------------------------
describe('statusColor', () => {
  it('returns text-neutral-500 for "created"', () => {
    expect(statusColor('created')).toBe('text-neutral-500');
  });

  it('returns text-red-600 for "recording"', () => {
    expect(statusColor('recording')).toBe('text-red-600');
  });

  it('returns text-amber-600 for "transcribing"', () => {
    expect(statusColor('transcribing')).toBe('text-amber-600');
  });

  it('returns text-amber-600 for "processing"', () => {
    expect(statusColor('processing')).toBe('text-amber-600');
  });

  it('returns text-green-600 for "complete"', () => {
    expect(statusColor('complete')).toBe('text-green-600');
  });

  it('returns text-red-600 for "error"', () => {
    expect(statusColor('error')).toBe('text-red-600');
  });

  it('returns text-neutral-500 for unknown statuses', () => {
    expect(statusColor('banana')).toBe('text-neutral-500');
  });
});
