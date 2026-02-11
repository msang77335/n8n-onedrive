import { GoogleGenerativeAI } from "@google/generative-ai";
import _ from 'lodash';
import fs from 'node:fs';
import path from 'node:path';
import { Page } from 'playwright';
import { PlaywrightBrowserSingleton } from "./PlaywrightBrowserSingleton";

async function navigateToPage(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch (gotoError: any) {
    console.log(`⚠️ [VN POST SCREENSHOT] Navigation issue: ${gotoError.message}, retrying with 'load'...`);
    await page.goto(url, {
      waitUntil: 'load',
      timeout: 60000
    });
  }
  console.log(`✅ [VN POST SCREENSHOT] Page loaded successfully`);
}

async function saveCaptchaImage(captchaScreenshot: Buffer): Promise<string> {
  const logsDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log(`📁 [VN POST SCREENSHOT] Created logs directory: ${logsDir}`);
  }
  const captchaPath = path.join(logsDir, 'vnpost-captcha.png');
  fs.writeFileSync(captchaPath, captchaScreenshot);
  console.log(`💾 [VN POST SCREENSHOT] Captcha saved to: ${captchaPath}`);
  return captchaPath;
}

async function solveCaptchaAndSearch(page: Page, code: string): Promise<void> {
  const captchaElement = page.locator('#tra-cuu-captcha');
  
  if (await captchaElement.count() === 0) {
    console.log(`⚠️ [VN POST SCREENSHOT] Captcha element not found`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    return;
  }

  console.log(`✅ [VN POST SCREENSHOT] Captcha found, taking screenshot...`);
  const captchaScreenshot = await captchaElement.screenshot();
  console.log(`✅ [VN POST SCREENSHOT] Captcha screenshot captured, size: ${captchaScreenshot.length} bytes`);

  await saveCaptchaImage(captchaScreenshot);

  console.log(`🤖 [VN POST SCREENSHOT] Using Gemini AI to read captcha...`);
  const captchaText = await readCaptchaWithGemini(captchaScreenshot);
  console.log(`✅ [VN POST SCREENSHOT] Captcha text extracted: ${captchaText}`);

  console.log(`⌨️ [VN POST SCREENSHOT] Filling captcha input...`);
  const captchaInput = page.locator('input[ng-model="data.dataSearch.captcha"]');
  await captchaInput.waitFor({ state: 'visible', timeout: 10000 });
  await captchaInput.fill(captchaText);

  console.log(`⌨️ [VN POST SCREENSHOT] Filling tracking code: ${code}...`);
  const trackingInput = page.locator('input.input-tracking[ng-model="data.dataSearch.post_code"]');
  await trackingInput.waitFor({ state: 'visible', timeout: 10000 });
  await trackingInput.fill(code);

  console.log(`🔍 [VN POST SCREENSHOT] Clicking search button...`);
  const searchButton = page.locator('button.button-tracking[ng-click="actions.search()"]');
  await searchButton.waitFor({ state: 'visible', timeout: 10000 });
  await searchButton.click();

  console.log(`⏳ [VN POST SCREENSHOT] Waiting 10 seconds for results...`);
  await new Promise(resolve => setTimeout(resolve, 10000));
}

async function checkTrackingDataPresent(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const captchaError = (globalThis as any).document.querySelector('span.text-danger');
    if (captchaError?.textContent?.includes('Vui lòng nhập captcha') ||
      captchaError?.textContent?.includes('Captcha không đúng hoặc đã hết hạn')
    ) {
      return false;
    }

    const errorElements = (globalThis as any).document.querySelectorAll('.text-danger, .error-message');
    for (const el of errorElements) {
      if (el.textContent && el.textContent.trim().length > 0) {
        console.log('Error found:', el.textContent);
        return false;
      }
    }

    return true;
  });
}

async function getTrackingStatus(page: Page): Promise<string> {
  return await page.evaluate(() => {
    // Find all elements that may contain status information
    const statusElements = (globalThis as any).document.querySelectorAll('.lookup-journey-content-solve-block-code');

    for (const element of statusElements) {
      // Check if the element's text indicates delivery
      const statusElement = element.querySelector('.ng-binding');
      if(statusElement?.textContent?.includes('Đã phát thành công')) {
        return 'DELIVERED';
      }
    }
    
    return 'UNKNOWN';
  });
}

