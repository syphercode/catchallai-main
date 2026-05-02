import { useAuth } from '@/lib/AuthContext';
import { UserRole } from '@/types/enums';

/** Thin wrapper over AuthContext that exposes the current authenticated user
 *  plus derived role flags. The user is fetched once on app boot inside
 *  AuthProvider via `base44.auth.me()`, so calling `useUser` in any number of
 *  components reuses that single source of truth — no per-component network
 *  calls and no duplicated `useQuery(['current-user'])` boilerplate.
 *
 *  `isAdmin` is true when *either* the global `role` or `social_media_role` is
 *  admin, matching the "admin in any context" semantic used elsewhere.
 *
 *  `refetchUser` re-fetches the user from the server and updates context
 *  state — call it after mutations that change the user record (profile
 *  edits, business switch, etc.) instead of invalidating a query cache.
 */
export function useUser() {
  const { user, isAuthenticated, isLoadingAuth, refetchUser } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN || user?.social_media_role === UserRole.ADMIN;
  const isViewer = user?.social_media_role === UserRole.VIEWER;

  return {
    user,
    isAuthenticated,
    isLoading: isLoadingAuth,
    isAdmin,
    isViewer,
    refetchUser,
  };
}
