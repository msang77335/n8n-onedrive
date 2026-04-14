export enum ShopSiteEnum {
  Lazada = 'lazada',
  Shopee = 'shopee',
  Tiktok = 'tiktok',
}

export interface ScreenshotResult {
  site: ShopSiteEnum;
  status: "AVAILABLE" | "UNAVAILABLE";
  shopTile?: string;
  screenshot: Buffer;
}

export abstract class CheckShop {
  abstract readonly site: ShopSiteEnum;

  abstract matches(url: string): boolean;

  abstract screenshot(url: string): Promise<ScreenshotResult>;
}

export { LazadaCheckShop } from './lazadaCheckShop';
export { ShopeeCheckShop } from './shopeeCheckShop';
export { TiktokCheckShop } from './tiktokCheckShop';

import { LazadaCheckShop } from './lazadaCheckShop';
import { ShopeeCheckShop } from './shopeeCheckShop';
import { TiktokCheckShop } from './tiktokCheckShop';

const shopCheckers: CheckShop[] = [new LazadaCheckShop(), new TiktokCheckShop(), new ShopeeCheckShop()];

export function checkShop(url: string): CheckShop | null {
  return shopCheckers.find((checker) => checker.matches(url)) ?? null;
}