/**
 * Granting admin needs the acting admin's password (PATCH /api/admin/users returns
 * STEP_UP_REQUIRED without it). The role toggle collects it in the confirm dialog and sends it
 * only when promoting; demotion stays password-free.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const toggle = fs.readFileSync(path.join(__dirname, '../admin/UserRoleToggle.tsx'), 'utf8')
const dialog = fs.readFileSync(path.join(__dirname, '../admin/AdminConfirmDialog.tsx'), 'utf8')

describe('admin role toggle step-up', () => {
  it('sends currentPassword only when promoting', () => {
    expect(toggle).toMatch(/\.\.\.\(nextRole \? \{ currentPassword: password \} : \{\}\)/)
  })

  it('renders a password field for promotion and disables confirm until it is filled', () => {
    expect(toggle).toMatch(/type="password"/)
    expect(toggle).toMatch(/autoComplete="current-password"/)
    expect(toggle).toMatch(/confirmDisabled=\{nextRole && currentPassword\.length === 0\}/)
  })

  it('clears the password when the dialog closes', () => {
    expect(toggle).toMatch(/setCurrentPassword\(''\)/)
  })

  it('the confirm dialog accepts extra content and a disabled confirm button', () => {
    expect(dialog).toMatch(/children\?: React\.ReactNode/)
    expect(dialog).toMatch(/disabled=\{confirmDisabled\}/)
  })
})
