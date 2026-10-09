'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { Award, BookOpenCheck, ExternalLink, Sparkles, Trophy, UserPlus, type LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { ShareButton } from '@/components/portfolio/ShareButton'
import { PORTFOLIO_SETTINGS_HREF } from '@/lib/portfolio'
import { buildLinkedInCertificationUrl } from '@/lib/certificates/linkedin-url'
import {
  trackAchievementCelebrationViewed,
  trackAchievementCelebrationCtaClicked,
  type AchievementCelebrationCtaAction,
} from '@/lib/analytics'
import type {
  AchievementCelebration,
  CelebrationPortfolio,
  CertificateCelebration,
  ModuleCelebration,
} from '@/lib/api/contracts/achievement-celebration'

interface AchievementCelebrationModalProps {
  /** Open while non-null. */
  celebration: AchievementCelebration | null
  onClose: () => void
  /** Shows "Invite peers" on the Fellow variant. The modal does not close itself for it. */
  onInvitePeers?: () => void
}

interface CelebrationCopy {
  Icon: LucideIcon
  title: string
  /** What was earned: a career title, a module title, or nothing for Fellow. */
  subject: string | null
  description: string
}

const canSharePortfolio = (portfolio: CelebrationPortfolio) =>
  portfolio.isPublic && Boolean(portfolio.username)

// Fellow is a distinction, not a LinkedIn credential: its copy never calls it a certificate
// or credential, and it never gets the add-to-profile link.
function getCopy(celebration: AchievementCelebration): CelebrationCopy {
  const shareable = canSharePortfolio(celebration.portfolio)

  switch (celebration.kind) {
    case 'certificate': {
      const { type, moduleTitle, careerTitle } = celebration.certificate
      if (type === 'module') {
        return {
          Icon: Award,
          title: 'Module credential earned',
          subject: moduleTitle ? `${moduleTitle} · ${careerTitle}` : careerTitle,
          description:
            'Your credential is issued and anyone with the link can verify it. Add it to your LinkedIn profile next.',
        }
      }
      return {
        Icon: Award,
        title: 'Certificate earned',
        subject: careerTitle,
        description:
          'Your certificate is issued and anyone with the link can verify it. Add it to your LinkedIn profile next.',
      }
    }
    case 'capstone':
      return {
        Icon: Trophy,
        title: 'Capstone published',
        subject: celebration.capstone.moduleTitle,
        description: shareable
          ? 'Your reviewed capstone is live on your public portfolio. Share it with your network.'
          : 'Your capstone is reviewed and published. Make your portfolio public so others can see it.',
      }
    case 'fellow':
      return {
        Icon: Sparkles,
        title: "You're a PM Fellow",
        subject: null,
        description: shareable
          ? 'Your Fellow badge is live on your public portfolio. Share it with your network.'
          : 'Make your portfolio public to show your Fellow badge.',
      }
    case 'module':
      return {
        Icon: BookOpenCheck,
        title: 'Module complete',
        subject: celebration.module.title,
        description:
          celebration.capstone && !celebration.capstone.submitted
            ? 'You finished every lesson in this module. Its capstone turns what you learned into proof on your portfolio.'
            : 'You finished every lesson in this module. Keep the momentum going.',
      }
  }
}

function CertificateCtas({
  certificate,
  onAddToLinkedIn,
  onClose,
}: {
  certificate: CertificateCelebration['certificate']
  onAddToLinkedIn: () => void
  onClose: () => void
}) {
  const linkedInUrl = buildLinkedInCertificationUrl({
    certificateCode: certificate.code,
    careerTitle: certificate.careerTitle,
    type: certificate.type,
    issuedAt: certificate.issuedAt,
    verificationUrl: certificate.verificationUrl,
  })

  return (
    <>
      <a
        href={linkedInUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onAddToLinkedIn}
        title="Opens LinkedIn in a new tab"
        className={buttonVariants({ size: 'lg' })}
      >
        Add to LinkedIn Profile
        <ExternalLink aria-hidden="true" />
      </a>
      <Link
        href="/progress/certificates"
        onClick={onClose}
        className={buttonVariants({ variant: 'outline' })}
      >
        View certificate
      </Link>
    </>
  )
}

// A lighter moment than the other kinds: one next step, no share or invite.
function ModuleCta({
  capstone,
  onStartCapstone,
  onViewCapstone,
  onContinue,
}: {
  capstone: ModuleCelebration['capstone']
  onStartCapstone: () => void
  onViewCapstone: () => void
  onContinue: () => void
}) {
  if (capstone) {
    // Capstones unlock before a module's last lesson, so it may already be submitted.
    return capstone.submitted ? (
      <Link href={`/capstones/${capstone.slug}`} onClick={onViewCapstone} className={buttonVariants({ size: 'lg' })}>
        View capstone
      </Link>
    ) : (
      <Link href={`/capstones/${capstone.slug}`} onClick={onStartCapstone} className={buttonVariants({ size: 'lg' })}>
        Start the capstone
      </Link>
    )
  }
  return (
    <Link href="/academy" onClick={onContinue} className={buttonVariants({ size: 'lg' })}>
      Continue learning
    </Link>
  )
}

