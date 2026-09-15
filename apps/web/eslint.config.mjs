import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import prodily from "./eslint-rules/require-with-route.mjs";

/**
 * B7-H — routes that deliberately do not use `withRoute`.
 *
 * This list is the complete set of exemptions. Each entry is a route that cannot
 * adopt the contract for a structural reason, not a convenience. Adding to it is a
 * reviewed change; it is not something a route can do to itself.
 *
 * Every one of these still authenticates — they are exempt from the *wrapper*, not
 * from authorization.
 */
const WRAPPER_EXEMPT_ROUTES = [
  // Authenticates by HMAC over the RAW request body. `resolveActor` cannot model
  // this without reading the body, which would consume the stream the route still
  // needs to verify the signature. Verification is constant-time and fail-closed.
  "auth/send-email-hook/route.ts",

  // Redirect-only browser endpoint: every path ends in `NextResponse.redirect`, and
  // there is no JSON envelope to put an error into. Wrapping it would let a failed
  // navigation receive an error envelope instead of the error page.
  "auth/callback/route.ts",

  // Same raw-body HMAC constraint as send-email-hook — Svix/Brevo signatures are
  // computed over the exact bytes received. See the note in lib/api/actor.ts.
  "email/webhooks/route.ts",
];

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "test-results/**",
      "coverage/**",
      "next-env.d.ts",
      "scripts/**",
    ],
  },
  {
    files: ["app/api/**/route.ts"],
    plugins: { prodily },
    rules: {
      "prodily/require-with-route": ["error", { allow: WRAPPER_EXEMPT_ROUTES }],
    },
  },
];

export default eslintConfig;
