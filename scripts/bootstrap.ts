import path from 'path';
import module from 'module';

/**
 * Universal Node.js / tsx module resolution bootstrap.
 *
 * Ensures that scripts located outside apps/web (such as scripts/compiler/compile.ts,
 * scripts/brand/generate-assets.ts) can resolve dependencies installed in apps/web/node_modules
 * when building on Vercel, CI, or clean deployments where root node_modules does not exist.
 */
const webNodeModules = path.resolve(__dirname, '../apps/web/node_modules');

if (typeof module !== 'undefined' && Array.isArray(module.paths)) {
  if (!module.paths.includes(webNodeModules)) {
    module.paths.unshift(webNodeModules);
  }
}

if (process.env.NODE_PATH) {
  if (!process.env.NODE_PATH.includes(webNodeModules)) {
    process.env.NODE_PATH = `${webNodeModules}${path.delimiter}${process.env.NODE_PATH}`;
  }
} else {
  process.env.NODE_PATH = webNodeModules;
}

if (typeof require !== 'undefined' && require.main && Array.isArray(require.main.paths)) {
  if (!require.main.paths.includes(webNodeModules)) {
    require.main.paths.unshift(webNodeModules);
  }
}
