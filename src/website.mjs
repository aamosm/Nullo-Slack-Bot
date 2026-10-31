import { chromium } from 'playwright';

export class Website {
  constructor(baseURL) {
    this.base = new URL(baseURL);
    this.moduleURL = new URL('alien-api.js', this.base).href;
    this.queue = Promise.resolve();
    this.lastOK = null;
  }
  run(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  async context() {
    if (!this.browser?.isConnected()) {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SLACK_')));
      this.browser = await chromium.launch({ headless: true, env });
      this.ctx = await this.browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      await this.ctx.addInitScript(() => {
        try { localStorage.setItem('alien-render-mode', 'quick'); } catch {}
      });
      this.apiPage = null;
    }
    return this.ctx;
  }
  request(payload) {
    return this.run(async () => {
      const ctx = await this.context();
      if (!this.apiPage || this.apiPage.isClosed()) {
        this.apiPage = await ctx.newPage();
        try {
          const response = await this.apiPage.goto(new URL('api.html', this.base).href, { waitUntil: 'load', timeout: 20000 });
          if (!response?.ok()) throw new Error('Website API page is unavailable.');
        } catch (e) {
          await this.apiPage.close().catch(() => {});
          throw e;
        }
      }
      const page = this.apiPage;
      const timer = setTimeout(() => { page.close().catch(() => {}); }, 20000);
      try {
        const result = await page.evaluate(async ({ moduleURL, payload }) => {
          const api = await import(moduleURL);
          return await api.request(payload);
        }, { moduleURL: this.moduleURL, payload });
        this.lastOK = new Date().toISOString();
        return result;
      } catch (e) {
        await page.close().catch(() => {});
        throw e;
      } finally { clearTimeout(timer); }
    });
  }
  portrait(seed) {
    return this.run(async () => {
      const page = await (await this.context()).newPage();
      const timer = setTimeout(() => { page.close().catch(() => {}); }, 45000);
      try {
        const url = new URL(this.base);
        url.search = new URLSearchParams({ seed, v: '2' }).toString();
        const response = await page.goto(url.href, { waitUntil: 'load', timeout: 20000 });
        if (!response?.ok()) throw new Error('Alien page is unavailable.');
        await page.locator('#render-mode').selectOption('quick', { timeout: 5000 });
        await page.waitForFunction(() => document.querySelector('#alienCanvas')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 15000 });
        if (await page.locator('#seedInput').inputValue() !== seed) throw new Error('The website displayed a different seed.');
        const png = await page.locator('#alienCanvas').evaluate(canvas => canvas.toDataURL('image/png'));
        if (!png.startsWith('data:image/png;base64,')) throw new Error('The website did not return a PNG.');
        return Buffer.from(png.slice('data:image/png;base64,'.length), 'base64');
      } finally {
        clearTimeout(timer);
        await page.close().catch(() => {});
      }
    });
  }
  async close() {
    await this.queue;
    await this.browser?.close();
  }
}
