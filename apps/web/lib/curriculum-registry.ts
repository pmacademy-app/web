/**
 * Canonical Curriculum Registry (Phase 1 Integrity Fix)
 *
 * Maps module slugs (and UI aliases) to their exact 10 stable `les_XXXXXX` lesson IDs.
 * Used for authoritative progress calculations, capstone status determination,
 * and reliable single-module progress resets.
 */

export const MODULE_LESSON_MAP: Record<string, string[]> = {
  foundations: [
    'les_zoyq8a', 'les_prrl23', 'les_0q4aih', 'les_04ix6b', 'les_aovj2y',
    'les_8trb62', 'les_5rbthl', 'les_8psivf', 'les_ji9a3x', 'les_qvbz2l',
  ],
  discovery: [
    'les_4kpbq6', 'les_3dziur', 'les_q9i0or', 'les_89s8go', 'les_ftgikz',
    'les_ta3qpf', 'les_4s6aif', 'les_9gu1rs', 'les_sgqm62', 'les_abduwx',
  ],
  design: [
    'les_bhb1lc', 'les_apad14', 'les_anj59m', 'les_6qg1gx', 'les_ejgikb',
    'les_emiqho', 'les_go5z1d', 'les_7r8npj', 'les_8prxyi', 'les_o9xo51',
  ],
  execution: [
    'les_091713', 'les_xtr1yz', 'les_kqyucz', 'les_vlut0b', 'les_85m4a2',
    'les_9kvh15', 'les_ryzl1c', 'les_9ep1op', 'les_soowpy', 'les_bzugx4',
  ],
  growth: [
    'les_0iss34', 'les_2s2fxc', 'les_qh7yql', 'les_nbz9ul', 'les_o7sbis',
    'les_nga5oo', 'les_55ex5m', 'les_4yd2s2', 'les_jpjusz', 'les_r918sq',
  ],
  leadership: [
    'les_vs8e8k', 'les_e61wb6', 'les_bxs9uj', 'les_4uxpqc', 'les_f7hmc8',
    'les_rto8ua', 'les_92tjmj', 'les_0dl7q7', 'les_bynvto', 'les_viunwn',
  ],
  technical: [
    'les_nyhd19', 'les_2h4woh', 'les_yhcrnj', 'les_43g66w', 'les_t2ezpj',
    'les_m2bfi1', 'les_md1mad', 'les_3zk3iz', 'les_ymfbn4', 'les_ilrn3g',
  ],
  tech_ai: [
    'les_nyhd19', 'les_2h4woh', 'les_yhcrnj', 'les_43g66w', 'les_t2ezpj',
    'les_m2bfi1', 'les_md1mad', 'les_3zk3iz', 'les_ymfbn4', 'les_ilrn3g',
  ],
  strategy: [
    'les_e18dsm', 'les_ju047h', 'les_7e3jva', 'les_la2hwd', 'les_0tbo74',
    'les_x2upyf', 'les_eyguum', 'les_7ndnsg', 'les_585ko0', 'les_td6v2u',
  ],
  platform: [
    'les_e18dsm', 'les_ju047h', 'les_7e3jva', 'les_la2hwd', 'les_0tbo74',
    'les_x2upyf', 'les_eyguum', 'les_7ndnsg', 'les_585ko0', 'les_td6v2u',
  ],
  capstone: [
    'les_cc0i59', 'les_iha8tr', 'les_dbv3t4', 'les_l483t4', 'les_iofm90',
    'les_zxebwb', 'les_801f2o', 'les_30s3xp', 'les_0j03yx', 'les_efapbf',
  ],
  advanced_strategy: [
    'les_cc0i59', 'les_iha8tr', 'les_dbv3t4', 'les_l483t4', 'les_iofm90',
    'les_zxebwb', 'les_801f2o', 'les_30s3xp', 'les_0j03yx', 'les_efapbf',
  ],
}

/**
 * Returns the list of 10 stable `les_XXXXXX` lesson IDs belonging to a module.
 */
export function getLessonIdsForModule(moduleSlug: string): string[] {
  const normalized = moduleSlug.toLowerCase().trim()
  return MODULE_LESSON_MAP[normalized] ?? []
}

/**
 * Returns the module slug to which a given stable lesson ID belongs.
 */
export function getModuleSlugForLessonId(lessonId: string): string | null {
  for (const [slug, ids] of Object.entries(MODULE_LESSON_MAP)) {
    if (ids.includes(lessonId)) {
      return slug
    }
  }
  return null
}
