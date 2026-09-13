import { ADMIN_LOGIN_PATH, formatLogoutFailures, logout, type LogoutRouter } from '@/lib/auth/logout'

/**
 * Signs the admin out of the console and returns them to the admin login page.
 * Shared by the AdminHeader and AdminSidebar sign-out controls so both behave
 * identically. The mechanics live in `lib/auth/logout.ts`, which is the single
 * client-side logout implementation; this is the admin destination on top of it.
 */
export async function signOutAdmin(router: LogoutRouter) {
  const result = await logout(router, { redirectTo: ADMIN_LOGIN_PATH })

  if (!result.ok) {
    // The user has already been navigated away; this records which step failed
    // so a session that outlived the click is diagnosable.
    console.error('[Admin] Sign out completed with failures:', formatLogoutFailures(result))
  }

  return result
}
