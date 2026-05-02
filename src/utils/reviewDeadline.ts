// Computes the absolute deadline for a post review and the latest review
// due date the picker should allow.
//
// Rules:
//   - Deadline is the earlier of:
//       a) end-of-day (23:59) on `review_due_date`, in the post's timezone
//       b) one hour before the post's scheduled publish instant
//   - Both wall-clock values are interpreted in `post.timezone` (falling back
//     to UTC) so all reviewers see the same instant regardless of where they
//     happen to be browsing from.
//   - The 1-hour buffer is enforced even when the post is scheduled between
//     midnight and 1am — in that case the latest valid `review_due_date` is
//     the previous calendar day in the post's timezone.

import { wallClockToUtc } from '@/utils/date';

// 1 hour
const REVIEW_BUFFER_MS = 60 * 60 * 1000;

/**
 * Returns the absolute deadline instant for a review, or `null` when there is
 * no `review_due_date` set. When the buffer (`scheduled - 1h`) is earlier than
 * end-of-day on `review_due_date`, the buffer wins; otherwise end-of-day.
 */
export const computeReviewDeadline = (
  reviewDueDate: string | null | undefined,
  scheduledDate: string | null | undefined,
  scheduledTime: string | null | undefined,
  timeZone: string | null | undefined
): Date | null => {
  if (!reviewDueDate) return null;
  // wallClockToUtc parses time as HH:MM (it ignores seconds), so 23:59 is the
  // best end-of-day approximation we can express through it. The 59-second
  // imprecision is invisible against a per-second-ticking countdown UI.
  const endOfDay = wallClockToUtc(reviewDueDate, '23:59', timeZone);
  if (!scheduledDate) return endOfDay;
  const scheduledInstant = wallClockToUtc(scheduledDate, scheduledTime ?? '00:00', timeZone);
  const bufferDeadline = new Date(scheduledInstant.getTime() - REVIEW_BUFFER_MS);
  return endOfDay.getTime() < bufferDeadline.getTime() ? endOfDay : bufferDeadline;
};

/**
 * Returns the latest `review_due_date` string (YYYY-MM-DD) that satisfies the
 * 1-hour buffer rule, expressed as a date in the post's timezone. When the
 * post is scheduled between 00:00 and 00:59 in its own timezone, this returns
 * the previous calendar day so the buffer is preserved.
 */
export const latestValidReviewDueDate = (
  scheduledDate: string,
  scheduledTime: string | null | undefined,
  timeZone: string | null | undefined
): string => {
  const scheduledInstant = wallClockToUtc(scheduledDate, scheduledTime ?? '00:00', timeZone);
  const bufferInstant = new Date(scheduledInstant.getTime() - REVIEW_BUFFER_MS);
  let zone = timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
  } catch {
    zone = 'UTC';
  }
  // en-CA formats numeric date parts as YYYY-MM-DD with no extra punctuation.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(bufferInstant);
};
