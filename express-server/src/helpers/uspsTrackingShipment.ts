import { Page } from 'puppeteer';
import { PuppeteerBrowserSingleton } from './PuppeteerBrowserSingleton';
import { ScreenshotQuery } from '.';

const USPS_TRACKING_URL = (codes: string) =>
  `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=2&text28777=&tLabels=${encodeURIComponent(codes)}&tABt=true`;

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1536, height: 864 },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

async function setStealthHeaders(page: Page): Promise<void> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const vp = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  // setUserAgent is deprecated in newer Puppeteer — use CDP override for full control
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en;q=0.9' });
  await cdp.detach();
  await page.setViewport(vp);
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  });
  console.log(`🥸 [USPS] UA: ${ua.slice(0, 60)}... | Viewport: ${vp.width}x${vp.height}`);
}

async function waitForTrackingData(page: Page): Promise<boolean> {
  console.log(`🔍 [USPS] Waiting for tracking results to appear...`);
  try {
    // Selectors confirmed from live USPS tracking page HTML
    await page.waitForSelector(
      '.tracking-progress-bar-status-container, .tb-step.current-step, .latest-update-banner-wrapper',
      { timeout: 30000 },
    );
    console.log(`✅ [USPS] Tracking data element found`);
    return true;
  } catch {
    console.log(`⚠️ [USPS] Tracking data element not found within timeout`);
    return false;
  }
}

async function checkBotDetected(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const url = (globalThis as any).window.location.href;
    const title = (globalThis as any).document.title || '';
    const body = (globalThis as any).document.body?.textContent || '';
    return (
      url.includes('outage_apology') ||
      url.includes('anyapp_outage_apology') ||
      title.toLowerCase().includes('outage') ||
      body.toLowerCase().includes('experiencing difficulties')
    );
  });
}

async function getShipmentStatus(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const doc = (globalThis as any).document;

    // Check container-level delivered class (fastest signal)
    const container = doc.querySelector('.tracking-progress-bar-status-container');
    if (container?.classList?.contains('delivered-status')) return 'DELIVERED';

    // Current step status text (e.g. "Delivered")
    const tbStatus = doc.querySelector('.tb-step.current-step .tb-status');
    const tbStatusText = tbStatus?.textContent?.trim() || '';
    if (/delivered/i.test(tbStatusText)) return 'DELIVERED';

    // Current step detail (e.g. "Out for Delivery", "In Transit")
    const tbDetail = doc.querySelector('.tb-step.current-step .tb-status-detail');
    const detailText = tbDetail?.textContent?.trim() || '';
    if (detailText) return detailText.toUpperCase().replace(/[^A-Z0-9 _]/g, '_');

    // Banner content fallback (e.g. "Your item was delivered...")
    const banner = doc.querySelector('.latest-update-banner-wrapper .banner-content');
    const bannerText = banner?.textContent?.trim() || '';
    if (/delivered/i.test(bannerText)) return 'DELIVERED';

    return 'UNKNOWN';
  });
}

/**
 * Patch fingerprinting signals that Puppeteer/headless Chrome expose.
 * Must be called BEFORE navigation so it applies via evaluateOnNewDocument.
 */
async function applyStealthPatches(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    const nav = (globalThis as any).navigator;
    const win = globalThis as any;

    // Ensure webdriver flag is hidden (stealth plugin does this but belt-and-suspenders)
    Object.defineProperty(nav, 'webdriver', { get: () => undefined });

    // Realistic plugins list — flat descriptors to avoid deep nesting lint errors
    const pluginList: any[] = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
    ];
    Object.defineProperty(pluginList, 'item', { value: (i: number) => pluginList[i] });
    Object.defineProperty(pluginList, 'namedItem', { value: (n: string) => pluginList.find((p) => p.name === n) ?? null });
    Object.defineProperty(pluginList, 'refresh', { value: () => {} });
    Object.defineProperty(nav, 'plugins', { get: () => pluginList });

    // Realistic hardware profile
    Object.defineProperty(nav, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(nav, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(nav, 'languages', { get: () => ['en-US', 'en'] });

    // Remove known automation markers
    const markers = ['__playwright', '__pwInitScripts', '__pw_manual', '_phantom', '__nightmare', 'callPhantom', '__webdriver_script_fn', '__selenium_unwrapped'];
    markers.forEach((k) => { try { delete win[k]; } catch { /* ignore */ } });
  });
}

