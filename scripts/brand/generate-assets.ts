import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { TOKENS } from '../../theme/tokens';
import {
  MARK_RING_PATH,
  MARK_GEM_PATH,
  MARK_ORIGIN,
  MARK_SIZE,
  MARK_COLORS,
} from './mark-source';

// Script runs via tsx (CJS semantics). sharp lives in apps/web/node_modules
// (single-package repo, no root package.json).
const require = createRequire(__filename);

const FONT_SERIF = "Georgia, 'Times New Roman', serif";
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

/**
 * Renders the two-tone mark (teal hexagonal ring + dark-navy gem) inside a
 * group that maps its logo.png pixel space into the given transform.
 */
function markGroup(transform: string, ringFill = MARK_COLORS.ring, gemFill = MARK_COLORS.gem): string {
  return (
    `<g transform="${transform}">` +
    `<path d="${MARK_RING_PATH}" fill="${ringFill}" fill-rule="evenodd"/>` +
    `<path d="${MARK_GEM_PATH}" fill="${gemFill}"/>` +
    `</g>`
  );
}

/** Group that places the mark at its natural origin inside a MARK_SIZE viewBox. */
function markGroupNatural(ringFill = MARK_COLORS.ring, gemFill = MARK_COLORS.gem): string {
  return markGroup(`translate(${-MARK_ORIGIN.x}, ${-MARK_ORIGIN.y})`, ringFill, gemFill);
}

/**
 * Group that centers the mark inside a square canvas with uniform padding.
 * Used by favicon / PWA icons / apple-touch.
 */
function markGroupSquare(canvas: number, padding: number, ringFill = MARK_COLORS.ring, gemFill = MARK_COLORS.gem): string {
  const scale = (canvas - padding * 2) / MARK_SIZE.height;
  const w = MARK_SIZE.width * scale;
  const x = (canvas - w) / 2;
  const y = padding;
  return markGroup(`translate(${round2(x)}, ${y}) scale(${round5(scale)}) translate(${-MARK_ORIGIN.x}, ${-MARK_ORIGIN.y})`, ringFill, gemFill);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round5 = (n: number) => Math.round(n * 100000) / 100000;

function buildIco(sizes: { size: number; png: Buffer }[]): Buffer {
  const count = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  // ICONDIR layout: 6-byte header, then ALL 16-byte directory entries, then
  // the image data. Offsets are relative to the start of the file.
  const entries: Buffer[] = [];
  let offset = 6 + 16 * count;
  for (const { size, png } of sizes) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    offset += png.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...sizes.map((s) => s.png)]);
}

async function generateBrandingAssets() {
  const rootDir = path.resolve(__dirname, '../..');
  const publicBrandDir = path.join(rootDir, 'apps/web/public/brand');
  const publicRootDir = path.join(rootDir, 'apps/web/public');
  const appDir = path.join(rootDir, 'apps/web/app');
  const sourceLogoPath = path.join(rootDir, 'docs/design/assets/logo.png');

  if (!fs.existsSync(sourceLogoPath)) {
    throw new Error(`Master logo file missing at ${sourceLogoPath}`);
  }

  const sharp = require(path.join(rootDir, 'apps/web/node_modules/sharp'));

  if (!fs.existsSync(publicBrandDir)) {
    fs.mkdirSync(publicBrandDir, { recursive: true });
  }

  // ─── 1. Vector assets ──────────────────────────────────────────────────────

  // logo-mark.svg — the approved two-tone mark at its natural aspect ratio.
  // Used for icon-only renderings (navbar/auth/sidebar collapse, BrandLogo icon).
  const markW = round2(MARK_SIZE.width);
  const markH = round2(MARK_SIZE.height);
  const logoMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markW} ${markH}" width="${markW}" height="${markH}" role="img" aria-label="Prodigy PM Academy mark">
  ${markGroupNatural()}
</svg>`;
  fs.writeFileSync(path.join(publicBrandDir, 'logo-mark.svg'), logoMarkSvg);

  // logo-mark-on-dark.svg — monochrome-light variant for dark surfaces
  // (Admin Console). Same geometry; single light mint fill so the silhouette
  // stays legible on near-black backgrounds.
  const logoMarkOnDarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markW} ${markH}" width="${markW}" height="${markH}" role="img" aria-label="Prodigy PM Academy mark">
  ${markGroupNatural(TOKENS.colors.dark.primary, TOKENS.colors.dark.primary)}
</svg>`;
  fs.writeFileSync(path.join(publicBrandDir, 'logo-mark-on-dark.svg'), logoMarkOnDarkSvg);

  // wordmark.svg — text-only lockup (Prodigy + PM ACADEMY), 600x200.
  const wordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200" role="img" aria-label="Prodigy PM Academy wordmark">
  <text x="0" y="126" font-family="${FONT_SERIF}" font-size="108" font-weight="600" fill="${MARK_COLORS.gem}">Prodigy</text>
  <text x="2" y="182" font-family="${FONT_SANS}" font-size="32" font-weight="600" letter-spacing="14" fill="${MARK_COLORS.ring}">PM ACADEMY</text>
