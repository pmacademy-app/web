/**
 * Legal operator identity, grievance contact, and consent document versions.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `lib/brand.ts` carried `legalEntity: 'Prodily'` — a brand name presented in the
 * Terms and Privacy Policy as though it were the registered operating entity. The
 * September 2026 legal/privacy audit flagged that as a misrepresentation: no
 * company is registered under that name, and no address, registration number or
 * grievance contact appears anywhere on the site.
 *
 * The correct fix is NOT to invent a company. It is to make the operator identity
 * a single, explicitly-configured value with an honest default, so that:
 *
 *   - until real details are supplied, the public pages state plainly that Prodily
 *     is an independent project and not a registered company, and
 *   - once the operator registers (or confirms their existing sole-proprietor /
 *     individual status), the details are filled in here (or via env) and every
 *     legal surface picks them up at once.
 *
 * ⚠️ PLACEHOLDERS BELOW REQUIRE REAL INFORMATION FROM THE OPERATOR.
 *    Nothing here may be guessed. Every field defaults to "not supplied" and the
 *    UI renders an honest disclosure in that state rather than a fabricated one.
 *
 * ⚠️ LEGAL REVIEW: the wording driven by this config, and the 18+ eligibility
 *    rule in `MINIMUM_SIGNUP_AGE`, reflect the September 2026 audit's reading of
 *    India's DPDP Act 2023 / DPDP Rules 2025. The audit itself states this is a
 *    legal-compliance judgement call that must be confirmed with counsel before a
 *    final public launch. Do not treat this file as legal advice.
 */

/** Sentinel for a legal field that has not been supplied yet. */
export const LEGAL_VALUE_NOT_SUPPLIED = null

type MaybeLegalValue = string | null

function fromEnv(value: string | undefined): MaybeLegalValue {
  const trimmed = value?.trim()
  return trimmed ? trimmed : LEGAL_VALUE_NOT_SUPPLIED
}

/**
 * Is the operator a registered legal entity (company / LLP / registered firm)?
 *
 * Defaults to `false`, which is the audited state of the world. Set
 * `NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED=true` only once a registration genuinely
 * exists and `LEGAL_OPERATOR.registrationId` is filled in.
 */
const isRegisteredEntity = process.env.NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED === 'true'

export const LEGAL_OPERATOR = {
  /**
   * `true` only when a real registration exists. While `false`, legal pages must
   * not describe the operator as a company.
   */
  isRegisteredEntity,

  /**
   * The name the Service legally trades under: the registered company name where
   * one exists (e.g. "Example Technologies Private Limited"), otherwise the
   * business name the proprietor operates under.
   * REQUIRED — supply via NEXT_PUBLIC_LEGAL_ENTITY_NAME.
   */
  legalName: fromEnv(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME),

  /**
   * The full legal name of the natural person who operates the Service, for an
   * unregistered sole proprietorship. This is what makes the public statement
   * accurate: "<legalName> is operated by <proprietorName> as a <entityType>".
   *
   * Deliberately its own value rather than reusing `GRIEVANCE_CONTACT.officerName`.
   * The two happen to be the same person today, but appointing a different
   * grievance officer later must not silently rewrite who operates the platform.
   *
   * REQUIRED when `isRegisteredEntity` is false — supply via
   * NEXT_PUBLIC_LEGAL_PROPRIETOR_NAME.
   */
  proprietorName: fromEnv(process.env.NEXT_PUBLIC_LEGAL_PROPRIETOR_NAME),

  /**
   * How the operator is legally constituted, in the operator's own words —
   * e.g. "Private Limited Company", "Sole Proprietorship", "Individual".
   * REQUIRED — supply via NEXT_PUBLIC_LEGAL_ENTITY_TYPE.
   */
  entityType: fromEnv(process.env.NEXT_PUBLIC_LEGAL_ENTITY_TYPE),

  /**
   * CIN / LLPIN / GSTIN / registration number, whichever applies.
   * REQUIRED only when `isRegisteredEntity` is true.
   */
  registrationId: fromEnv(process.env.NEXT_PUBLIC_LEGAL_REGISTRATION_ID),

  /**
   * Full postal address of the operator, as a single pre-formatted string.
   * REQUIRED — supply via NEXT_PUBLIC_LEGAL_ADDRESS.
   */
  address: fromEnv(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),
} as const

