import axios from 'axios';
import { Request, Response, Router } from 'express';
import * as fs from 'node:fs';
import PhoneBruteForceFinder from '../helpers/scanPhoneJnT/index';

const router = Router();

interface TrackingQuery {
  billCode?: string;
  startFrom?: number;
}

interface ProxyListResponse {
  results: Array<{
    username: string;
    password: string;
    proxy_address: string;
    ports: {
      http: number;
      socks5: number;
    };
  }>;
}

interface ScanJob {
  id: string;
  billCode: string;
  status: 'running' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  startTime: number;
  endTime?: number;
}

// In-memory job storage (use Redis/DB in production)
const scanJobs = new Map<string, ScanJob>();

// Generate unique job ID
const generateJobId = (): string => {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

// Fetch proxies from Webshare API
const fetchProxiesFromWebshare = async (
  authToken: string,
  page: number = 1,
  pageSize: number = 100
): Promise<string[]> => {
  try {
    const response = await axios.get<ProxyListResponse>(
      `https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=${page}&page_size=${pageSize}`,
      {
        headers: {
          'Authorization': authToken,
        }
      }
    );

    // Log response structure for debugging
    console.log(`📋 [WEBSHARE] Response structure:`, JSON.stringify(response.data, null, 2).substring(0, 500));

    // Check if results exist
    if (!response.data.results || response.data.results.length === 0) {
      console.warn(`⚠️  [WEBSHARE] No proxies found in response`);
      return [];
    }

    const proxies = response.data.results.map((proxy: any) => {
      // Handle different proxy response formats
      let proxyString = '';
      
      if (proxy?.ports?.http && proxy?.proxy_address && proxy?.username && proxy?.password) {
        // Format: IP:PORT:USERNAME:PASSWORD
        proxyString = `${proxy.proxy_address}:${proxy.ports.http}:${proxy.username}:${proxy.password}`;
      } else if (proxy?.proxy_address && proxy?.port && proxy?.username && proxy?.password) {
        // Alternative format if structure is different
        proxyString = `${proxy.proxy_address}:${proxy.port}:${proxy.username}:${proxy.password}`;
      } else {
        console.warn(`⚠️  [WEBSHARE] Skipping proxy with unexpected structure:`, JSON.stringify(proxy));
        return null;
      }
      
      return proxyString;
    }).filter((p: string | null) => p !== null);

    console.log(`✅ Loaded ${proxies.length} proxies from Webshare API`);
    return proxies;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log more details about the error
    if (axios.isAxiosError(error)) {
      console.error(`⚠️  [WEBSHARE] API Error: ${error.response?.status} - ${JSON.stringify(error.response?.data).substring(0, 200)}`);
    } else {
      console.error(`⚠️  Failed to load proxies from Webshare: ${errorMessage}`);
    }
    
    return [];
  }
};

// Load proxies from local file
const loadProxiesFromFile = (): string[] => {
  try {
    const data = fs.readFileSync('proxies.txt', 'utf8');
    return data.split('\n').map((line: string) => line.trim()).filter(Boolean);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`⚠️  Failed to load proxies from file: ${errorMessage}`);
    return [];
  }
};

// POST /api/v1/scanPhone - Start async phone scan
router.post('/', async (req: Request, res: Response): Promise<void> => {
  console.log(`🚀 [SCAN PHONE] New scan request at ${new Date().toISOString()}`);

  try {
    const { billCode, startFrom = 0 }: TrackingQuery = req.body;

    if (!billCode) {
      console.log(`❌ [SCAN PHONE] Missing billCode parameter`);
      res.status(400).json({
        success: false,
        error: 'billCode parameter is required'
      });
      return;
    }

    // Use webshareToken from env variable
    const finalWebshareToken = process.env.WEBSHARE_TOKEN ?? "";

    // Validate startFrom
    const validStartFrom = Math.max(0, Math.min(Number(startFrom) || 0, 9999));

    // Check if there's already a running job for this billCode
    let existingJob: ScanJob | undefined;
    for (const job of scanJobs.values()) {
      if (job.billCode === billCode && job.status === 'running') {
        existingJob = job;
        break;
      }
    }

    // If job already running, return existing job info
    if (existingJob) {
      console.log(`ℹ️  [SCAN PHONE] Job already running for billCode: ${billCode}, jobId: ${existingJob.id}`);
      res.status(202).json({
        success: true,
        message: 'Scan already running',
        jobId: existingJob.id,
        billCode: billCode,
        status: 'running'
      });
      return;
    }

    // Create new job
    const jobId = generateJobId();
    const job: ScanJob = {
      id: jobId,
      billCode: billCode,
      status: 'running',
      startTime: Date.now()
    };

    scanJobs.set(jobId, job);

    // Return immediately with job ID
    console.log(`✅ [SCAN PHONE] Job created: ${jobId} (startFrom: ${validStartFrom})`);
    res.status(202).json({
      success: true,
      message: 'Scan started',
      jobId: jobId,
      billCode: billCode,
      startFrom: validStartFrom,
      status: 'running'
    });

    // Run scan in background (don't await)
    runScanInBackground(jobId, billCode, finalWebshareToken, validStartFrom);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`💥 [SCAN PHONE] Error creating job: ${errorMessage}`);

    res.status(500).json({
      success: false,
      error: 'Failed to start scan',
      message: errorMessage
    });
  }
});

