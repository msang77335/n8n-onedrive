/**
 * Captcha Drag Solver
 * Giải puzzle captcha kiểu kéo-thả bằng cách:
 * 1. Chụp ảnh puzzle background và puzzle piece
 * 2. Gọi Resolve captcha API để lấy slideXProportion
 * 3. Tính pixel offset từ tỉ lệ và chiều rộng puzzle
 * 4. Giả lập chuột kéo thả giống người thật
 */

import axios from 'axios';
import { Page } from 'puppeteer';

const wait = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

// ─── Selectors ────────────────────────────────────────────────────────────────

const SELECTORS = {
  /** Toàn bộ widget captcha */
  widget: '[id*="captcha"], [class*="captcha"]',
  /** Vùng ảnh puzzle (background có lỗ hổng) */
  puzzleImg: '#captcha-verify-image',
  /** Mảnh puzzle di chuyển */
  slideImg: '.captcha_verify_img_slide',
  /** Thanh kéo (drag bar) */
  dragWrapper: '#secsdk-captcha-drag-wrapper, [id*="drag-wrapper"], [class*="drag-wrapper"]',
  /** Nút/icon kéo */
  dragIcon: '.secsdk-captcha-drag-icon, [class*="drag-icon"], [class*="drag-sliding"]',
};

// ─── Human-like drag simulation ───────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Float version — không làm tròn, dùng nội bộ */
function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Cubic bezier interpolation */
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Ease-in-out cubic — ánh xạ t [0,1] → [0,1] để điều chỉnh tốc độ tự nhiên
 * Chậm đầu, nhanh giữa, chậm cuối.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface PathPoint {
  x: number;
  y: number;
  /** Dừng thêm (ms) sau khi đến điểm này — mô phỏng do dự */
  pauseAfter?: number;
}

/**
 * Sinh đường kéo giống người thật:
 * - Cubic bezier 2 control point, lệch Y đáng kể
 * - Tremor ngang/dọc theo sin/cos tần số ngẫu nhiên
 * - Overshoot 3-20px rồi kéo chỉnh lại
 * - 2-4 micro-pause ngẫu nhiên tuỳ đoạn
 * - Bước settle nhỏ cuối cùng (±1-2px wiggle)
 */
function buildHumanPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): PathPoint[] {
  const points: PathPoint[] = [];

  // ── Phase 1: kéo đến điểm overshoot ──
  const overshoot = randomBetween(3, 20);
  const overX = toX + overshoot;
  const overY = toY + randomBetween(-4, 4);

  // Control points tạo cung cong rõ rệt
  const cp1X = fromX + (overX - fromX) * randomFloat(0.15, 0.35);
  const cp1Y = fromY - randomBetween(12, 30);           // lệch LÊN mạnh
  const cp2X = fromX + (overX - fromX) * randomFloat(0.60, 0.82);
  const cp2Y = fromY + randomBetween(-8, 14);            // nhẹ xuống rồi ổn

  const stepsMain = randomBetween(70, 100);

  // Tần số và biên độ tremor (mô phỏng tay run)
  const tremorFreqX = randomFloat(1.5, 3.5);
  const tremorFreqY = randomFloat(2.0, 4.0);
  const tremorAmpX  = randomFloat(0.4, 1.2);
  const tremorAmpY  = randomFloat(0.3, 0.9);

  for (let i = 0; i <= stepsMain; i++) {
    const tRaw = i / stepsMain;
    const t = easeInOutCubic(tRaw); // tốc độ tự nhiên

    const x = cubicBezier(t, fromX, cp1X, cp2X, overX);
    const y = cubicBezier(t, fromY, cp1Y, cp2Y, overY);

    // Jitter theo sin, mạnh nhất ở giữa đường
    const jitterEnv = Math.sin(tRaw * Math.PI);
    const tx = x + Math.sin(tRaw * Math.PI * tremorFreqX * 2) * tremorAmpX * jitterEnv
                 + (Math.random() - 0.5) * 2 * jitterEnv;
    const ty = y + Math.cos(tRaw * Math.PI * tremorFreqY * 2) * tremorAmpY * jitterEnv
                 + (Math.random() - 0.5) * 1.5 * jitterEnv;

    points.push({ x: Math.round(tx), y: Math.round(ty) });
  }

  // ── Gắn micro-pause ngẫu nhiên 2-4 điểm ──
  const pauseCount = randomBetween(2, 4);
  const safeRange = [Math.round(stepsMain * 0.15), Math.round(stepsMain * 0.75)];
  const usedIdx = new Set<number>();
  for (let p = 0; p < pauseCount; p++) {
    let idx: number;
    let tries = 0;
    do { idx = randomBetween(safeRange[0], safeRange[1]); tries++; }
    while (usedIdx.has(idx) && tries < 20);
    usedIdx.add(idx);
    if (points[idx]) {
      points[idx].pauseAfter = randomBetween(80, 350);
    }
  }

  // ── Phase 2: correction — kéo chậm về đích thật ──
  const stepsBack = randomBetween(12, 18);
  for (let i = 1; i <= stepsBack; i++) {
    const t = i / stepsBack;
    const x = overX + (toX - overX) * easeInOutCubic(t);
    const y = overY + (toY - overY) * easeInOutCubic(t);
    // Gần như không jitter — đang dò chính xác
    points.push({
      x: Math.round(x + (Math.random() - 0.5) * 0.8),
      y: Math.round(y + (Math.random() - 0.5) * 0.8),
    });
  }

  // ── Phase 3: settle — vài điểm wiggle nhỏ tại đích ──
  const settleSteps = randomBetween(4, 8);
  for (let i = 0; i < settleSteps; i++) {
    points.push({
      x: toX + randomBetween(-1, 1),
      y: toY + randomBetween(-1, 1),
    });
  }

  return points;
}

