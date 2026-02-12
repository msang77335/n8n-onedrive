
export async function bestExpressScreenshouter(codes: string): Promise<{ status: string; buffer: Buffer }> {
  console.log(`📍 [BEST EXPRESS] Starting screenshot for tracking: ${codes}`);

  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const graphql = JSON.stringify({
    query: `mutation Screenshot($url: String!) { 
      viewport(width: 1280, height: 720, deviceScaleFactor: 1) { width height deviceScaleFactor }
      goto(url: $url, waitUntil: load) { status } 
      solve { found solved time } 
      waitForTimeout(time: 15000) { time } 
      trackingStatus: text(selector: ".num-status-info .status-color") { text }
      screenshot(type: jpeg) { base64 } 
    }`,
    variables: { "url": `https://www.trackingmore.com/track?number=${codes}&express=best-vn` }
  });

  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: graphql
  };

  try {
    console.log(`🌐 [BEST EXPRESS] Calling browserless.io API...`);
    const response = await fetch(
      `https://production-sfo.browserless.io/chromium/bql?token=${process.env.BROWSERLESS_API_TOKEN}`,
      requestOptions
    );

    if (!response.ok) {
      throw new Error(`Browserless API returned status ${response.status}: ${await response.text()}`);
    }

    const result = await response.json() as {
      data?: {
        screenshot?: {
          base64?: string;
        };
        trackingStatus?: {
          text?: string;
        }
      };
    };
    console.log(`📦 [BEST EXPRESS] Received response from browserless.io`);

    if (!result.data?.screenshot?.base64) {
      throw new Error('No screenshot data in response');
    }

    const screenshotBuffer = Buffer.from(result.data.screenshot.base64, 'base64');
    console.log(`✅ [BEST EXPRESS] Screenshot completed successfully, size: ${screenshotBuffer.length} bytes`);

    const trackingStatusText = result.data?.trackingStatus?.text || '';

    const isDelivered = trackingStatusText.toUpperCase().includes('DELIVERED');

    return { 
      status: isDelivered ? 'DELIVERED' : 'UNKNOWN', 
      buffer: screenshotBuffer 
    };
  } catch (error) {
    console.error(`💥 [BEST EXPRESS] Error in isBestExpressScreenshouter:`, error);
    throw error;
  }
}