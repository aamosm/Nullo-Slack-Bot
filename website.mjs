import { chromium } from 'playwright';

export async function openWebsite(baseURL) {
  const base = new URL(baseURL);
  if (base.protocol !== 'https:') throw new Error('Use the configured HTTPS website.');
  const moduleURL = new URL('alien-api.js', base).href;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
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
          waitUntil: 'load', timeout: 15000,
        });
        if (!response?.ok()) throw new Error('The website API page is unavailable.');
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
        const timer = setTimeout(() => { page.close().catch(() => {}); }, 15000);
        try {
          return await page.evaluate(async ({ moduleURL, payload }) => {
            const api = await import(moduleURL);
            return await api.request(payload);
          }, { moduleURL, payload });
        } finally {
          clearTimeout(timer);
        }
      });
    },

    portrait(seed, generatorVersion = 2) {
      return serial(async () => {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const timer = setTimeout(() => { page.close().catch(() => {}); }, 20000);
        try {
          const url = new URL(base);
          url.search = new URLSearchParams({ seed, v: String(generatorVersion) }).toString();
          url.hash = '';
          const response = await page.goto(url.href, { waitUntil: 'load', timeout: 15000 });
          if (!response?.ok()) throw new Error('The alien page is unavailable.');
          await page.locator('#render-mode').selectOption('quick');
          await page.waitForFunction(() =>
            document.querySelector('#alienCanvas')?.getAttribute('aria-busy') === 'false',
            undefined, { timeout: 10000 });
          if (await page.locator('#seedInput').inputValue() !== seed) {
            throw new Error('The displayed seed does not match the requested alien.');
          }
          if (errors.length) throw new Error('The website reported a rendering error.');
          return await page.locator('#alienCanvas').screenshot({ type: 'png' });
        } finally {
          clearTimeout(timer);
          await page.close().catch(() => {});
        }
      });
    },

    async close() {
      await queue;
      await browser.close();
    },
  };
}