/** Visit USPS homepage first to warm up cookies — reduces bot-score significantly */
async function warmUpCookies(page: Page): Promise<void> {
  console.log(`🍪 [USPS] Warming up cookies via usps.com...`);
  try {
    await page.goto('https://www.usps.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 1500)));
    console.log(`✅ [USPS] Cookie warm-up complete`);
  } catch (err: any) {
    console.log(`⚠️ [USPS] Cookie warm-up failed (non-fatal): ${err.message}`);
  }
}

/** Simulate realistic mouse movements + scroll after page load */
async function simulateHumanBehavior(page: Page): Promise<void> {
  const vp = page.viewport() || { width: 1280, height: 800 };
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(
      50 + Math.floor(Math.random() * (vp.width - 100)),
      50 + Math.floor(Math.random() * (vp.height - 100)),
      { steps: 8 + Math.floor(Math.random() * 10) },
    );
    await new Promise(r => setTimeout(r, 150 + Math.floor(Math.random() * 350)));
  }
  await page.evaluate(() => {
    (globalThis as any).window.scrollBy(0, Math.floor(80 + Math.random() * 150));
  });
  await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 300)));
}

async function attemptUSPS(page: Page, codes: string, attempt: number, maxRetries: number): Promise<{ buffer: Buffer; status: string } | null> {
  const url = USPS_TRACKING_URL(codes);
  console.log(`🌐 [USPS] Navigating to USPS tracking (attempt ${attempt}/${maxRetries})...`);

  // Detect bot-blocking via XHR requests to outage page (USPS loads apology via Ajax, not full redirect)
  let botDetectedViaXhr = false;
  const requestListener = (req: any) => {
    if (req.url().includes('outage_apology')) {
      botDetectedViaXhr = true;
      console.log(`⚠️ [USPS] Bot detection XHR detected: ${req.url()}`);
    }
  };
  page.on('request', requestListener);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err: any) {
    console.log(`⚠️ [USPS] Navigation error (non-fatal): ${err.message}`);
  }

  // Brief pause to let JS redirects / XHR settle
  await new Promise(r => setTimeout(r, 3000));

  page.off('request', requestListener);

  // Simulate zoom in/out to trigger resize events and force JS re-render
  // USPS tracking.js reads layout dimensions on resize; without this some elements stay undefined
  const vp = page.viewport() || { width: 1280, height: 800 };
  await page.setViewport({ width: vp.width + 1, height: vp.height + 1 });
  await new Promise(r => setTimeout(r, 300));
  await page.setViewport({ width: vp.width, height: vp.height });
  await new Promise(r => setTimeout(r, 500));

  // Simulate human mouse + scroll behavior
  await simulateHumanBehavior(page);

  // Check bot detection via URL redirect OR XHR intercept OR blank page body
  const botDetected = botDetectedViaXhr || await checkBotDetected(page);
  if (!botDetected) {
    // Extra check: blank page (body has almost no content) means apology loaded but CORS blocked it
    const bodyLength = await page.evaluate(() => ((globalThis as any).document.body?.innerHTML || '').trim().length);
    if (bodyLength < 200) {
      console.log(`⚠️ [USPS] Page body is nearly empty (${bodyLength} chars), likely bot-blocked blank page`);
      return null;
    }
  }
  if (botDetected) {
    console.log(`⚠️ [USPS] Bot detection triggered, page redirected to apology page`);
    return null;
  }

  const hasData = await waitForTrackingData(page);
  if (!hasData) {
    console.log(`⚠️ [USPS] No tracking data found on attempt ${attempt}`);
    return null;
  }

  // Extra wait for full rendering
  await new Promise(r => setTimeout(r, 2000));

  const status = await getShipmentStatus(page);
  console.log(`📊 [USPS] Status: ${status}`);

  const screenshot = await page.screenshot({ fullPage: false });
  console.log(`📸 [USPS] Screenshot taken, size: ${screenshot.length} bytes`);

  return { buffer: Buffer.from(screenshot), status };
}

async function runAttempt(codes: string, attempt: number, maxRetries: number): Promise<{ buffer: Buffer; status: string } | null> {
  const page = await PuppeteerBrowserSingleton.newPage();
  if (!page) throw new Error('Failed to create Puppeteer page');

  try {
    // Apply fingerprint patches before any navigation
    await applyStealthPatches(page);
    await setStealthHeaders(page);
    // Warm up cookies on first attempt to build a believable session
    if (attempt === 1) await warmUpCookies(page);

    return await attemptUSPS(page, codes, attempt, maxRetries);
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

export async function uspsTrackingShipment({ codes }: Pick<ScreenshotQuery, 'codes'>): Promise<{ status: string; buffer: Buffer }> {
  console.log(`🚀 [USPS] Starting USPS tracking for: ${codes}`);

  const maxRetries = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await runAttempt(codes, attempt, maxRetries);
      if (result) {
        console.log(`✅ [USPS] Success on attempt ${attempt}`);
        return result;
      }
    } catch (err: any) {
      lastError = err;
      console.error(`💥 [USPS] Attempt ${attempt} error: ${err.message}`);
    }

    if (attempt < maxRetries) {
      const delay = attempt * 5000;
      console.log(`⏳ [USPS] Waiting ${delay}ms before retry...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error(`💥 [USPS] All ${maxRetries} attempts failed`);
  throw lastError || new Error('Failed to capture USPS tracking screenshot after all retries');
}
