/**
 * Regenerates the marketing/README screenshots.
 *
 *   npm run dev            # in one terminal
 *   npm run screenshots    # in another
 *
 * Renders the real frontend in headless Chromium against a fake Tauri
 * backend (see mock-tauri.js), drives the actual toolbar and canvas with
 * real mouse input, and captures the result. Nothing here reaches into the
 * app's internals: every annotation in the output was drawn the way a user
 * draws it, so a shot can't show a state the UI can't actually produce.
 *
 * Why not screenshot the native window? It would have to be posed by hand
 * every time, which is exactly what makes marketing assets go stale.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { mockTauri } from "./mock-tauri.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "docs", "screenshots");
const APP_URL = process.env.SHOTA_URL ?? "http://localhost:1420/";

const EDITOR = { width: 1360, height: 860 };
// The stand-in capture, rendered at 2x so the shots stay sharp when the
// editor scales it down to fit.
const SAMPLE = { width: 1440, height: 780 };
const SAMPLE_SCALE = 2;
const IMAGE = { width: SAMPLE.width * SAMPLE_SCALE, height: SAMPLE.height * SAMPLE_SCALE };

// Mirrors fitScale/centeredView in src/features/zoom/viewTransform.ts. Kept
// in sync by hand, which is fine for a tooling script — if it drifts, shots
// land in the wrong place and it's obvious on sight.
const FIT_PADDING = 40;

async function renderSample(browser) {
  const page = await browser.newPage({ viewport: SAMPLE, deviceScaleFactor: SAMPLE_SCALE });
  await page.goto(pathToFileURL(join(HERE, "fixtures", "sample-app.html")).href);
  const png = await page.screenshot();
  await page.close();
  return png;
}

async function openEditor(browser, captureBase64) {
  const page = await browser.newPage({ viewport: EDITOR, deviceScaleFactor: 2 });
  await page.addInitScript(mockTauri({ label: "editor", captureBase64 }));
  await page.goto(APP_URL);
  // The editor renders nothing at all until its image has decoded, so this
  // is both "loaded" and "ready to be drawn on".
  await page.waitForSelector(".editor-window canvas", { timeout: 20_000 });
  await page.waitForTimeout(700);
  return page;
}

/**
 * Where a point on the *captured image* currently sits on screen.
 *
 * Coordinates have to be image-relative, not canvas-relative: the canvas is
 * a viewport onto a zoomed, centred image, so a fraction of the canvas box
 * lands somewhere arbitrary on the picture. Getting this wrong is silent —
 * the annotation is drawn perfectly, just not over the thing it's meant to
 * point at.
 */
async function imagePoint(page, fx, fy) {
  const box = await page.locator(".canvas").boundingBox();
  const scale = Math.min(
    (box.width - FIT_PADDING) / IMAGE.width,
    (box.height - FIT_PADDING) / IMAGE.height,
    1,
  );
  const left = box.x + (box.width - IMAGE.width * scale) / 2;
  const top = box.y + (box.height - IMAGE.height * scale) / 2;
  return { x: left + IMAGE.width * scale * fx, y: top + IMAGE.height * scale * fy };
}

async function drag(page, from, to, steps = 18) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function dragOn(page, a, b, steps) {
  await drag(page, await imagePoint(page, a[0], a[1]), await imagePoint(page, b[0], b[1]), steps);
}

async function clickOn(page, fx, fy) {
  const p = await imagePoint(page, fx, fy);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(140);
}

/** Presses a tool's keyboard shortcut, the same letter the toolbar advertises. */
async function tool(page, key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(140);
}

/**
 * Drops the selection so no transform handles end up in the shot — by
 * clicking the empty canvas *outside* the image, which is what actually
 * clears it (Escape isn't bound to deselect).
 */
async function deselect(page) {
  await tool(page, "v");
  const box = await page.locator(".canvas").boundingBox();
  await page.mouse.click(box.x + 12, box.y + box.height - 12);
  await page.waitForTimeout(200);
}

