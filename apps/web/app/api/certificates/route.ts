import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { issueCertificateWithStatus, getUserCertificates } from '@/lib/certificates-db'
import { dispatchCertificateGenerated } from '@/lib/certificates/issue-flow'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'certificates.read',
    summary: 'Unexpected failure fetching learner certificates',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const certificates = await getUserCertificates(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, certificates })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'certificates.issue',
    summary: 'Unexpected failure issuing a certificate',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()

    // Read here rather than via a declared schema: the pre-migration route used
    // `request.json().catch(() => ({}))`, so an absent or malformed body fell back
    // to a full-curriculum certificate instead of returning 400.
    const body = (await request.json().catch(() => ({}))) as { type?: string; moduleSlug?: string | null }
    const type = body.type || 'full_curriculum'
    const moduleSlug = body.moduleSlug || null

    const { certificate, created } = await issueCertificateWithStatus(supabase, userId, type, moduleSlug)

    // Announce (in-app + email) only when this request created the certificate. A
    // repeated POST returns the existing row and stays silent; the dispatch never throws.
    if (created) {
      // Re-read for profile metadata only — authorization is already settled by the
      // actor policy above. The call is memoized on this Request, so it is the same
      // resolution `resolveActor` performed and costs nothing.
      const user = await getAuthenticatedUserFromRequest(request).catch(() => null)
      await dispatchCertificateGenerated(certificate, {
        email: user?.email,
        name: user?.user_metadata?.full_name || user?.email?.split('@')[0],
      })
    }

    return NextResponse.json({ success: true, certificate })
  }
)