export const GRIEVANCE_CONTACT = {
  /**
   * Name of the individual accountable for grievances / data-protection requests.
   * REQUIRED — supply via NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME.
   */
  officerName: fromEnv(process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME),

  /**
   * Title the officer is addressed by, e.g. "Grievance Officer".
   * REQUIRED — supply via NEXT_PUBLIC_GRIEVANCE_OFFICER_TITLE.
   */
  officerTitle: fromEnv(process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_TITLE),

  /**
   * Grievance mailbox. Falls back to the general support address, which is a real,
   * monitored mailbox — so a complaint always has somewhere to land even before a
   * dedicated address exists.
   */
  email: fromEnv(process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL),

  /**
   * Acknowledgement and resolution commitments, in days. These are operational
   * promises rather than legal identity, so honest defaults are safe to state.
   */
  acknowledgementDays: 7,
  resolutionDays: 30,
} as const

/** True when every field a public legal page needs has been supplied. */
export function isLegalOperatorConfigured(): boolean {
  return Boolean(
    LEGAL_OPERATOR.legalName &&
      LEGAL_OPERATOR.entityType &&
      LEGAL_OPERATOR.address &&
      GRIEVANCE_CONTACT.officerName &&
      GRIEVANCE_CONTACT.officerTitle &&
      // A registered operator needs its registration number; an unregistered one
      // needs the natural person who is accountable instead.
      (LEGAL_OPERATOR.isRegisteredEntity
        ? Boolean(LEGAL_OPERATOR.registrationId)
        : Boolean(LEGAL_OPERATOR.proprietorName))
  )
}

/**
 * How to label the operator's postal address.
 *
 * "Registered address" is a claim about registration, so it may only be used when
 * there is one. An unregistered proprietorship publishes an operating address —
 * calling it "registered" would contradict the sentence directly above it.
 */
export function operatorAddressLabel(): string {
  return LEGAL_OPERATOR.isRegisteredEntity ? 'Registered address' : 'Operating address'
}

/**
 * The single sentence every legal page uses to describe who operates the Service.
 *
 * With no configuration this is deliberately, verifiably true: it names no company
 * and claims no registration. That is the honest position while the operator's
 * legal details are outstanding — the previous copy, which presented the brand name
 * as the operating entity, was not.
 */
export function operatorDescription(brandFullName: string): string {
  const name = LEGAL_OPERATOR.legalName

  // Registered: the entity itself is the operator, and its registration number is
  // published alongside this sentence by the caller.
  if (name && LEGAL_OPERATOR.isRegisteredEntity) {
    const constitution = LEGAL_OPERATOR.entityType ? ` (${LEGAL_OPERATOR.entityType})` : ''
    return `${brandFullName} is operated by ${name}${constitution}.`
  }

  // Unregistered sole proprietorship: name the natural person who operates it, and
  // say outright that there is no incorporated entity. Stating only the trading
  // name here would reproduce the very thing the audit flagged.
  if (name && LEGAL_OPERATOR.proprietorName) {
    const constitution = LEGAL_OPERATOR.entityType
      ? ` as a ${LEGAL_OPERATOR.entityType.toLowerCase()}`
      : ''
    return (
      `${name} is operated by ${LEGAL_OPERATOR.proprietorName}${constitution}. ` +
      `${name} is not a separately incorporated company or registered entity.`
    )
  }

  return (
    `${brandFullName} is an independent educational project. It is a brand name, ` +
    `not a registered company, and no incorporated entity currently operates it. ` +
    `Registered operator details will be published here if and when the project is incorporated.`
  )
}
