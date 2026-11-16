/**
 * CQ-30: ban raw fetch('/api/...') calls in favor of the typed API client.
 *
 * Client code calling raw fetch directly bypasses the typed API client, risking
 * inconsistent error handling, silent failures, and lost request/incident correlation.
 *
 * What counts as compliant:
 *   apiGet('/api/endpoint')
 *   apiPost('/api/endpoint', { data })
 *   apiPatch('/api/endpoint', { data })
 *   apiDelete('/api/endpoint')
 *
 * What is reported:
 *   fetch('/api/endpoint')
 *   fetch(`/api/endpoint/${id}`)
 *
 * Exclusions:
 *   - lib/api/client.ts (implements the typed client)
 *   - Test files (__tests__, *.test.*, *.spec.*)
 */

function isTargetDirectory(filename) {
  const normalised = filename.replace(/\\/g, '/')
  return (
    normalised.includes('/app/') ||
    normalised.includes('/components/') ||
    normalised.includes('/hooks/') ||
    normalised.includes('/lib/')
  )
}

function isExcludedFile(filename) {
  const normalised = filename.replace(/\\/g, '/')
  if (normalised.endsWith('/lib/api/client.ts') || normalised.endsWith('/lib/api/client.js')) {
    return true
  }
  if (
    normalised.includes('/__tests__/') ||
    /\.(test|spec)\.[jt]sx?$/.test(normalised) ||
    normalised.includes('/e2e/')
  ) {
    return true
  }
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Ban raw fetch('/api/...') calls in app, components, hooks, and lib in favor of typed API client (CQ-30).",
    },
    schema: [],
    messages: {
      rawApiFetch:
        "Raw fetch to /api is banned. Use apiGet, apiPost, apiPatch, or apiDelete from '@/lib/api/client' instead (CQ-30).",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (!filename || !isTargetDirectory(filename) || isExcludedFile(filename)) {
      return {}
    }

    return {
      CallExpression(node) {
        if (!node.callee || node.callee.type !== 'Identifier' || node.callee.name !== 'fetch') {
          return
        }

        const firstArg = node.arguments[0]
        if (!firstArg) return

        let isApiFetch = false
        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          isApiFetch = firstArg.value.startsWith('/api/') || firstArg.value === '/api'
        } else if (firstArg.type === 'TemplateLiteral' && firstArg.quasis && firstArg.quasis.length > 0) {
          const raw = firstArg.quasis[0].value.raw
          isApiFetch = raw.startsWith('/api/') || raw === '/api'
        }

        if (isApiFetch) {
          context.report({
            node,
            messageId: 'rawApiFetch',
          })
        }
      },
    }
  },
}

const plugin = {
  rules: {
    'no-raw-api-fetch': rule,
  },
}

export default plugin
