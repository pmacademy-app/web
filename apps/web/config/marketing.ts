/**
 * Marketing homepage constants: the single place for sample links, demo labels and
 * the capstone list the homepage shows.
 *
 * Server-side only in practice. HOME_CAPSTONES is derived from `config/capstones.ts`,
 * which carries every capstone's starter template, so importing this file from a
 * client island would ship those templates to the browser. Client islands receive
 * the values they need as props instead.
 */

import { CAPSTONE_DEFINITIONS, type CapstoneDefinition } from '@/config/capstones'

/**
 * A real, public learner portfolio used as the homepage's sample (owner decision).
 * No homepage link points here yet: restore the link once the exemplar portfolio is finished.
 */
export const SAMPLE_PORTFOLIO_PATH = '/p/adityagangwani'

/** One line under every illustrative mock on the homepage. */
export const ILLUSTRATION_CAPTION = 'Illustration. Content written for demonstration.'

/** The only learner name any homepage mock may show. */
export const SAMPLE_LEARNER_NAME = 'Sample Learner'

/** Exported render of the certificate card, labelled "Sample certificate" wherever shown. */
export const SAMPLE_CERTIFICATE_SRC = '/marketing/sample-certificate.jpg'
export const SAMPLE_CERTIFICATE_LABEL = 'Sample certificate'

export type HomeCapstoneSkill = CapstoneDefinition['competencyCluster']

export interface HomeCapstone {
  /** Module and capstone number, 1 to 9. */
  number: number
  moduleSlug: string
  moduleTitle: string
  /** Display title. Matches config/capstones.ts except where overridden below. */
  title: string
  /** Competency cluster; pair with `var(--color-skill-<skill>)` for colour. */
  skill: HomeCapstoneSkill
  deliverableType: string
}

/** The nine real capstones, in module order, with homepage-safe titles. */
export const HOME_CAPSTONES: readonly HomeCapstone[] = Object.values(CAPSTONE_DEFINITIONS)
  .map((def): HomeCapstone => {
    // moduleNumber and moduleTitle come from MODULE_META via config/capstones.ts.
    return {
      number: def.moduleNumber,
      moduleSlug: def.moduleSlug,
      moduleTitle: def.moduleTitle,
      title: def.title,
      skill: def.competencyCluster,
      deliverableType: def.deliverableType,
    }
  })
  .sort((a, b) => a.number - b.number)

/** Zero-padded index for numbered ledgers and steps: 1 -> "01". */
export function padIndex(n: number): string {
  return String(n).padStart(2, '0')
}