async function humanDrag(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): Promise<void> {
  const dragPath = buildHumanPath(fromX, fromY, toX, toY);
  console.log(`🖱️ [CAPTCHA DRAG] Dragging (${fromX},${fromY}) → (${toX},${toY}), ${dragPath.length} steps`);

  // ── 1. Di chuyển từ xa đến gần vùng handle (2 bước tiếp cận) ──
  const farX = fromX + randomBetween(-30, 30);
  const farY = fromY + randomBetween(-20, 20);
  await page.mouse.move(farX, farY);
  await wait(randomBetween(200, 450));

  const nearX = fromX + randomBetween(-6, 6);
  const nearY = fromY + randomBetween(-4, 4);
  await page.mouse.move(nearX, nearY);
  await wait(randomBetween(150, 300));

  // ── 2. Hover chính xác lên handle, đọc/nhìn một lúc ──
  await page.mouse.move(fromX, fromY);
  await wait(randomBetween(350, 700));

  // ── 3. Nhấn xuống, giữ một lúc trước khi bắt đầu kéo ──
  await page.mouse.down();
  await wait(randomBetween(180, 320));

  // ── 4. Bắt đầu kéo theo path ──
  const phaseLen = dragPath.length;

  for (let i = 0; i < phaseLen; i++) {
    const point = dragPath[i];
    await page.mouse.move(point.x, point.y, { steps: 1 });

    // Tốc độ 5 phase:
    //  0-10%  : rất chậm (nhấc tay, cảm nhận bắt đầu trượt)
    // 10-30%  : tăng tốc
    // 30-65%  : nhanh nhất
    // 65-85%  : chậm lại — tiếp cận đích
    // 85-100% : rất chậm (chỉnh + settle)
    const prog = i / phaseLen;
    let delay: number;
    if      (prog < 0.10) delay = randomBetween(45, 80);
    else if (prog < 0.30) delay = randomBetween(18, 35);
    else if (prog < 0.65) delay = randomBetween(8, 20);
    else if (prog < 0.85) delay = randomBetween(25, 55);
    else                  delay = randomBetween(40, 85);

    await wait(delay);

    if (point.pauseAfter) {
      await wait(point.pauseAfter);
    }
  }

  // ── 5. Dừng tại đích, giữ tay một lúc trước khi nhả ──
  await wait(randomBetween(200, 450));

  // ── 6. Nhả chuột ──
  await page.mouse.up();

  // ── 7. Drift sau khi nhả (tay không dừng ngay) ──
  await wait(randomBetween(60, 130));
  await page.mouse.move(
    toX + randomBetween(-6, 6),
    toY + randomBetween(-4, 4),
  );
  await wait(randomBetween(80, 200));

  console.log(`✅ [CAPTCHA DRAG] Mouse released`);
}

// ─── Resolve Captcha API ───────────────────────────────────────────────────────────

/**
 * Gửi puzzle image và piece image lên Resolve Captcha API.
 * Trả về slideXProportion (0..1) hoặc null nếu lỗi.
 */
async function callResolveCaptchaApi(
  puzzleBase64: string,
  pieceBase64: string,
): Promise<number | null> {
  const url = 'http://captcha-solver:5001/solve/puzzle'
  console.log(`🌐 [CAPTCHA DRAG] Calling Resolve Captcha API...`);

  try {
    const response = await axios.post<{ slideXProportion: string | number }>(
      url,
      { puzzleImageB64: puzzleBase64, pieceImageB64: pieceBase64 },
      { timeout: 15000 }
    );
    const proportion = Number.parseFloat(String(response.data.slideXProportion));
    console.log(`📊 [CAPTCHA DRAG] Resolve Captcha slideXProportion: ${proportion}`);
    return Number.isNaN(proportion) ? null : proportion;
  } catch (err: any) {
    console.error(`❌ [CAPTCHA DRAG] Resolve Captcha API error:`, err.message);
    return null;
  }
}


// ─── Public API ───────────────────────────────────────────────────────────────

