/**
 * B7-H — every API route handler must be produced by `withRoute`.
 *
 * B7-A…G2 moved all 124 route handlers onto one contract: the actor policy is
 * mandatory and fail-closed, refusals are non-enumerating, and an unexpected
 * exception never reaches the client. None of that holds for a handler written the
 * old way, and nothing about a raw `export async function POST` looks wrong in
 * review — it looks like every route in the repo did six weeks ago. This rule is
 * what stops the 125th route from quietly reopening the hole.
 *
 * What counts as compliant:
 *   export const GET = withRoute({ ... }, async (ctx) => { ... })
 *   export const PATCH = POST            // aliasing another compliant handler
 *
 * What is reported:
 *   export async function GET(request) { ... }
 *   export const GET = async (request) => { ... }
 *   export const GET = someOtherWrapper(...)
 *
 * Exemptions are listed by path in `eslint.config.mjs`, each with the reason it
 * cannot adopt the wrapper. A route not on that list has no way to opt out, which
 * is the point — the escape hatch is a reviewed edit to the config, not something
 * a handler can do to itself.
 */

/** The exports Next.js treats as route handlers. */
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

const WRAPPER = 'withRoute'

/** Normalises a filename to a forward-slash path relative to `app/api/`. */
function apiRelativePath(filename) {
  const normalised = filename.replace(/\\/g, '/')
  const marker = '/app/api/'
  const index = normalised.lastIndexOf(marker)
  return index === -1 ? null : normalised.slice(index + marker.length)
}

function isWrapperCall(node) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === WRAPPER
  )
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require every exported API route handler to be produced by the withRoute contract wrapper (B7-H).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // Paths relative to app/api, e.g. 'auth/callback/route.ts'.
          allow: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawHandler:
        "API route handler '{{name}}' is not produced by withRoute. Wrap it: `export const {{name}} = withRoute({ actor: { allow: [...] }, operation: '...' }, async (ctx) => { ... })`. If this route genuinely cannot use the wrapper, add its path to the documented allowlist in eslint.config.mjs and say why.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    const relative = apiRelativePath(filename)

    // Only route files under app/api are route handlers. Anything else — a page, a
    // server action, a lib module that happens to export a `GET` — is not this
    // rule's business.
    if (relative === null || !relative.endsWith('/route.ts')) return {}

    const allow = new Set(context.options[0]?.allow ?? [])
    if (allow.has(relative)) return {}

    // Names in this module bound to a withRoute(...) call, so `export const PATCH =
    // POST` is accepted when POST itself is compliant.
    const wrapperBound = new Set()

    function collectBindings(program) {
      for (const statement of program.body) {
        const declaration =
          statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
        if (!declaration || declaration.type !== 'VariableDeclaration') continue
        for (const declarator of declaration.declarations) {
          if (declarator.id.type === 'Identifier' && isWrapperCall(declarator.init)) {
            wrapperBound.add(declarator.id.name)
          }
        }
      }
    }

    function report(node, name) {
      context.report({ node, messageId: 'rawHandler', data: { name } })
    }

    return {
      Program(program) {
        collectBindings(program)

        for (const statement of program.body) {
          if (statement.type !== 'ExportNamedDeclaration' || !statement.declaration) continue
          const declaration = statement.declaration

          if (declaration.type === 'FunctionDeclaration') {
            const name = declaration.id?.name
            if (name && HTTP_METHODS.has(name)) report(declaration.id, name)
            continue
          }

          if (declaration.type !== 'VariableDeclaration') continue
          for (const declarator of declaration.declarations) {
            if (declarator.id.type !== 'Identifier') continue
            const name = declarator.id.name
            if (!HTTP_METHODS.has(name)) continue

            if (isWrapperCall(declarator.init)) continue
            if (
              declarator.init?.type === 'Identifier' &&
              wrapperBound.has(declarator.init.name)
            ) {
              continue
            }

            report(declarator.id, name)
          }
        }
      },
    }
  },
}

export default {
  rules: { 'require-with-route': rule },
}
