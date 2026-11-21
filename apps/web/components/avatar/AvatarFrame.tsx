import type { ReactNode } from 'react'
import type { ResolvedFrame } from '@/lib/avatar/frames'
import { FRAME_LABELS } from '@/lib/avatar/frames'
import styles from './avatar-frame.module.css'

/**
 * An earned ring around an avatar (lib/avatar/frames.ts decides which one).
 *
 * `motion`:
 *   full   every animation for the frame (top bar, profile, public portfolio)
 *   quiet  only the live "studying now" pulse moves (lists and small avatars)
 *
 * The "moment" animations (the level ring filling, a badge popping in) play once when the
 * frame mounts: once per visit for the top bar, which stays mounted across navigation, and
 * once per view on a portfolio. Pure CSS, no client JavaScript, so this renders on the
 * server too. Reduced motion turns every animation off in CSS.
 */

const VIEW = 100
const C = 50
const R = 46
const CIRC = 2 * Math.PI * R

const PALETTE = {
  level: { track: '#CECBF6', ring: '#534AB7', chip: '#534AB7', chipText: '#EEEDFE' },
  streak: { track: '#9FE1CB', ring: '#1D9E75' },
  verified: { track: '#B5D4F4', ring: '#185FA5', chip: '#185FA5', chipText: '#E6F1FB' },
  certified: { ring: '#5F5E5A', chip: '#444441', chipText: '#F1EFE8' },
  top3: { ring: '#D85A30', chip: '#993C1D', chipText: '#FAECE7' },
  fellow: { ring: '#BA7517', inner: '#EF9F27' },
  live: '#639922',
} as const

function arc(fromDeg: number, toDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180
  const x1 = C + R * Math.cos(rad(fromDeg))
  const y1 = C + R * Math.sin(rad(fromDeg))
  const x2 = C + R * Math.cos(rad(toDeg))
  const y2 = C + R * Math.sin(rad(toDeg))
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function Chip({ text, fill, color, x, y, animate }: { text: string; fill: string; color: string; x: number; y: number; animate: boolean }) {
  const w = text.length > 2 ? 34 : 28
  return (
    <g className={animate ? styles.pop : undefined}>
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} fill={fill} stroke="#fff" strokeWidth={2.5} />
      <text x={x} y={y + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
        {text}
      </text>
    </g>
  )
}

export interface AvatarFrameProps {
  frame: ResolvedFrame
  /** Outer size in px, ring included. */
  size: number
  motion?: 'full' | 'quiet'
  /** Studying right now: adds the live pulse and dot. */
  live?: boolean
  /** The avatar itself (photo or initials), rendered inside the ring. */
  children: ReactNode
  className?: string
}

export function AvatarFrame({ frame, size, motion = 'full', live = false, children, className }: AvatarFrameProps) {
  const full = motion === 'full'
  const moment = full
  const innerSize = Math.round(size * 0.78)
  const showChips = size >= 56

  let ring: ReactNode = null
  switch (frame.kind) {
    case 'level': {
      const p = PALETTE.level
      const offset = CIRC * (1 - Math.max(0.04, frame.levelProgress))
      ring = (
        <>
          <circle cx={C} cy={C} r={R} fill="none" stroke={p.track} strokeWidth={4} />
          <circle
            className={moment ? styles.fill : undefined}
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={p.ring}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${C} ${C})`}
          />
          {showChips && <Chip text={`L${frame.level}`} fill={p.chip} color={p.chipText} x={80} y={84} animate={moment} />}
        </>
      )
      break
    }
    case 'streak': {
      const p = PALETTE.streak
      const segs = Array.from({ length: 7 }, (_, i) => i)
      const lit = frame.streakSegments
      // Studied today: the newest lit segment is solid. Not yet today: the next one breathes.
      const breathing = frame.studiedToday ? -1 : Math.min(lit, 6)
      ring = (
        <g fill="none" strokeWidth={5} strokeLinecap="round">
          {segs.map((i) => {
            const from = i * (360 / 7) + 6
            const to = (i + 1) * (360 / 7) - 6
            const on = i < lit
            const isBreathing = i === breathing
            return (
              <path
                key={i}
                d={arc(from, to)}
                stroke={on || isBreathing ? p.ring : p.track}
                className={isBreathing && full ? styles.breathe : undefined}
              />
            )
          })}
        </g>
      )
      break
    }
    case 'verified': {
      const p = PALETTE.verified
      ring = (
        <>
          <circle cx={C} cy={C} r={R} fill="none" stroke={p.track} strokeWidth={2} />
          {full && (
            <circle
              className={styles.sweep}
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke={p.ring}
              strokeWidth={2}
              strokeDasharray={`${CIRC * 0.18} ${CIRC * 0.82}`}
              transform={`rotate(-90 ${C} ${C})`}
            />
          )}
          {showChips && (
            <g className={moment ? styles.pop : undefined}>
              <circle cx={80} cy={80} r={13} fill={p.chip} stroke="#fff" strokeWidth={3} />
              <path d="M74 80 l4.5 4.5 l7.5 -9" fill="none" stroke={p.chipText} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}
        </>
      )
      break
    }
    case 'certified': {
      const p = PALETTE.certified
      ring = (
        <>
          <circle cx={C} cy={C} r={R} fill="none" stroke={p.ring} strokeWidth={2} />
          {showChips && <Chip text="CERT" fill={p.chip} color={p.chipText} x={50} y={94} animate={moment} />}
        </>
      )
      break
    }
    case 'top3': {
      const p = PALETTE.top3
      ring = (
        <>
          <circle
            className={full ? styles.spin : undefined}
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={p.ring}
            strokeWidth={3}
            strokeDasharray="7 5"
          />
          {showChips && <Chip text={`#${frame.weeklyRank ?? 1}`} fill={p.chip} color={p.chipText} x={80} y={14} animate={moment} />}
        </>
      )
      break
    }
    case 'fellow': {
      const p = PALETTE.fellow
      ring = (
        <>
          <circle cx={C} cy={C} r={R + 1} fill="none" stroke={p.ring} strokeWidth={2.5} />
          <circle className={full ? styles.spin : undefined} cx={C} cy={C} r={R - 4} fill="none" stroke={p.inner} strokeWidth={1.2} strokeDasharray="3 5" />
          {full && (
            <g className={styles.orbit}>
              <circle cx={C} cy={C - R - 1} r={3.5} fill={p.ring} />
            </g>
          )}
        </>
      )
      break
    }
  }

  return (
    <span
      className={`${styles.root}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, ['--circ' as string]: `${CIRC}` }}
      data-avatar-frame={frame.kind}
      data-live={live ? 'true' : undefined}
      title={FRAME_LABELS[frame.kind]}
    >
      <svg className={styles.ring} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" focusable="false">
        {live && <circle className={styles.pulse} cx={C} cy={C} r={R - 6} fill="none" stroke={PALETTE.live} strokeWidth={3} />}
        {ring}
        {live && <circle cx={18} cy={82} r={7} fill={PALETTE.live} stroke="#fff" strokeWidth={3} />}
      </svg>
      <span className={styles.inner} style={{ width: innerSize, height: innerSize }}>
        {children}
      </span>
    </span>
  )
}
