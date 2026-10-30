import { chromium } from 'playwright';

export async function openWebsite(baseURL) {
  if (!baseURL) throw new Error('ALIEN_SITE_BASE is missing.');

  const base = new URL(baseURL);
  if (base.protocol !== 'https:') {
    throw new Error('ALIEN_SITE_BASE must be an HTTPS URL.');
  }

  const moduleURL = new URL('alien-api.js', base).href;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce'
  });

  let apiPage;
  let queue = Promise.resolve();

  function serial(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }

  async function readyAPI() {
    if (!apiPage || apiPage.isClosed()) {
      const candidate = await context.newPage();
      try {
        const response = await candidate.goto(new URL('api.html', base).href, {
          waitUntil: 'load',
          timeout: 20000
        });

        if (!response?.ok()) {
          throw new Error(`Website API page returned HTTP ${response?.status() ?? 'no response'}.`);
        }

        apiPage = candidate;
      } catch (error) {
        await candidate.close().catch(() => {});
        throw error;
      }
    }

    return apiPage;
  }

  return {
    request(payload) {
      return serial(async () => {
        const page = await readyAPI();
        return page.evaluate(async ({ moduleURL, payload }) => {
          const api = await import(moduleURL);
          if (typeof api.request !== 'function') {
            throw new Error('The deployed alien-api.js does not export request().');
          }
          return api.request(payload);
        }, { moduleURL, payload });
      });
    },

    portrait(seed, generatorVersion = 2) {
      return serial(async () => {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));

        try {
          const url = new URL(base);
          url.search = new URLSearchParams({
            seed: String(seed),
            v: String(generatorVersion)
          }).toString();
          url.hash = '';

          const response = await page.goto(url.href, {
            waitUntil: 'load',
            timeout: 20000
          });

          if (!response?.ok()) {
            throw new Error(`Alien page returned HTTP ${response?.status() ?? 'no response'}.`);
          }

          await page.locator('#render-mode').selectOption('quick');
          await page.waitForFunction(() => {
            const canvas = document.querySelector('#alienCanvas');
            return canvas && canvas.getAttribute('aria-busy') === 'false';
          }, undefined, { timeout: 15000 });

          const displayedSeed = await page.locator('#seedInput').inputValue();
          if (displayedSeed !== String(seed)) {
            throw new Error(`Seed mismatch: requested ${seed}, rendered ${displayedSeed || '(empty)'}.`);
          }

          if (errors.length) {
            throw new Error(`Website rendering error: ${errors.join('; ')}`);
          }

          return await page.locator('#alienCanvas').screenshot({ type: 'png' });
        } finally {
          await page.close().catch(() => {});
        }
      });
    },

    async close() {
      await queue;
      await browser.close();
    }
  };
}
