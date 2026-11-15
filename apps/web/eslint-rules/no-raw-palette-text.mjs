/**
 * UX-04 / AG-18: ban raw palette text color classes in favor of semantic design tokens.
 *
 * Raw palette text colors (text-emerald-*, text-amber-*, text-blue-*, text-purple-*, etc.)
 * frequently fail WCAG AA 4.5:1 contrast requirements against the cream background and
 * bypass the centralized design token system.
 *
 * What counts as compliant:
 *   text-success
 *   text-warning
 *   text-info
 *   text-ai
 *   text-danger
 *   text-ink-muted
 *
 * What is reported:
 *   text-{emerald,amber,blue,purple,green,red,yellow}-{300..600}
 */

const RAW_PALETTE_TEXT_REGEX = /\btext-(?:emerald|amber|blue|purple|green|red|yellow)-(?:300|400|500|600)\b/

function isTargetDirectory(filename) {
  const normalised = filename.replace(/\\/g, '/')
  return (
    normalised.includes('/app/') ||
    normalised.includes('/components/') ||
    normalised.includes('/blocks/') ||
    normalised.includes('/renderer/')
  )
}

function isExcludedFile(filename) {
  const normalised = filename.replace(/\\/g, '/')
  return (
    normalised.includes('/__tests__/') ||
    /\.(test|spec)\.[jt]sx?$/.test(normalised) ||
    normalised.includes('/e2e/')
  )
}

function checkString(context, node, rawText) {
  if (typeof rawText !== 'string') return
  const match = rawText.match(RAW_PALETTE_TEXT_REGEX)
  if (match) {
    context.report({
      node,
      messageId: 'noRawPaletteText',
      data: {
        rawClass: match[0],
      },
    })
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban raw palette text color classes in app, components, blocks, and renderer in favor of semantic tokens (AG-18).',
    },
    schema: [],
    messages: {
      noRawPaletteText:
        'Raw palette text color class "{{rawClass}}" is banned. Use semantic tokens like text-success, text-warning, text-info, text-ai, or text-danger instead (AG-18).',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (!filename || !isTargetDirectory(filename) || isExcludedFile(filename)) {
      return {}
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkString(context, node, node.value)
        }
      },
      TemplateElement(node) {
        if (node.value && typeof node.value.raw === 'string') {
          checkString(context, node, node.value.raw)
        }
      },
    }
  },
}

const plugin = {
  rules: {
    'no-raw-palette-text': rule,
  },
}

export default plugin
