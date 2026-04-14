import * as fs from 'node:fs';
import { Page, Response } from 'playwright';
import { CheckShop, ScreenshotResult, ShopSiteEnum } from '.';
import { PlaywrightBrowserSingleton } from '../PlaywrightBrowserSingleton';

const outputDir = process.env.OUTPUT_DIR || `${process.cwd()}/output`;
const templatesDir = process.env.TEMPLATES_DIR || `${process.cwd()}/templates`;
const htmlFilePath = `${outputDir}/shopee.html`;

const defaultSearchSuggestions = `
  <div bis_skin_checked="1">
    <div bis_skin_checked="1" class="QaSByp">
      <div class="zZbJYF" bis_skin_checked="1">
        <a aria-hidden="false" class="uaKe53"
          href="/search?keyword=%C4%91%E1%BB%93ng%20h%E1%BB%93%20th%C3%B4ng%20minh%20cho%20b%C3%A9%20g%C3%A1i%20ti%E1%BB%83u%20h%E1%BB%8Dc%20g%E1%BB%8Di%20%C4%91%C6%B0%E1%BB%A3c">Đồng
          Hồ Thông Minh Cho Bé Gái Tiểu Học Gọi Được</a><a aria-hidden="false" class="uaKe53"
          href="/search?keyword=quy%E1%BB%83n%20h%C3%ACnh%20d%C3%A1n%20sticker">Quyển Hình Dán
          Sticker</a><a aria-hidden="false" class="uaKe53" href="/search?keyword=%C3%A1o%20h%C3%A8">Áo
          Hè</a><a aria-hidden="false" class="uaKe53"
          href="/search?keyword=iphone%2016%20pro%20max%201k%20si%C3%AAu%20r%E1%BA%BB">iPhone 16 Pro Max
          1k Siêu Rẻ</a><a aria-hidden="false" class="uaKe53"
          href="/search?keyword=v%C3%A1y%20ti%E1%BB%83u%20th%C6%B0%20sang%20ch%E1%BA%A3nh%20tr%E1%BB%85%20vai">Váy
          Tiểu Thư Sang Chảnh Trễ Vai</a><a aria-hidden="true" tabindex="-1" class="uaKe53"
          href="/search?keyword=son%20b%C3%B3ng%20romand%20ch%C3%ADnh%20h%C3%A3ng">Son Bóng Romand Chính
          Hãng</a><a aria-hidden="true" tabindex="-1" class="uaKe53"
          href="/search?keyword=g%E1%BA%A5u%20b%C3%B4ng%20%C4%91%C3%A1ng%20y%C3%AAu">Gấu Bông Đáng
          Yêu</a><a aria-hidden="true" tabindex="-1" class="uaKe53"
          href="/search?keyword=50%20k%E1%BA%B9p%20t%C3%B3c">50 Kẹp Tóc</a><a aria-hidden="true"
          tabindex="-1" class="uaKe53"
          href="/search?keyword=qu%E1%BA%A1t%20c%E1%BA%A7m%20tay%20pin%20tr%C3%A2u">Quạt Cầm Tay Pin
          Trâu</a><a aria-hidden="true" tabindex="-1" class="uaKe53"
          href="/search?keyword=sadal%20n%E1%BB%AF">Sadal Nữ</a>
      </div>
    </div>
  </div>
`;

export class ShopeeCheckShop extends CheckShop {
  readonly site = ShopSiteEnum.Shopee;

  matches(url: string): boolean {
    const keywords = [
      'SHOPEE',
      'VN.SHP',
      'VN.XIAPIBUY',
    ]
    return keywords.some(keyword => url.toUpperCase().includes(keyword));
  }

  normalizeUrl(url: string): string {
    if (url?.toUpperCase().includes('VN.XIAPIBUY')) {
      return url.replaceAll('vn.xiapibuy.com', 'shopee.vn');
    }
    return url;
  }

  private removeScriptsFromHtml(html: string): string {
    let cleanedHtml = html;
    cleanedHtml = cleanedHtml.replaceAll(/<script[^>]*>function\s+loadScripts\(.*?<\/script>/gs as any, '');
    cleanedHtml = cleanedHtml.replaceAll(/<script[^>]*>function\s+loadStyleLink\(.*?<\/script>/gs as any, '');
    return cleanedHtml;
  }

  private async saveHtmlResponse(html: string, filePath: string): Promise<void> {
    try {
      const cleanedHtml = this.removeScriptsFromHtml(html);
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, cleanedHtml);
      console.log(`💾 [SHOPEE HTML SAVED] File saved to: ${filePath}`);
    } catch (e) {
      console.log(`❌ [SHOPEE HTML SAVE ERROR] Failed to save HTML: ${e}`);
    }
  }

  private async captureScreenshotItemFromHtml(htmlPath: string): Promise<{ buffer: Buffer, title: string } | undefined> {
    const context = await PlaywrightBrowserSingleton.getContext();
    if (!context) return undefined;

    const page = await context.newPage();
    if (!page) return undefined;

    try {
      await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Chờ thêm 10 giây để đảm bảo tất cả nội dung động được tải
      console.log(`⏳ [SHOPEE SCREENSHOT] Waiting for 10 seconds to ensure all dynamic content is loaded`);
      await new Promise<void>(r => setTimeout(r, 10000));
      const buffer = await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: 1440, height: 1024 } });
      console.log(`📸 [SHOPEE SCREENSHOT] Screenshot captured from HTML file`);
      const title = await page.title();