function PortfolioCta({
  portfolio,
  onShare,
  onPublish,
}: {
  portfolio: CelebrationPortfolio
  onShare: () => void
  onPublish: () => void
}) {
  if (portfolio.isPublic && portfolio.username) {
    // ShareButton owns its controls and its own `portfolio_share_clicked` event. A click that
    // bubbles up from any of its buttons is one use of this CTA.
    const handleClick = (event: MouseEvent<HTMLDivElement>) => {
      if ((event.target as Element).closest('button')) onShare()
    }
    return (
      <div className="flex justify-center" onClick={handleClick}>
        <ShareButton username={portfolio.username} name={portfolio.displayName} />
      </div>
    )
  }

  return (
    <Link href={PORTFOLIO_SETTINGS_HREF} onClick={onPublish} className={buttonVariants({ size: 'lg' })}>
      Publish portfolio
    </Link>
  )
}

function CelebrationContent({
  celebration,
  onClose,
  onInvitePeers,
}: {
  celebration: AchievementCelebration
  onClose: () => void
  onInvitePeers?: () => void
}) {
  const { Icon, title, subject, description } = getCopy(celebration)
  const trackCta = (action: AchievementCelebrationCtaAction) =>
    trackAchievementCelebrationCtaClicked(celebration.kind, action)

  return (
    <DialogContent
      data-testid="achievement-celebration-modal"
      data-kind={celebration.kind}
      className="sm:max-w-md p-6 text-center overflow-hidden"
    >
      <div className="flex justify-center pt-2 pb-1">
        <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 via-primary to-primary text-white shadow-xl ring-4 ring-primary/20 animate-in zoom-in-75 fade-in duration-300 motion-reduce:animate-none">
          <Icon aria-hidden="true" className="w-10 h-10 stroke-[2.2]" />
        </div>
      </div>

      <DialogHeader className="pt-2">
        <DialogTitle className="text-2xl font-bold font-serif leading-tight text-balance text-foreground">
          {title}
        </DialogTitle>
        {subject && <p className="text-sm font-semibold text-primary">{subject}</p>}
        <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          {description}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2.5 pt-2">
        {celebration.kind === 'certificate' ? (
          <CertificateCtas
            certificate={celebration.certificate}
            onAddToLinkedIn={() => trackCta('add_to_linkedin')}
            onClose={onClose}
          />
        ) : celebration.kind === 'module' ? (
          <ModuleCta
            capstone={celebration.capstone}
            onStartCapstone={() => {
              trackCta('start_capstone')
              onClose()
            }}
            onViewCapstone={() => {
              trackCta('view_capstone')
              onClose()
            }}
            onContinue={() => {
              trackCta('continue_learning')
              onClose()
            }}
          />
        ) : (
          <PortfolioCta
            portfolio={celebration.portfolio}
            onShare={() => trackCta('share_portfolio')}
            onPublish={() => {
              trackCta('publish_portfolio')
              onClose()
            }}
          />
        )}
        {celebration.kind === 'fellow' && onInvitePeers && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              trackCta('invite_peers')
              onInvitePeers()
            }}
          >
            <UserPlus aria-hidden="true" />
            Invite peers
          </Button>
        )}
      </div>
    </DialogContent>
  )
}

export function AchievementCelebrationModal({ celebration, onClose, onInvitePeers }: AchievementCelebrationModalProps) {
  // The last celebration stays rendered while the dialog animates out.
  const [shown, setShown] = useState(celebration)
  if (celebration && celebration !== shown) setShown(celebration)

  // One view per achievement: a re-render, a StrictMode effect re-run, or being hidden and
  // shown again by the host is not a second view.
  const viewedIds = useRef(new Set<string>())
  const notificationId = celebration?.notificationId
  const kind = celebration?.kind
  useEffect(() => {
    if (!notificationId || !kind || viewedIds.current.has(notificationId)) return
    viewedIds.current.add(notificationId)
    trackAchievementCelebrationViewed(kind)
  }, [notificationId, kind])

  return (
    <Dialog open={celebration !== null} onOpenChange={(open) => !open && onClose()}>
      {shown && <CelebrationContent celebration={shown} onClose={onClose} onInvitePeers={onInvitePeers} />}
    </Dialog>
  )
}
