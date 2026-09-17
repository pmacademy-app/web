/**
 * B11-C — ban raw <button> in components/ in favor of the shared Button primitive.
 *
 * B11-A extended `components/ui/button.tsx` to cover observed variants and adopted
 * it across high-traffic surfaces. This rule ensures new components and ongoing feature
 * work use the accessible design system primitive rather than ad-hoc HTML buttons.
 *
 * What counts as compliant:
 *   <Button ...>Label</Button>
 *   <Button variant="outline" ...>Action</Button>
 *
 * What is reported:
 *   <button type="button" ...>Label</button>
 *
 * `components/ui/button.tsx` is inherently exempt because it defines the primitive.
 * Legacy unmigrated components are tracked in the documented allowlist in
 * `eslint.config.mjs` until converted during normal feature work.
 */

/** Normalises a filename to a forward-slash path relative to `components/`. */
function componentsRelativePath(filename) {
  const normalised = filename.replace(/\\/g, '/')
  const marker = '/components/'
  const index = normalised.lastIndexOf(marker)
  return index === -1 ? null : normalised.slice(index + marker.length)
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban raw <button> elements in components/ in favor of the shared Button primitive (B11-C).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawButton:
        "Raw <button> is banned in components/. Use the shared Button primitive from '@/components/ui/button' instead (B11-C). If this is an existing legacy component undergoing migration, add its path to the documented allowlist in eslint.config.mjs.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    const relative = componentsRelativePath(filename)

    // Only components under components/ are checked.
    if (relative === null) return {}

    // components/ui/button.tsx is the implementation of the primitive itself.
    if (relative === 'ui/button.tsx') return {}

    const allow = new Set(context.options[0]?.allow ?? [])
    if (allow.has(relative)) return {}

    return {
      JSXOpeningElement(node) {
        if (node.name && node.name.type === 'JSXIdentifier' && node.name.name === 'button') {
          context.report({
            node,
            messageId: 'rawButton',
          })
        }
      },
    }
  },
}

const plugin = {
  rules: {
    'no-raw-button': rule,
  },
}

export default plugin