export interface DragSolveResult {
  attempted: boolean;
  offset: number;
  success: boolean;
}

/**
 * Cố gắng giải puzzle captcha kéo-thả trên `page`.
 * Trả về kết quả giải (attempted / offset / success).
 */
export async function solveDragCaptcha(page: Page): Promise<DragSolveResult> {
  console.log(`🔍 [CAPTCHA DRAG] Looking for drag captcha...`);

  // 1. Tìm drag handle
  const dragHandle = await page.$(
    '#secsdk-captcha-drag-wrapper .secsdk-captcha-drag-icon, ' +
    '[class*="drag-icon"], ' +
    '[class*="captcha_verify_bar"] [class*="drag"]'
  );

  if (!dragHandle) {
    console.log(`⚠️ [CAPTCHA DRAG] Drag handle not found, skipping`);
    return { attempted: false, offset: 0, success: false };
  }

  const handleBox = await dragHandle.boundingBox();
  if (!handleBox) {
    console.log(`⚠️ [CAPTCHA DRAG] Drag handle has no bounding box, skipping`);
    return { attempted: false, offset: 0, success: false };
  }

  const fromX = Math.round(handleBox.x + handleBox.width / 2);
  const fromY = Math.round(handleBox.y + handleBox.height / 2);
  console.log(`📍 [CAPTCHA DRAG] Handle center: (${fromX}, ${fromY})`);

  // 2. Chụp puzzle background (ảnh có lỗ hổng cần điền)
  console.log(`📸 [CAPTCHA DRAG] Capturing puzzle images for SadCaptcha...`);
  const puzzleEl = await page.$(SELECTORS.puzzleImg);
  const pieceEl = await page.$(SELECTORS.slideImg);

  if (!puzzleEl || !pieceEl) {
    console.log(`⚠️ [CAPTCHA DRAG] Puzzle/piece elements not found, skipping`);
    return { attempted: false, offset: 0, success: false };
  }

  const [puzzleSrc, pieceSrc, puzzleBox] = await Promise.all([
    page.$eval(SELECTORS.puzzleImg, (el) => (el as { getAttribute: (k: string) => string | null }).getAttribute('src')),
    page.$eval(SELECTORS.slideImg, (el) => (el as { getAttribute: (k: string) => string | null }).getAttribute('src')),
    puzzleEl.boundingBox(),
  ]);

  if (!puzzleSrc || !pieceSrc) {
    console.log(`⚠️ [CAPTCHA DRAG] Puzzle/piece src not found, skipping`);
    return { attempted: false, offset: 0, success: false };
  }

  console.log(`⬇️ [CAPTCHA DRAG] Downloading puzzle: ${puzzleSrc}`);
  console.log(`⬇️ [CAPTCHA DRAG] Downloading piece: ${pieceSrc}`);

  const [puzzleResponse, pieceResponse] = await Promise.all([
    axios.get<ArrayBuffer>(puzzleSrc, { responseType: 'arraybuffer', timeout: 15000 }),
    axios.get<ArrayBuffer>(pieceSrc, { responseType: 'arraybuffer', timeout: 15000 }),
  ]);
  const puzzleBuffer = Buffer.from(puzzleResponse.data);
  const pieceBuffer = Buffer.from(pieceResponse.data);

  // 2b. Convert to base64
  const puzzleBase64 = puzzleBuffer.toString('base64');
  const pieceBase64 = pieceBuffer.toString('base64');

  // 4. Gọi Resolve Captcha API lấy tỉ lệ trượt
  let slideXProportion = await callResolveCaptchaApi(puzzleBase64, pieceBase64);
  if (slideXProportion === null) {
    console.log(`❌ [CAPTCHA DRAG] Failed to get slideXProportion from Resolve Captcha API`);
    return { attempted: false, offset: 0, success: false };
  }

  // 5. Tính pixel offset từ chiều rộng puzzle thực tế
  const puzzleWidth = puzzleBox?.width ?? 46;
  const offset = Math.round(puzzleWidth * slideXProportion);
  console.log(`📏 [CAPTCHA DRAG] Puzzle width: ${puzzleWidth}px, proportion: ${slideXProportion}, offset: ${offset}px`);

  // 6. Kéo thả
  const toX = fromX + offset;
  const toY = fromY + randomBetween(-2, 2);
  await humanDrag(page, fromX, fromY, toX, toY);

  // 7. Chờ phản hồi captcha
  await wait(randomBetween(1500, 2500));

  // 8. Kiểm tra xem captcha đã giải xong chưa (element biến mất)
  const stillPresent = await page.$('#secsdk-captcha-drag-wrapper');
  const success = stillPresent === null;
  console.log(`${success ? '✅' : '⚠️'} [CAPTCHA DRAG] Result: ${success ? 'SOLVED' : 'Still present (may need retry)'}`);

  return { attempted: true, offset, success };
}
