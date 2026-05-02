/**
 * UserPicker — controlled multi-select for assigning team members to a project.
 *
 * Built on shadcn Popover + Command (cmdk-based combobox). Filters options
 * to users the current user can assign (via `useAssignableUsers`) —
 * non-assignable users simply aren't present, matching the principle that you
 * can't see what you can't have. Selected users render as removable Badge
 * pills below the trigger button. Search input narrows by name or email
 * substring.
 *
 * Reads the current authenticated user internally via `useUser()` (post-
 * `fe769b3` convention). Callers do NOT pass `currentUser` as a prop — only
 * the full `allUsers` list (since fetching ownership belongs in the page
 * component, not the picker).
 *
 * When `lockCurrentUser` is true, the current user is auto-included in the
 * selection (added to `value` if not already present) and rendered with muted
 * styling and no remove button — used by ProjectModal so the author is always
 * on every project they create. The lock invariant is enforced in `toggle`
 * and `remove` (the only supported mutation paths inside this component);
 * callers that bypass them by editing `value` directly are responsible for
 * preserving the author themselves.
 */

import { useEffect, useMemo, useState, type WheelEvent } from 'react';
import { Check, ChevronsUpDown, X, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAssignableUsers } from '@/lib/projectPermissions';
import { useUser } from '@/hooks/useUser';
import COPY from '@/lib/copy';
import type { User } from '@/types/user';

type UserPickerProps = {
  /** Selected user emails (the source of truth for the multi-select). */
  value: string[];
  /** Called when the selection changes. */
  onChange: (emails: string[]) => void;
  /** Full user list — typically from useQuery(['users'], () => User.list()). */
  allUsers: User[];
  /** Trigger button placeholder when nothing is selected. */
  placeholder?: string;
  /** When true, disables the entire picker. */
  disabled?: boolean;
  /**
   * When true, the current user is auto-included in the selection and cannot
   * be removed. Used by ProjectModal so authors stay on their own projects.
   */
  lockCurrentUser?: boolean;
};

export default function UserPicker({
  value,
  onChange,
  allUsers,
  placeholder = COPY.projects.userPicker.placeholder,
  disabled = false,
  lockCurrentUser = false,
}: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const { user: currentUser } = useUser();
  const assignable = useAssignableUsers(allUsers);

  // If lockCurrentUser is on, ensure the author appears in `value` from mount.
  useEffect(() => {
    if (!lockCurrentUser || !currentUser?.email) return;
    if (!value.includes(currentUser.email)) {
      onChange([...value, currentUser.email]);
    }
    // We intentionally only run this effect when the lock setting or current
    // user changes — not when `value` changes, to avoid re-adding a user the
    // caller may have explicitly removed via a different code path.
  }, [lockCurrentUser, currentUser?.email]);

  // Index `allUsers` by email once so each `value` lookup is O(1) instead of
  // walking the list every render.
  const usersByEmail = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of allUsers) {
      if (u.email) map.set(u.email, u);
    }
    return map;
  }, [allUsers]);

  // Set form of `value` so `selectedEmails.has(...)` stays O(1) when the
  // assignable list is rendered (the alternative — `value.includes` per row —
  // is O(value × assignable) per render).
  const selectedEmails = useMemo(() => new Set(value), [value]);

  // Each entry in `value` is a known-good email string; preserve it on the
  // resolved user object so downstream callers don't have to re-narrow. The
  // `Partial<User>` reflects the missing-from-allUsers case where we only know
  // the email — display falls back to email-only rendering.
  const selectedUsers = value.map((email): Partial<User> & { email: string } => {
    const found = usersByEmail.get(email);
    return { ...(found ?? {}), email };
  });

  const isLockedSelf = (email: string) => lockCurrentUser && email === currentUser?.email;

  const toggle = (email: string) => {
    if (selectedEmails.has(email)) {
      // Block deselecting the locked author from inside the Command list — the
      // X button is hidden in their badge but the list item is still clickable.
      if (isLockedSelf(email)) return;
      onChange(value.filter((e) => e !== email));
    } else {
      onChange([...value, email]);
    }
  };

  const remove = (email: string) => {
    if (isLockedSelf(email)) return;
    onChange(value.filter((e) => e !== email));
  };

  const triggerLabel =
    value.length === 0 ? placeholder : COPY.projects.userPicker.selectedCount(value.length);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 opacity-60" />
              {triggerLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          onWheel={(e: WheelEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          <Command>
            <CommandInput placeholder={COPY.projects.userPicker.searchPlaceholder} />
            <CommandList>
              <CommandEmpty>
                {assignable.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {COPY.projects.userPicker.emptyTitle}
                    <div className="mt-1 text-xs">{COPY.projects.userPicker.emptyHint}</div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {COPY.projects.userPicker.noResults}
                  </div>
                )}
              </CommandEmpty>
              <CommandGroup>
                {assignable.map((u) => {
                  const selected = selectedEmails.has(u.email);
                  return (
                    <CommandItem
                      key={u.email}
                      value={`${u.full_name ?? ''} ${u.email}`}
                      onSelect={() => toggle(u.email)}
                    >
                      <Check
                        className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm">{u.full_name || u.email}</span>
                        {u.full_name && (
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map((u) => {
            const isLocked = isLockedSelf(u.email);
            const label = u.full_name || u.email;
            return (
              <Badge
                key={u.email}
                variant="outline"
                className={cn('gap-1', isLocked && 'opacity-70')}
              >
                {label}
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => remove(u.email)}
                    aria-label={COPY.projects.userPicker.removeLabel(label)}
                    className="rounded-sm hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