</svg>`;
  fs.writeFileSync(path.join(publicBrandDir, 'wordmark.svg'), wordmarkSvg);

  // logo-full.svg — full lockup: mark + wordmark side by side (footer/hero/certificates).
  const markScale = 128 / MARK_SIZE.height; // mark rendered ~128px tall
  const markWidthPx = MARK_SIZE.width * markScale;
  const markX = 24;
  const markY = 36;
  const textX = Math.round(markX + markWidthPx + 44);
  const logoFullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" width="800" height="200" role="img" aria-label="Prodigy PM Academy">
  ${markGroup(`translate(${markX}, ${markY}) scale(${round5(markScale)}) translate(${-MARK_ORIGIN.x}, ${-MARK_ORIGIN.y})`)}
  <g transform="translate(${textX}, -8)">
    <text x="0" y="122" font-family="${FONT_SERIF}" font-size="96" font-weight="600" fill="${MARK_COLORS.gem}">Prodigy</text>
    <text x="2" y="182" font-family="${FONT_SANS}" font-size="32" font-weight="600" letter-spacing="12" fill="${MARK_COLORS.ring}">PM ACADEMY</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(publicBrandDir, 'logo-full.svg'), logoFullSvg);

  // favicon.svg — square browser-tab icon: two-tone mark centered on a canvas.
  const ICON_CANVAS = 512;
  const ICON_PADDING = 32;
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_CANVAS} ${ICON_CANVAS}" width="${ICON_CANVAS}" height="${ICON_CANVAS}">
  ${markGroupSquare(ICON_CANVAS, ICON_PADDING)}
</svg>`;
  fs.writeFileSync(path.join(publicRootDir, 'favicon.svg'), faviconSvg);

  // safari-pinned-tab.svg — Safari mask icon. Single-color silhouette (the
  // browser colors it via the mask-icon `color` attribute).
  const safariSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_CANVAS} ${ICON_CANVAS}" width="${ICON_CANVAS}" height="${ICON_CANVAS}">
  ${markGroupSquare(ICON_CANVAS, ICON_PADDING, 'black', 'black')}
</svg>`;
  fs.writeFileSync(path.join(publicBrandDir, 'safari-pinned-tab.svg'), safariSvg);

  // og-image.svg — 1200x630 social card composition.
  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${MARK_COLORS.gem}"/>
  ${markGroup(`translate(120, 228) scale(${round5(0.34)}) translate(${-MARK_ORIGIN.x}, ${-MARK_ORIGIN.y})`, '#FFFFFF', '#FFFFFF')}
  <text x="350" y="318" font-family="${FONT_SERIF}" font-size="88" font-weight="600" fill="#FFFFFF">Prodigy</text>
  <text x="352" y="382" font-family="${FONT_SANS}" font-size="34" font-weight="600" letter-spacing="16" fill="${MARK_COLORS.ring}">PM ACADEMY</text>
  <text x="352" y="432" font-family="${FONT_SANS}" font-size="24" fill="#FFD9A0">90 lessons. 9 modules. Free forever.</text>
</svg>`;

  // ─── 2. Raster assets (via sharp) ──────────────────────────────────────────

  // logo-mark.png — natural-aspect raster for emails (displayed ~32px tall).
  const markPng = await sharp(Buffer.from(logoMarkSvg)).resize({ height: 256, withoutEnlargement: true }).png().toBuffer();
  fs.writeFileSync(path.join(publicBrandDir, 'logo-mark.png'), markPng);

  const fullPng = await sharp(Buffer.from(logoFullSvg)).resize(480, 120).flatten({ background: '#FBFAF6' }).png().toBuffer();
  fs.writeFileSync(path.join(publicBrandDir, 'logo-full.png'), fullPng);

  const ogPng = await sharp(Buffer.from(ogSvg)).resize(1200, 630).png().toBuffer();
  fs.writeFileSync(path.join(publicBrandDir, 'og-image.png'), ogPng);

  // PWA / favicon rasters (mark centered on a square transparent canvas)
  const icon192 = await sharp(Buffer.from(faviconSvg)).resize(192, 192).png().toBuffer();
  const icon512 = await sharp(Buffer.from(faviconSvg)).resize(512, 512).png().toBuffer();
  const appleTouch = await sharp(Buffer.from(faviconSvg)).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(publicRootDir, 'icon-192.png'), icon192);
  fs.writeFileSync(path.join(publicRootDir, 'icon-512.png'), icon512);
  fs.writeFileSync(path.join(publicRootDir, 'apple-touch-icon.png'), appleTouch);

  // favicon.ico — multi-resolution ICO (16/32/48). Written ONLY to app/
  // (App Router convention — auto-served and auto-linked).
  const icoSizes = [16, 32, 48];
  const icoPngs: { size: number; png: Buffer }[] = [];
  for (const size of icoSizes) {
    const png = await sharp(Buffer.from(faviconSvg)).resize(size, size).png().toBuffer();
    icoPngs.push({ size, png });
  }
  const ico = buildIco(icoPngs);
  fs.writeFileSync(path.join(appDir, 'favicon.ico'), ico);

  // ─── 3. Remove stale / duplicate assets ────────────────────────────────────

  const stale = [
    path.join(publicRootDir, 'favicon.ico'), // superseded by app/favicon.ico
    path.join(publicBrandDir, 'twitter-card.png'),
    path.join(publicBrandDir, 'wordmark.png'),
  ];
  for (const file of stale) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  console.log(`✅ Successfully regenerated branding bundle from docs/design/assets/logo.png (mark ${markW}×${markH}, ring #${MARK_COLORS.ring.slice(1)}, gem #${MARK_COLORS.gem.slice(1)}).`);
}

generateBrandingAssets().catch((e) => {
  console.error('💥 Branding asset generation failed:', e);
  process.exit(1);
});