// GET /api/v1/scanPhone/status/:jobId - Check scan status
router.get('/status/:jobId', (req: Request, res: Response): void => {
  const { jobId } = req.params;

  const job = scanJobs.get(jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error: 'Job not found',
      jobId: jobId
    });
    return;
  }

  const response: any = {
    success: true,
    jobId: job.id,
    billCode: job.billCode,
    status: job.status,
    startTime: new Date(job.startTime).toISOString()
  };

  if (job.progress !== undefined) {
    response.progress = job.progress;
  }

  if (job.endTime) {
    response.endTime = new Date(job.endTime).toISOString();
    response.duration = `${((job.endTime - job.startTime) / 1000).toFixed(2)}s`;
  }

  if (job.status === 'completed' && job.result) {
    response.result = job.result;
  }

  if (job.status === 'failed' && job.error) {
    response.error = job.error;
  }

  res.status(200).json(response);
});

// GET /api/v1/scanPhone/list - List all jobs with status
router.get('/list', (req: Request, res: Response): void => {
  const jobs = Array.from(scanJobs.values()).map(job => {
    const jobInfo: any = {
      jobId: job.id,
      billCode: job.billCode,
      status: job.status,
      startTime: new Date(job.startTime).toISOString()
    };

    if (job.progress !== undefined) {
      jobInfo.progress = job.progress;
    }

    if (job.endTime) {
      jobInfo.endTime = new Date(job.endTime).toISOString();
      jobInfo.duration = `${((job.endTime - job.startTime) / 1000).toFixed(2)}s`;
    }

    if (job.status === 'completed' && job.result) {
      jobInfo.result = job.result;
    }

    if (job.status === 'failed' && job.error) {
      jobInfo.error = job.error;
    }

    return jobInfo;
  }).sort((a, b) => b.startTime.localeCompare(a.startTime)); // Sort by latest first

  res.status(200).json({
    success: true,
    total: jobs.length,
    jobs: jobs
  });
});

// Background scan function
const runScanInBackground = async (
  jobId: string,
  billCode: string,
  webshareToken?: string,
  startFrom: number = 0
): Promise<void> => {
  const job = scanJobs.get(jobId);
  if (!job) return;

  try {
    console.log(`⏳ [SCAN PHONE] ${jobId} - Loading proxies...`);

    // Load proxies
    let proxies: string[] = [];
    if (webshareToken) {
      console.log(`🔑 [SCAN PHONE] ${jobId} - Using Webshare API for proxies`);
      proxies = await fetchProxiesFromWebshare(webshareToken);
      
      // Fallback to file if webshare fails
      if (proxies.length === 0) {
        console.warn(`⚠️  [SCAN PHONE] ${jobId} - Webshare failed, trying local file...`);
        proxies = loadProxiesFromFile();
      }
    } else {
      proxies = loadProxiesFromFile();
    }

    if (proxies.length === 0) {
      console.warn(`⚠️  [SCAN PHONE] ${jobId} - No proxies loaded, proceeding without proxy`);
    }

    // Initialize finder with proxies
    const finder = new PhoneBruteForceFinder(proxies);

    console.log(`🔍 [SCAN PHONE] ${jobId} - Starting scan for: ${billCode} (from: ${String(startFrom).padStart(4, '0')})`);

    // Find valid phone numbers
    const result = await finder.findPhone(billCode, {
      verbose: false,
      maxAttempts: 10000,
      startFrom: startFrom
    });

    // Update job with result
    job.status = 'completed';
    job.endTime = Date.now();

    if ('validPhones' in result && result.validPhones && result.validPhones.length > 0) {
      console.log(`✅ [SCAN PHONE] ${jobId} - Found ${result.validPhones.length} phone number(s)`);
      job.result = {
        found: true,
        validPhones: result.validPhones,
        totalAttempts: result.totalAttempts,
        totalSeconds: result.totalSeconds
      };
    } else {
      console.log(`❌ [SCAN PHONE] ${jobId} - No valid phone numbers found`);
      job.result = {
        found: false,
        validPhones: [],
        message: 'No valid phone numbers found'
      };
    }

    console.log(`💾 [SCAN PHONE] ${jobId} - Results stored, took ${((job.endTime - job.startTime) / 1000).toFixed(2)}s`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'Unknown error';

    console.error(`💥 [SCAN PHONE] ${jobId} - Error: ${errorMessage}`);
    console.error(`Stack: ${errorStack}`);

    job.status = 'failed';
    job.endTime = Date.now();
    job.error = errorMessage;
  }
};

export default router;
