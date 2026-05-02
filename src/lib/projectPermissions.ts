/**
 * Project permission helpers.
 *
 * Exports hook-based permission checks for project workflows:
 *
 *   - `useCanEditProject(project)` — admin override + author-equality.
 *   - `useCanAssignToProject(targetUser)` — admin override + self +
 *     same-department equality (case-insensitive, trimmed).
 *   - `useAssignableUsers(allUsers)` — filter helper for UI; returns the
 *     subset of `allUsers` the current user may assign.
 *
 * All three hooks read the current authenticated user via `useUser()`. The
 * `useCanEdit*` family parallels existing `useCan*` patterns elsewhere in the
 * codebase.
 *
 * Pre-existing projects with no creator are locked to admins until manually
 * claimed. Empty-department users can only assign themselves until an admin
 * sets their department in Settings → User Management.
 */

import { useMemo } from 'react';
import { useUser } from '@/hooks/useUser';
import type { Project } from '@/types/project';
import type { User } from '@/types/user';

/**
 * Normalize a department string for comparison: trim whitespace and lowercase.
 * Empty / nullish input returns an empty string.
 */
function normalizeDepartment(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Pure helper for the assignment rule. Used internally by
 * `useCanAssignToProject` / `useAssignableUsers` after `useUser()` has
 * resolved the current user. Not exported — UI callers should use the hooks.
 */
function canAssignTo(
  targetUser: User | null | undefined,
  currentUser: User | null | undefined,
  isAdmin: boolean
): boolean {
  if (!targetUser || !currentUser) return false;
  if (isAdmin) return true;
  if (targetUser.email === currentUser.email) return true;
  const a = normalizeDepartment(currentUser.department);
  const b = normalizeDepartment(targetUser.department);
  if (a === '' || b === '') return false;
  return a === b;
}

/**
 * Returns true if the current authenticated user may edit `project`.
 *
 * Rule:
 *   - Admins may edit any project (industry-default super-user override).
 *   - Otherwise, only the project's original author may edit it.
 *
 * Pre-existing projects with `created_by == null` are editable only by admins
 * until manually claimed; no automatic backfill is performed.
 */
export function useCanEditProject(project: Project | null | undefined): boolean {
  const { user, isAdmin } = useUser();
  if (!project || !user) return false;
  if (isAdmin) return true;
  return project.created_by === user.email;
}

/**
 * Returns true if the current authenticated user may assign `targetUser` as a
 * team member on a project.
 *
 * Rule:
 *   - Admins may assign anyone (cross-department escape hatch).
 *   - Anyone may assign themselves.
 *   - Otherwise: targetUser's department must match the current user's
 *     department, case-insensitive and trimmed. Both departments must be
 *     non-empty.
 */
export function useCanAssignToProject(targetUser: User | null | undefined): boolean {
  const { user, isAdmin } = useUser();
  return canAssignTo(targetUser, user, isAdmin);
}

/**
 * Returns the subset of `allUsers` the current authenticated user may assign
 * as team members on a project. Memoized on `allUsers` and the current user.
 *
 * The return type narrows to users with a defined `email`, since email is the
 * value-list key in the picker and an entry without one can't participate in
 * the multi-select.
 */
export function useAssignableUsers(allUsers: User[]): Array<User & { email: string }> {
  const { user, isAdmin } = useUser();
  return useMemo(
    () =>
      allUsers.filter(
        (u): u is User & { email: string } => Boolean(u.email) && canAssignTo(u, user, isAdmin)
      ),
    [allUsers, user, isAdmin]
  );
}
