/**
 * Project mutation payload builders and audit-trail helpers.
 *
 * One source of truth for the create/update payload construction shared by
 * `src/pages/Projects.jsx` and `src/pages/ProjectDetail.jsx`. Both pages call
 * `buildCreatePayload` / `buildUpdatePayload` to produce the exact body sent to
 * `base44.entities.Project.create()` / `Project.update()`. These helpers stamp
 * authorship on create, append `workflow_history` entries with a diff-derived
 * `note` on update, and strip immutable fields (`created_by`, `created_by_name`)
 * from update payloads as defense-in-depth.
 *
 * The diff baseline is `TRACKED_FIELDS = Object.keys(EMPTY_FORM)` — derived
 * from the canonical form shape exported by `ProjectModal.jsx` (per `fe769b3`).
 * That eliminates the parallel-list duplication that earlier versions of this
 * code dealt with via sync-anchor comments.
 *
 * Convention notes (post-`fe769b3`):
 *   - Empty/missing user fields fall back to `null` (not empty string), so
 *     `created_by: null` is the canonical sentinel for "we tried to stamp but
 *     had no authenticated user." Matches `canEditProject`'s admin-only-edit
 *     semantics for unauthored records.
 *   - The `previous` argument to `buildUpdatePayload` is expected to be the
 *     latest server snapshot (caller fetches it via `Project.get(id)` before
 *     calling). The caller is also responsible for normalizing it through
 *     `buildInitialFormData(previous)` if they want a form-shaped diff
 *     baseline. This helper does not normalize; it diffs whatever the caller
 *     provides against `data`.
 *
 * Required call pattern for `buildUpdatePayload`:
 *
 *     const previous = await base44.entities.Project.get(id);
 *     const previousFormShape = buildInitialFormData(previous);
 *     const payload = buildUpdatePayload(data, user, {
 *       ...previous,           // preserves server-only fields (workflow_history)
 *       ...previousFormShape,  // normalizes the 13 TRACKED_FIELDS for diffing
 *     });
 *     await base44.entities.Project.update(id, payload);
 *
 * Skipping the `buildInitialFormData(previous)` step re-introduces false-
 * positive `null` → `''` / `null` → `[]` diffs for empty fields the modal
 * coerces to non-null defaults.
 */

import { EMPTY_FORM } from '@/components/modals/ProjectModal';
import type { Project, ProjectWorkflowEntry } from '@/types/project';
import type { User } from '@/types/user';

const TRACKED_FIELDS = Object.keys(EMPTY_FORM);

/**
 * Returns the names of fields whose `JSON.stringify` representation differs
 * between `prev` and `next`. Walks `TRACKED_FIELDS` only — Base44 metadata
 * (`id`, `created_date`, etc.) is excluded so the audit `note` stays focused
 * on user-visible changes.
 */
export function diffChangedFields(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined
): string[] {
  const changed: string[] = [];
  for (const key of TRACKED_FIELDS) {
    if (JSON.stringify(prev?.[key]) !== JSON.stringify(next?.[key])) {
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Builds the `Project.create()` payload. Stamps `created_by`, `created_by_name`,
 * and an initial `workflow_history` entry. The `user` argument should be the
 * value from `useUser().user`. Nullish fallbacks produce `null` sentinels per
 * the post-`fe769b3` convention.
 */
export function buildCreatePayload(
  data: Record<string, unknown>,
  user: User | null | undefined
): Record<string, unknown> {
  const timestamp = new Date().toISOString();
  const authorEmail = user?.email ?? null;
  const authorName = user?.full_name ?? user?.email ?? null;
  const initialEntry: ProjectWorkflowEntry = {
    action: 'created',
    by_email: authorEmail,
    by_name: authorName,
    timestamp,
  };
  return {
    ...data,
    created_by: authorEmail,
    created_by_name: authorName,
    workflow_history: [initialEntry],
  };
}

/**
 * Builds the `Project.update()` payload. Strips `created_by` and
 * `created_by_name` from `data` (those fields are immutable post-create) and
 * appends a `{ action: 'updated', note: <changed-fields-csv> }` entry to the
 * project's `workflow_history`. The `previous` argument is the latest server
 * snapshot (caller is expected to have just fetched it via `Project.get(id)`).
 */
export function buildUpdatePayload(
  data: Record<string, unknown>,
  user: User | null | undefined,
  previous: Project | null | undefined
): Record<string, unknown> {
  const timestamp = new Date().toISOString();
  const actorEmail = user?.email ?? null;
  const actorName = user?.full_name ?? user?.email ?? null;
  const previousObj = (previous ?? {}) as Record<string, unknown>;
  const changedFields = diffChangedFields(previousObj, data);
  const previousHistory = Array.isArray(previous?.workflow_history)
    ? previous.workflow_history
    : [];
  const updateEntry: ProjectWorkflowEntry = {
    action: 'updated',
    by_email: actorEmail,
    by_name: actorName,
    timestamp,
    note: changedFields.join(', '),
  };
  const { created_by: _createdBy, created_by_name: _createdByName, ...rest } = data;
  return {
    ...rest,
    workflow_history: [...previousHistory, updateEntry],
  };
}
