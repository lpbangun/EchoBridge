/**
 * EchoBridge utility functions.
 */

/**
 * Format seconds into HH:MM:SS or MM:SS (for timer displays).
 */
export function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Format duration in seconds into a short human-readable string.
 * Examples: "45 min", "1h 23min", "2h", "< 1 min"
 */
export function formatDurationShort(seconds) {
  if (seconds == null || seconds < 0) return '';
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

/**
 * Format an ISO date string into a human-readable form.
 * Returns "Today, 2:30 PM" or "Yesterday, 2:30 PM" or "Feb 19, 2:30 PM".
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return `Today, ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}, ${timeStr}`;
}

/**
 * Format an ISO date string to a relative time description.
 * Examples: "Just now", "5 minutes ago", "2 hours ago", "Yesterday", "3 days ago"
 */
export function formatRelativeDate(isoString) {
  if (!isoString) return '';

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }

  return formatDate(isoString);
}

/**
 * Map context ID to human-readable label.
 * "class_lecture" -> "Class Lecture"
 */
const CONTEXT_LABELS = {
  class_lecture: 'Class Lecture',
  startup_meeting: 'Startup Meeting',
  research_discussion: 'Research Discussion',
  working_session: 'Working Session',
  talk_seminar: 'Talk / Seminar',
};

export function contextLabel(context) {
  return CONTEXT_LABELS[context] || context || 'Unknown';
}

/**
 * Map context to its metadata field label.
 */
const CONTEXT_META_LABELS = {
  class_lecture: 'Course',
  startup_meeting: 'Project',
  research_discussion: 'Topic',
  working_session: 'Project',
  talk_seminar: 'Event',
};

export function contextMetaLabel(context) {
  return CONTEXT_META_LABELS[context] || 'Topic';
}

/**
 * Return the Lucide icon component name for a given context type.
 * These correspond to imports from lucide-react.
 */
export function contextIcon(context) {
  const icons = {
    class_lecture: 'BookOpen',
    startup_meeting: 'Rocket',
    research_discussion: 'FlaskConical',
    working_session: 'Lightbulb',
    talk_seminar: 'Mic',
  };
  return icons[context] || 'FileText';
}

/**
 * Return the Tailwind text color class for a session/room status.
 * Text-only colors per DESIGN.md: no background badges.
 */
export function statusColor(status) {
  const colors = {
    created: 'text-neutral-500',
    recording: 'text-red-600',
    transcribing: 'text-amber-600',
    processing: 'text-amber-600',
    complete: 'text-green-600',
    error: 'text-red-600',
    waiting: 'text-neutral-500',
    closed: 'text-neutral-500',
  };
  return colors[status] || 'text-neutral-500';
}
