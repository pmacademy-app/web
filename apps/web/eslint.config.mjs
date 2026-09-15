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
  {
    // B8-G — `as unknown as` is banned inside the typed data layer.
    //
    // `lib/db/` exists because that cast, repeated at every data-access site,
    // erased the generated schema types and let F-COR-1 ship: a query selecting a
    // column that does not exist, whose error was then discarded. The layer is only
    // worth having while it cannot acquire the habit it was built to remove.
    //
    // Scoped to `lib/db/` deliberately. A repo-wide purge is explicitly out of
    // scope — most remaining casts are in tests and admin aggregation and carry no
    // correctness risk, so banning them everywhere would be churn without benefit.
    //
    // The selector matches the `unknown` hop of a double assertion and leaves an
    // ordinary `x as T` alone, which is still legitimate where a narrowing is
    // genuinely known-safe.
    files: ["lib/db/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAsExpression > TSUnknownKeyword",
          message:
            "`as unknown as` is banned in lib/db/. This layer must be written against the generated types in types/database.ts — that cast is what hid F-COR-1. If a type is genuinely missing (an RPC absent from the generated types, say), keep the cast at the call site outside lib/db/ and document why.",
        },
      ],
    },
  },
];

export default eslintConfig;