      return { buffer, title };
    } catch (e) {
      console.log(`⚠️ [SHOPEE SCREENSHOT] Failed to capture screenshot from HTML: ${e}`);
      return undefined;
    } finally {
      await page.close();
    }
  }

  private async captureScreenshotShopFromHtml(shopInfo: any, searchSuggestions: any[], shopCategories: any[], shopItems: any[]): Promise<{ buffer: Buffer, title: string } | undefined> {
    const context = await PlaywrightBrowserSingleton.getContext();
    if (!context) return undefined;

    const page = await context.newPage();
    if (!page) return undefined;

    try {
      const htmlPath = shopInfo?.data?.is_official_shop ? `${templatesDir}/shopee-mall-template.html` : `${templatesDir}/shopee-shop-template.html`;
      const htmlTemplate = fs.readFileSync(htmlPath, 'utf-8');
      const filledHtml = this.fillShopInfoInTemplate(htmlTemplate, shopInfo, searchSuggestions, shopCategories, shopItems);
      page.setContent(filledHtml, { waitUntil: 'domcontentloaded' });
      // Chờ thêm 10 giây để đảm bảo tất cả nội dung động được tải
      console.log(`⏳ [SHOPEE SHOP HTML] Waiting for 10 seconds to ensure all dynamic content is loaded`);
      await new Promise<void>(r => setTimeout(r, 10000));
      const buffer = await page.screenshot({ fullPage: true });
      const title = shopInfo.data?.name || 'Shop';
      console.log(`📸 [SHOPEE SHOP HTML] Screenshot captured from shop info`);
      return { buffer, title };
    } catch (e) {
      console.log(`⚠️ [SHOPEE SHOP HTML] Failed to capture screenshot from shop info: ${e}`);
      return undefined;
    } finally {
      await page.close();
    }
  }

  private formatNumberWithK(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replaceAll('.0k', 'k').concat('k');
    }
    return String(num);
  }

  private formatPrice(price: number | string): string {
    const numPrice = typeof price === 'string' ? Number.parseInt(price) : price;
    if (!numPrice) return '0';
    // Format: 12900000000 => 129.000 (divide by 100M, add thousand separator with dot)
    const formattedPrice = (numPrice / 100000000).toFixed(0);
    return formattedPrice.replaceAll(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  private formatJoinDate(timestamp: number | string): string {
    if (!timestamp) return 'N/A';

    // Convert to milliseconds if needed
    const ctimeMs = typeof timestamp === 'string' ? Number.parseInt(timestamp) * 1000 : timestamp * 1000;
    const now = Date.now();
    const diffMs = now - ctimeMs;

    // Calculate months
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));

    if (diffMonths < 48) {
      return `${diffMonths} Tháng Trước`;
    }

    // Convert to years if >= 48 months
    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} Năm Trước`;
  }

  private formatResponseTime(seconds: number): string {
    if (!seconds || seconds === 0) return 'trong vài phút';

    const minutes = seconds / 60;
    const hours = minutes / 60;
    const days = hours / 24;

    if (hours < 1) {
      return 'trong vài phút';
    }

    if (hours < 12) {
      return 'trong vài giờ';
    }

    if (days < 1) {
      return 'trong ngày';
    }

    return 'trong vài ngày';
  }

  private fillOnlineStatus(lastActiveTime: number, isHoliday: boolean): string {
    if (isHoliday) return `
      <div class="section-seller-overview-horizontal__holiday-mode" bis_skin_checked="1">
        <span class="section-seller-overview-horizontal__holiday-symbol">
            <svg enable-background="new 0 0 15 15" viewBox="0 0 15 15" x="0" y="0" class="shopee-svg-icon">
              <polyline fill="none" points="7.2 1 7.2 7.8 12 7.8" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"></polyline>
            </svg>
        </span>
        Đang tạm nghỉ bán
      </div>
    `;
    if (!lastActiveTime) return `
      <div class="section-seller-overview-horizontal__active-time" bis_skin_checked="1">Online vài giây trước</div>
    `;

    const lastActiveMs = lastActiveTime * 1000;
    const now = Date.now();
    const diffMs = now - lastActiveMs;

    // Less than 1 minute
    if (diffMs < 60000) {
      return `
        <div class="section-seller-overview-horizontal__active-time" bis_skin_checked="1">Online vài giây trước</div>
      `;
    }

    // Less than 1 hour
    if (diffMs < 3600000) {
      const minutes = Math.round(diffMs / 60000);
      return `
        <div class="section-seller-overview-horizontal__active-time" bis_skin_checked="1">Online ${minutes} phút trước</div>
      `;
    }

    // Less than 1 day
    if (diffMs < 86400000) {
      const hours = Math.round(diffMs / 3600000);
      return `
        <div class="section-seller-overview-horizontal__active-time" bis_skin_checked="1">Online ${hours} giờ trước</div>
      `;
    }

    // Less than 30 days
    if (diffMs < 2592000000) {
      const days = Math.round(diffMs / 86400000);
      return `
        <div class="section-seller-overview-horizontal__active-time" bis_skin_checked="1">Online ${days} ngày trước</div>
      `;
    }

    // 30 to 90 days
    if (diffMs <= 7776000000) {
      const days = Math.round(diffMs / 86400000);
      return `
        <div class="section-seller-overview-horizontal__inactive-indicator" bis_skin_checked="1">
          <span class="section-seller-overview-horizontal__inactive-symbol">
              <svg enable-background="new 0 0 15 15" viewBox="0 0 15 15" x="0" y="0" class="shopee-svg-icon icon-exclamation-mark">
                <g>
                    <path d="m7.5 10.6c.6 0 1-.5 1-1.1v-8.3c0-.6-.4-1.1-1-1.1s-1 .5-1 1.1v8.3c0 .6.4 1.1 1 1.1z"></path>
                    <circle cx="7.5" cy="13.4" r="1.5"></circle>
                </g>
              </svg>
          </span>
          Online ${days} ngày trước
        </div>
      `;
    }

    // More than 90 days
    const months = Math.round(diffMs / 2592000000);
    return `
      <div class="section-seller-overview-horizontal__inactive-indicator" bis_skin_checked="1">
        <span class="section-seller-overview-horizontal__inactive-symbol">
            <svg enable-background="new 0 0 15 15" viewBox="0 0 15 15" x="0" y="0" class="shopee-svg-icon icon-exclamation-mark">
              <g>
                  <path d="m7.5 10.6c.6 0 1-.5 1-1.1v-8.3c0-.6-.4-1.1-1-1.1s-1 .5-1 1.1v8.3c0 .6.4 1.1 1 1.1z"></path>
                  <circle cx="7.5" cy="13.4" r="1.5"></circle>
              </g>
            </svg>
        </span>
        Online ${months} tháng trước
      </div>
    `;
  }

  private fillCancelRateInTemplate(cancelRate: string): string {
    const escapeHtml = (s: string) => String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    return `
        <div class="section-seller-overview__item" bis_skin_checked="1">
          <div class="section-seller-overview__item-icon-wrapper" bis_skin_checked="1"><svg
              width="13" height="14">
              <g fill="currentColor" fill-rule="nonzero" stroke-width="0.4">
                <path
                  d="M9.49.903h.453c.498 0 .903.404.903.903v4.993a.452.452 0 1 0 .904 0V1.806C11.75.808 10.94 0 9.944 0H9.49a.452.452 0 1 0 0 .903zM5.879 12.645H1.813a.903.903 0 0 1-.903-.902V1.806c0-.499.405-.903.903-.903h.452a.451.451 0 0 0 0-.903h-.452C.816 0 .007.808.007 1.806v9.936c0 .998.809 1.806 1.806 1.806h4.065a.452.452 0 0 0 0-.903z">
                </path>
                <path
                  d="M2.265 0H9.49a.451.451 0 1 1 0 .903H2.265a.452.452 0 0 1 0-.903zm.904 3.613H9.04a.452.452 0 1 1 0 .903H3.169a.452.452 0 1 1 0-.903zm0 2.71h3.613a.452.452 0 1 1 0 .904H3.169a.452.452 0 0 1 0-.904zm0 2.709h1.806a.452.452 0 1 1 0 .905H3.169a.452.452 0 0 1 0-.905zm6.322 4.065a2.258 2.258 0 1 0 0-4.515 2.258 2.258 0 0 0 0 4.515zm0 .903a3.161 3.161 0 1 1 0-6.323 3.161 3.161 0 0 1 0 6.323z">
                </path>
                <path
                  d="M7.575 12.117l3.193-3.194a.451.451 0 1 1 .638.639l-3.192 3.192a.451.451 0 0 1-.639-.637z">
                </path>
              </g>
            </svg></div>
          <div class="section-seller-overview__item-text" bis_skin_checked="1">
            <div class="section-seller-overview__item-text-name" bis_skin_checked="1">Tỉ lệ Shop
              hủy đơn:&nbsp;</div>
            <div class="section-seller-overview__item-text-value" bis_skin_checked="1">${escapeHtml(cancelRate)}<div
                class="section-seller-overview__inline-icon section-seller-overview__inline-icon--help"
                bis_skin_checked="1"><svg width="10" height="10">
                  <g fill="currentColor" fill-rule="nonzero" color="currentColor" stroke-width="0">
                    <path
                      d="M5 10A5 5 0 1 1 5 0a5 5 0 0 1 0 10zM5 .675a4.325 4.325 0 1 0 0 8.65 4.325 4.325 0 0 0 0-8.65z">
                    </path>
                    <path
                      d="M6.235 5.073c.334-.335.519-.79.514-1.264a1.715 1.715 0 0 0-.14-.684 1.814 1.814 0 0 0-.933-.951A1.623 1.623 0 0 0 5 2.03a1.66 1.66 0 0 0-.676.14 1.772 1.772 0 0 0-.934.948c-.093.219-.14.454-.138.691a.381.381 0 0 0 .106.276c.07.073.168.113.27.11a.37.37 0 0 0 .348-.235c.02-.047.031-.099.03-.15a1.006 1.006 0 0 1 .607-.933.954.954 0 0 1 .772.002 1.032 1.032 0 0 1 .61.93c.003.267-.1.525-.288.716l-.567.537c-.343.35-.514.746-.514 1.187a.37.37 0 0 0 .379.382c.1.002.195-.037.265-.108a.375.375 0 0 0 .106-.274c0-.232.097-.446.29-.642l.568-.534zM5 6.927a.491.491 0 0 0-.363.152.53.53 0 0 0 0 .74.508.508 0 0 0 .726 0 .53.53 0 0 0 0-.74A.491.491 0 0 0 5 6.927z">
                    </path>
                  </g>
                </svg></div>
            </div>
          </div>
        </div>
    `;
  }

  private fillVerifiedShopInTemplate(): string {
    return `
      <div class="section-seller-overview-horizontal__preferred-badge-wrapper"
        bis_skin_checked="1">
        <div class="HN0qML PF18XJ zTpjcR" bis_skin_checked="1">Yêu thích</div>
      </div>`
  }

  private fillSearchSuggestionsInTemplate(collections: any[]): string {
    if (!collections?.length) return defaultSearchSuggestions
    return `
      <div bis_skin_checked="1">
        <div class="QaSByp" bis_skin_checked="1">
            <div class="zZbJYF" bis_skin_checked="1">
            ${collections.map((c) => `
              <a
                aria-hidden="false"
                class="uaKe53"
                href="/"
                >${c.text}</a
              >`
    ).join('')}
            </div>
        </div>
      </div>
    `
  }

  private fillCategoriesInTemplate(categories: any[]): string {
    const slideCategories = categories?.slice(0, 3) || [];
    return `
      <div
        class="container navbar-with-more-menu__wrapper navbar-with-more-menu__wrapper--no-shadow"
        style="background-color: rgb(255, 255, 255)" bis_skin_checked="1">
        <div class="navbar-with-more-menu__items" bis_skin_checked="1">
          <a class="navbar-with-more-menu__item navbar-with-more-menu__item--active"
            href="/pregseenhealthstore"><span>Dạo</span>
          </a>
          <a class="navbar-with-more-menu__item" href="/pregseenhealthstore#product_list">
            <span>TẤT CẢ SẢN PHẨM</span>
          </a>
          ${slideCategories.map((c) => `
            <a class="navbar-with-more-menu__item"
              href="/">
              <span>${c.display_name}</span>
            </a>
            `).join('')}
        </div>
      </div>
    `
  }

  private fillSeoItemsInTemplate(template: string, items: any[]): string {
    return `
      ${items?.map((item) => `
        <div class="col-xs-2 shop-collection-view__item" bis_skin_checked="1">
        <div bis_skin_checked="1" style="height: 100%">
          <div
            aria-label="Product card: ${item.name}"
            bis_skin_checked="1" style="height: 100%">
            <div class="shopee_ic" bis_skin_checked="1" style="display: contents">
              <div
                class="h-full h-full duration-100 ease-sharp-motion-curve hover:shadow-hover active:shadow-active hover:-translate-y-[1px] active:translate-y-0 relative hover:z-[10] box-content relative border border-solid border-shopee-black9"
                aria-label="Product card" bis_skin_checked="1" style="
                    border-radius: 6px;
                    box-sizing: border-box;
                  ">
                <a class="contents"
                  href="/">
                  <div
                    class="flex flex-col bg-white cursor-pointer h-full overflow-hidden"
                    bis_skin_checked="1" style="
                        border-radius: 6px;
                      ">
                    <div class="w-full relative z-0" bis_skin_checked="1" style="
                          padding-top: 100%;
                        ">
                      <picture class="_displayContents_yazkc_21">
                        <source srcset="
                              https://down-vn.img.susercontent.com/file/${item.image}@resize_w320_nl.webp 1x,
                              https://down-vn.img.susercontent.com/file/${item.image}@resize_w640_nl.webp 2x
                            " type="image/webp" class="_displayContents_yazkc_21" />
                        <img width="320" loading="lazy"
                          class="_image_yazkc_11 lazyload inset-y-0 w-full h-full pointer-events-none object-contain absolute"
                          srcset="
                              https://down-vn.img.susercontent.com/file/${item.image}@resize_w320_nl 1x,
                              https://down-vn.img.susercontent.com/file/${item.image}@resize_w640_nl 2x
                            "
                          src="https://down-vn.img.susercontent.com/file/${item.image}"
                          alt=" ${item.name} "
                          style="
                              vertical-align: middle;
                            " />
                      </picture>
                      <div class="absolute bottom-0 left-0 z-10 w-full w-full h-hull"
                        aria-label="image overlay,src:https://down-vn.img.susercontent.com/file/vn-11134258-81ztc-mmspoc93vqpy46"
                        bis_skin_checked="1">
                      
                      </div>
                      <div class="absolute bottom-0 right-0 z-30 flex pr-1 pb-1"
                        aria-hidden="true" bis_skin_checked="1">
                        <div data-testid="badge-video" class="w-5 h-5 stroke-none"
                          bis_skin_checked="1" style="
                              background-image: url(&quot;https://deo.shopeemobile.com/shopee/modules-federation/live/0/shopee__item-card-centralisation/0.1.5/pc/43bd6a890841685e2fea.svg&quot;);
                              background-size: cover;
                              background-repeat: no-repeat;
                            "></div>
                      </div>
                    </div>
                    <div class="p-2 flex-1 flex flex-col justify-between"
                      bis_skin_checked="1">
                      <div class="space-y-1 mb-1 flex-1 flex flex-col justify-between"
                        bis_skin_checked="1">
                        <div
                          class="whitespace-normal line-clamp-2 break-words min-w-0 min-h-[2.5rem] text-sm th:text-[12px] my:text-[12px] km:text-[12px]"
                          bis_skin_checked="1">
                          ${item.name}
                        </div>
                        <div class="flex items-center flex items-center"
                          bis_skin_checked="1" style="
                              visibility: visible;
                            ">
                          <div
                            class="max-w-full min-w-0 flex-grow-1 flex-shrink-0 mr-[2px] truncate text-shopee-primary flex items-center font-medium"
                            bis_skin_checked="1">
                            <span data-testid="a11y-label"
                              aria-label="promotion price"></span>
                            <div class="truncate flex items-baseline"
                              bis_skin_checked="1">
                              <span
                                class="font-medium mr-px text-xs/sp14"></span><span
                                class="truncate text-base/5 font-medium">${this.formatPrice(item.price)}</span><span
                                class="font-medium mr-px text-xs/sp14">₫</span>
                            </div>
                          </div>
                          <div
                            class="text-shopee-primary font-medium bg-shopee-pink py-0.5 px-1 text-sp10/3 h-4 flex items-center rounded-[2px] font-[400] flex-shrink-0 mr-1"
                            bis_skin_checked="1">
                            <span data-testid="a11y-label"
                              aria-label="-${item.discount}"></span>-${item.discount}
                          </div>
                        </div>
                      </div>
                      <div class="flex flex-col justify-between flex-grow"
                        bis_skin_checked="1">
                        <div bis_skin_checked="1"></div>
                        <div
                          class="flex items-center max-w-full space-x-1 justify-between mb-2"
                          bis_skin_checked="1" style="
                              visibility: visible;
                            ">
                          <div class="flex items-center space-x-1 min-w-0"
                            bis_skin_checked="1">
                            <div
                              class="relative px-1 flex items-center space-x-0.5 h-[1.125rem] flex-none"
                              bis_skin_checked="1" style="
                                  background-color: rgb(
                                    255,
                                    248,
                                    228
                                  );
                                  margin: 1px;
                                  box-shadow: rgb(
                                      255,
                                      187,
                                      0
                                    )
                                    0px 0px
                                    0px 0.5px;
                                  border-radius: 2px;
                                ">
                              <img
                                src="https://down-vn.img.susercontent.com/file/id-11134258-7r98o-ly1pxywrszyh0b_tn.webp"
                                alt="rating-star" class="inline-block align-middle"
                                style="
                                    height: 0.625rem;
                                    width: 0.625rem;
                                  " /><span
                                class="inline-block truncate text-xs/sp14" style="
                                    color: rgb(
                                      0,
                                      0,
                                      0
                                    );
                                  ">${Math.round((item?.item_rating?.rating_star || 0) * 10) / 10}</span>
                            </div>
                            <div
                              class="ml-1 h-sp10 scale-x-50 border-l border-shopee-black9 mx-1"
                              bis_skin_checked="1"></div>
                            <div
                              class="truncate text-shopee-black87 text-xs min-h-4 flex-shrink"
                              bis_skin_checked="1">
                              Đã bán ${this.formatNumberWithK(item.historical_sold)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="flex-shrink" bis_skin_checked="1"></div>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      `).join('')}
    `
  }

  private fillShopInfoInTemplate(template: string, shopInfo: any, searchSuggestions: any[], shopCategories: any[], shopItems: any[]): string {
    const data = shopInfo?.data || shopInfo || {};
    const shopName = data?.name || 'N/A';
    const shopDesc = data?.description || 'N/A';
    const productCount = data?.item_count || 0;
    const followerCount = data?.follower_count || 0;
    const followingCount = data?.account?.following_count || 0;
    const rating = Math.round((data?.rating_star || 0) * 10) / 10;
    const shopBackgroundImage = data?.cover ? `https://down-zl-vn.img.susercontent.com/${data?.cover}_tn.webp` : 'https://deo.shopeemobile.com/shopee/shopee-pcmall-live-sg/shopmicrofe/dc2a8ae5803b2531c9a5.jpg';
    const shopAvatarImage = `https://down-zl-vn.img.susercontent.com/${data?.account?.portrait}_tn.webp`;
    const cancelRate = data?.seller_metrics?.cancellation_rate ? `${Math.round((data.seller_metrics.cancellation_rate || 0) * 100) / 100}%` : '';
    const isVerifiedShop = data?.is_shopee_verified;

    // Calculate total reviews from rating breakdown
    const ratingBreakdown = data?.shop_rating || {};
    const totalReviews = (ratingBreakdown.rating_good || 0) +
      (ratingBreakdown.rating_normal || 0) +
      (ratingBreakdown.rating_bad || 0);
    const reviewCount = this.formatNumberWithK(totalReviews);

    const chatResponseRate = data?.response_rate > 0 ? `${Math.round((data?.response_rate || 0) * 100) / 100}%` : 'Chưa có dữ liệu';
    const chatResponseTime = data?.response_rate > 0 ? this.formatResponseTime(data?.response_time || 0) : 'Trong vài ngày';
    const joinDate = this.formatJoinDate(data?.ctime);

    const escapeHtml = (s: string) => String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    // Replace all placeholders
    let out = template
      .replaceAll(/{{\s*PAGE_TITLE\s*}}/g, escapeHtml(shopName))
      .replaceAll(/{{\s*SHOP_NAME\s*}}/g, escapeHtml(shopName))
      .replaceAll(/{{\s*SHOP_DESCRIPTION\s*}}/g, escapeHtml(shopDesc))
      .replaceAll(/{{\s*SHOP_STATUS\s*}}/g, this.fillOnlineStatus(data?.last_active_time, data?.vacation))
      .replaceAll(/{{\s*PRODUCT_COUNT\s*}}/g, escapeHtml(String(productCount)))
      .replaceAll(/{{\s*FOLLOWER_COUNT\s*}}/g, escapeHtml(String(followerCount)))
      .replaceAll(/{{\s*FOLLOWING_COUNT\s*}}/g, escapeHtml(String(followingCount)))
      .replaceAll(/{{\s*RATING\s*}}/g, escapeHtml(String(rating)))
      .replaceAll(/{{\s*REVIEW_COUNT\s*}}/g, escapeHtml(String(reviewCount)))
      .replaceAll(/{{\s*CHAT_RESPONSE_RATE\s*}}/g, escapeHtml(String(chatResponseRate)))
      .replaceAll(/{{\s*CHAT_RESPONSE_TIME\s*}}/g, escapeHtml(String(chatResponseTime)))
      .replaceAll(/{{\s*JOIN_DATE\s*}}/g, escapeHtml(String(joinDate)))
      .replaceAll(/{{\s*SHOP_BACKGROUND_IMAGE\s*}}/g, escapeHtml(shopBackgroundImage))
      .replaceAll(/{{\s*SHOP_AVATAR_IMAGE\s*}}/g, escapeHtml(shopAvatarImage))
      .replaceAll(/{{\s*CANCEL_RATE\s*}}/g, cancelRate ? this.fillCancelRateInTemplate(cancelRate) : '')
      .replaceAll(/{{\s*IS_VERIFIED_SHOP\s*}}/g, isVerifiedShop ? this.fillVerifiedShopInTemplate() : '')
      .replaceAll(/{{\s*SEARCH_SUGGESTIONS\s*}}/g, this.fillSearchSuggestionsInTemplate(searchSuggestions))
      .replaceAll(/{{\s*SHOP_MENU_ITEMS\s*}}/g, this.fillCategoriesInTemplate(shopCategories))
      .replaceAll(/{{\s*RECOMMENDED_PRODUCTS\s*}}/g, this.fillSeoItemsInTemplate(template, shopItems));

    return out;
  }
  private isValidHtmlResponse(text: string, status: number, responseUrl: string, targetUrl: string): boolean {
    return status === 200 && text.includes('text/shopee-short-url-checked') &&
      (responseUrl.includes('shopee.vn') || responseUrl === targetUrl);
  }

  private findClosingBraceIndex(html: string, startIndex: number): number {
    let braceCount = 0;
    for (let i = startIndex; i < html.length; i++) {
      if (html[i] === '{') braceCount++;
      if (html[i] === '}') braceCount--;
      if (braceCount === 0) {
        return i + 1;
      }
    }
    return startIndex;
  }

  private extractInitialState(html: string): Record<string, any> | undefined {
    try {
      const initialStateIndex = html.indexOf('"initialState":');
      if (initialStateIndex === -1) return undefined;

      const braceIndex = html.indexOf('{', initialStateIndex + '"initialState":'.length);
      if (braceIndex === -1) return undefined;

      const endIndex = this.findClosingBraceIndex(html, braceIndex);
      const jsonStr = html.substring(braceIndex, endIndex);
      return JSON.parse(jsonStr);
    } catch (e) {
      return undefined;
    }
  }

  private extractItems(initialState: Record<string, any>): Record<string, any> | undefined {
    try {
      if (initialState?.item?.items) {
        return initialState.item.items;
      }
      return undefined;
    } catch (e) {
      console.log(`⚠️ [SHOPEE EXTRACT ITEMS] Error extracting items: ${e}`);
      return undefined;
    }
  }

  private verifyHtmlContent(html: string): boolean {
    if(html.includes("Sản phẩm này không tồn tại")) {
      return false;
    }
    const initialState = this.extractInitialState(html);
    if (!initialState) {
      console.log(`⚠️ [SHOPEE VERIFY] No initialState found in HTML`);
      return false;
    }

    const items = this.extractItems(initialState);
    if (!items || Object.keys(items).length === 0) {
      console.log(`⚠️ [SHOPEE VERIFY] No items found in initialState`);
      return false;
    }

    console.log(`✅ [SHOPEE VERIFY] HTML content is valid - initialState and items found`);
    return true;
  }

  private async handlePageResponse(response: Response, url: string) {
    const responseUrl = response.url();
    const status = response.status();

    // Skip redirect and non-successful responses
    if (status < 200 || status >= 400) return;

    let text = '';
    try {
      const body = await response.body();
      if (response.headers()['content-type']?.includes('text/html') && body) {
        text = await response.text();
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      if (!errorMessage.includes('Response body is unavailable')) {
        console.log(`⚠️ [SHOPEE RESPONSE] Error reading response text: ${errorMessage}`);
      }
    }

    if (!text) return;

    if (!this.isValidHtmlResponse(text, status, responseUrl, url)) return;

    const innitialState = this.extractInitialState(text);

    if (!innitialState) return;

    fs.mkdirSync(outputDir, { recursive: true });

    await this.saveHtmlResponse(text, htmlFilePath);
  }

  async screenshot(url: string): Promise<ScreenshotResult> {
    const context = await PlaywrightBrowserSingleton.getContext();
    if (!context) throw new Error('Cannot create Playwright context');
    const page = await context.newPage();
    if (!page) throw new Error('Cannot create Playwright page');

    // Delete existing file before saving new one
    try {
      if (fs.existsSync(htmlFilePath)) {
        fs.unlinkSync(htmlFilePath);
        console.log(`🗑️ [SHOPEE HTML FILE] Deleted existing HTML file at: ${htmlFilePath}`);
      }
    } catch (e) {
      console.log(`⚠️ [SHOPEE HTML FILE] No existing HTML file to delete or failed to delete: ${e}`);
    }

    let shopInfo: Record<string, any> | undefined;
    let searchSuggestions: any[] = [];
    let shopCategories: any[] = [];
    let shopItems: any[] = [];

    // Capture main page response HTML and API responses
    page.on('response', async (response: Response) => {
      try {
        const responseUrl = response.url();
        const status = response.status();

        // Check if this is the shop info API response
        if (responseUrl.includes('get_shop_base_v2') && status === 200) {
          try {
            const shopInfoData = await response.json();
            console.log(`🏪 [SHOPEE API] Shop info intercepted from page response`);
            shopInfo = shopInfoData;
            return;
          } catch (e) {
            // Continue to check if it's HTML response
            console.log(`⚠️ [SHOPEE RESPONSE] Error parsing shop info JSON: ${e}`);
          }
        }

        if (responseUrl.includes('search/search_suggestion') && status === 200) {
          try {
            const collectionsData = await response.json();
            console.log(`📚 [SHOPEE API] Shop collections intercepted from page response`);
            searchSuggestions = collectionsData?.data?.queries || [];
          } catch (e) {
            console.log(`⚠️ [SHOPEE RESPONSE] Error parsing shop collections JSON: ${e}`);
          }
        }

        if (responseUrl.includes('shop/get_categories') && status === 200) {
          try {
            const categoriesData = await response.json();
            console.log(`📚 [SHOPEE API] Shop categories intercepted from page response`);
            shopCategories = categoriesData?.data?.shop_categories || [];
          } catch (e) {
            console.log(`⚠️ [SHOPEE RESPONSE] Error parsing shop categories JSON: ${e}`);
          }
        }

        if (responseUrl.includes('shop/get_shop_seo') && status === 200) {
          try {
            const seoData = await response.json();
            console.log(`📚 [SHOPEE API] Shop SEO data intercepted from page response`);
            shopItems = seoData?.data?.items || [];
          } catch (e) {
            console.log(`⚠️ [SHOPEE RESPONSE] Error parsing shop SEO data JSON: ${e}`);
          }
        }

        // Xử lý case Product
        await this.handlePageResponse(response, url);
      } catch (e) {
        console.log(`⚠️ [SHOPEE RESPONSE] Error processing response: ${e}`);
      }
    });

    try {
      const normalizedUrl = this.normalizeUrl(url);
      console.log(`🌐 [SHOPEE CHECK SHOP] Navigating to ${normalizedUrl}...`);
      await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Chờ thêm 15 giây để đảm bảo tất cả nội dung động được tải
      await this.clickLanguageButton(page);
      await new Promise<void>(r => setTimeout(r, 15000));

      let isValidShop = await this.checkValidShop(page);

      if (!isValidShop) {
        console.log(`⚠️ [SHOPEE CHECK SHOP] Initial shop validation failed, checking for saved HTML file...`);
        const buffer = await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: 1440, height: 1024 } });
        return { site: this.site, status: "UNAVAILABLE", screenshot: buffer, shopTile: 'N/A' };
      }

      let buffer: Buffer;
      let shopTile: string | undefined = 'N/A';

      if (fs.existsSync(htmlFilePath)) {
        const htmlFileStats = fs.statSync(htmlFilePath);
        isValidShop = htmlFileStats.size > 0 && this.verifyHtmlContent(fs.readFileSync(htmlFilePath, 'utf-8'));
        console.log(`📄 [SHOPEE CHECK SHOP] HTML file exists at: ${htmlFilePath}`);
        const htmlScreenshot = await this.captureScreenshotItemFromHtml(htmlFilePath);
        buffer = htmlScreenshot?.buffer || await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: 1440, height: 1024 } });
        shopTile = htmlScreenshot?.title || shopTile;
      } else if (shopInfo) {
        console.log(`📊 [SHOPEE CHECK SHOP] Shop info found from API response, using it to determine shop status`);
        const htmlScreenshot = await this.captureScreenshotShopFromHtml(shopInfo, searchSuggestions, shopCategories, shopItems);
        buffer = htmlScreenshot?.buffer || await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: 1440, height: 1024 } });
        shopTile = htmlScreenshot?.title || shopTile;
      } else {
        console.log(`📄 [SHOPEE CHECK SHOP] HTML file does not exist, capturing screenshot directly from page`);
        buffer = await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: 1440, height: 1024 } });
      }

      const status = (!isValidShop && !shopInfo?.data) ? "UNAVAILABLE" : "AVAILABLE";
      console.log(`✅ [SHOPEE CHECK SHOP] Shop status: ${status}, shopTile: ${shopTile || 'N/A'}`);

      return { site: this.site, status, shopTile, screenshot: buffer };
    } finally {
      await page.close();
    }
  }

  private async clickLanguageButton(page: Page): Promise<void> {
    try {
      await page.click('button:has-text("Tiếng Việt")', { timeout: 5000 });
      console.log(`🌐 [SHOPEE CHECK SHOP] Clicked language button`);
      await new Promise<void>(r => setTimeout(r, 2000));
    } catch (e) {
      console.log(`⚠️ [SHOPEE CHECK SHOP] Error clicking language button: ${e}`);
    }
  }

  async checkValidShop(page: Page) {
    const invalidTexts = [
      'Shop này đã bị khoá bởi Shopee',
      'Shop này đã bị khoá',
      'Không thể tải Shop này',
      'Sản phẩm này không tồn tại'
    ]
    const isErrorPage = await page.evaluate((invalidTexts) => {
      const bodyText = document.body.innerText;
      return invalidTexts.some(text => bodyText.includes(text));
    }, invalidTexts);
    return !isErrorPage;
  }
}