async function takeScreenshot(page: Page): Promise<Buffer> {
  const viewportSize = page.viewportSize();
  const clipOptions = viewportSize ? {
    x: 0,
    y: 600,
    width: viewportSize.width,
    height: viewportSize.height - 600
  } : undefined;

  console.log(`📐 [VN POST SCREENSHOT] Clip options:`, clipOptions);

  const screenshot = await page.screenshot({
    fullPage: false,
    clip: clipOptions
  });
  console.log(`✅ [VN POST SCREENSHOT] Screenshot captured, size: ${screenshot.length} bytes`);
  return Buffer.from(screenshot);
}

async function attemptScreenshot(page: Page, url: string, code: string, attempt: number, maxRetries: number): Promise<{ status: string; buffer: Buffer }> {
  console.log(`🌐 [VN POST SCREENSHOT] Navigating to ${url}...`);
  await navigateToPage(page, url);

  console.log(`⏳ [VN POST SCREENSHOT] Waiting 10 seconds for captcha to load...`);
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log(`📸 [VN POST SCREENSHOT] Looking for captcha image...`);
  await solveCaptchaAndSearch(page, code);

  console.log(`🔍 [VN POST SCREENSHOT] Checking for tracking data...`);
  const hasTrackingData = await checkTrackingDataPresent(page);

  if (!hasTrackingData) {
    const errorMsg = attempt < maxRetries 
      ? 'No tracking data found, will retry'
      : 'No tracking data found after all retries';
    throw new Error(errorMsg);
  }

  const status = await getTrackingStatus(page);
  console.log(`✅ [VN POST SCREENSHOT] Tracking data found: ${status}`);

  console.log(`✅ [VN POST SCREENSHOT] Tracking data found, taking screenshot...`);
  const screenshotBuffer = await takeScreenshot(page);
  return {
    status,
    buffer: screenshotBuffer
  }
}

async function setupPage(browserContext: any): Promise<Page> {
  const page = await browserContext.newPage();
  page.setViewportSize({ width: 1280, height: 1800 });
  page.setDefaultTimeout(90000);
  console.log(`⏱️ [VN POST SCREENSHOT] Default timeout set to 90 seconds`);
  return page;
}

async function handleRetryError(page: Page | undefined, attempt: number, maxRetries: number): Promise<void> {
  if (page && !page.isClosed()) {
    await page.close().catch(e => console.log('Error closing page:', e));
  }

  if (attempt < maxRetries) {
    const delay = attempt * 2000;
    console.log(`⏳ [VN POST SCREENSHOT] Waiting ${delay}ms before retry...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

export async function vnPostScreenshoter(code?: string): Promise<{ status: string; buffer: Buffer }> {
  const url = `https://vietnampost.vn/vi`;
  console.log(`📍 [VN POST] Starting screenshot for URL: ${url}`);
  
  const browserContext = await PlaywrightBrowserSingleton.getContext();
  if (!browserContext) {
    throw new Error('Failed to get browser context');
  }

  const maxRetries = 3;
  let lastError;
  let page;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🆕 [VN POST SCREENSHOT] Creating new page (attempt ${attempt}/${maxRetries})...`);
      page = await setupPage(browserContext);

      const result = await attemptScreenshot(page, url, code || '', attempt, maxRetries);
      
      if (page && !page.isClosed()) {
        await page.close().catch(e => console.log('Error closing page:', e));
      }
      
      console.log(`✨ [VN POST SCREENSHOT] All done!`);
      return result;

    } catch (error: any) {
      lastError = error;
      console.error(`💥 [VN POST SCREENSHOT] Attempt ${attempt}/${maxRetries} failed:`, error.message);
      await handleRetryError(page, attempt, maxRetries);
      page = undefined;
    }
  }

  console.error(`💥 [SCREENSHOT] All ${maxRetries} attempts failed`);
  throw lastError;
}

async function readCaptchaWithGemini(imageBuffer: Buffer): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `This is a captcha image. Please extract and return ONLY the text/numbers shown in the captcha. Return just the captcha text without any explanation or additional text.`;

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: 'image/png',
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text().trim();

    console.log(`🤖 [GEMINI] Raw response: ${text}`);

    // Extract only alphanumeric characters (letters and numbers)
    const cleanText = _.replace(text, /[^a-zA-Z0-9]/g, '');
    console.log(`🧹 [GEMINI] Cleaned text: ${cleanText}`);

    return cleanText;
  } catch (error) {
    console.error(`💥 [GEMINI] Error reading captcha:`, error);
    throw error;
  }
}
