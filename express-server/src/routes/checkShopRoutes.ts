import { Request, Response, Router } from 'express';
import { checkShop } from '../helpers/checkShop';

const router = Router();

// POST /api/v1/check-shop - Screenshot a shop page by URL
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ success: false, error: 'url is required' });
    return;
  }

  const checker = checkShop(url);
  if (!checker) {
    res.status(422).json({ success: false, error: 'Unsupported shop URL' });
    return;
  }

  try {
    const result = await checker.screenshot(url);
    res
      .status(200)
      .set('X-Shop-Site', result.site)
      .set('X-Shop-Status', result.status)
      .set('X-Shop-Title', encodeURIComponent(result.shopTile || ''))
      .set('Content-Type', 'image/png')
      .send(result.screenshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