/**
 * Wraps a raw shot in a rounded border and a soft drop shadow, on
 * transparency.
 *
 * Baked into the pixels rather than applied with CSS because GitHub strips
 * style attributes from READMEs — a `box-shadow` on the <img> tag is simply
 * dropped. Without it the editor's own near-white chrome dissolves into
 * GitHub's white page and the window looks like it has no edges.
 *
 * Border *and* shadow, not just the shadow: on GitHub's dark theme a soft
 * dark shadow is invisible, and the 1px edge is what still separates the
 * window from the page. Transparent padding rather than a filled backdrop,
 * so the result drops onto a light or dark page equally well.
 */
async function frame(browser, png) {
  const page = await browser.newPage({ viewport: { width: 1980, height: 1320 } });
  // Every dimension here is doubled, because the shot is a 2x asset: the
  // README renders it at half this width, so a 1px border would land as a
  // half-pixel and disappear. Design the frame at the size it is *displayed*
  // and then double it — 3px reads as a crisp 1.5px, not as nothing.
  await page.setContent(`
    <style>
      html, body { margin: 0; background: transparent; }
      .pad { display: inline-block; padding: 60px; }
      img {
        display: block;
        width: 1760px;
        height: auto;
        border-radius: 20px;
        border: 3px solid rgba(101, 106, 120, 0.55);
        box-shadow: 0 34px 80px rgba(12, 14, 22, 0.34), 0 6px 20px rgba(12, 14, 22, 0.18);
      }
    </style>
    <div class="pad"><img src="data:image/png;base64,${png.toString("base64")}"></div>
  `);
  const el = page.locator(".pad");
  // The padding is what gives the shadow somewhere to land: an element
  // screenshot clips to the element's own box, and a shadow falls outside it.
  const framed = await el.screenshot({ omitBackground: true });
  await page.close();
  return framed;
}

async function shoot(browser, page, name) {
  await page.waitForTimeout(400);
  const raw = await page.screenshot();
  await writeFile(join(OUT, `${name}.png`), await frame(browser, raw));
  console.log(`  wrote docs/screenshots/${name}.png`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  console.log("rendering sample capture…");
  const samplePng = await renderSample(browser);
  const sampleBase64 = samplePng.toString("base64");
  await writeFile(join(OUT, "sample-capture.png"), samplePng);

  // ---- Hero: redact a secret, number the steps, point at something -----
  console.log("editor-annotated…");
  {
    const page = await openEditor(browser, sampleBase64);

    // Fractions are of the captured image, measured off a rendered frame.
    // Aim them at text or edges, never at flat colour: a blur over blank
    // white is invisible, which reads as the tool being broken.
    await tool(page, "b");
    await dragOn(page, [0.583, 0.212], [0.962, 0.268]); // the access key

    await tool(page, "n");
    await clickOn(page, 0.192, 0.388); // beside each rollout step
    await clickOn(page, 0.192, 0.423);
    await clickOn(page, 0.192, 0.457);

    await tool(page, "a");
    await dragOn(page, [0.40, 0.10], [0.565, 0.198]); // pointing at the redaction

    await deselect(page);
    await shoot(browser, page, "editor-annotated");
    await page.close();
  }

  // ---- Highlighter --------------------------------------------------------
  console.log("editor-highlighter…");
  {
    const page = await openEditor(browser, sampleBase64);
    await tool(page, "h");
    for (const y of [0.596, 0.627, 0.657]) {
      await dragOn(page, [0.207, y], [0.50, y], 26);
      await page.waitForTimeout(140);
    }
    await deselect(page);
    await shoot(browser, page, "editor-highlighter");
    await page.close();
  }

  // ---- Spotlight ----------------------------------------------------------
  console.log("editor-spotlight…");
  {
    const page = await openEditor(browser, sampleBase64);
    await tool(page, "s");
    await dragOn(page, [0.186, 0.127], [0.975, 0.286]);
    await deselect(page);
    await shoot(browser, page, "editor-spotlight");
    await page.close();
  }

  await browser.close();
  console.log("\ndone — docs/screenshots/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
