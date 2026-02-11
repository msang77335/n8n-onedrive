export interface ScreenshotQuery {
  provider: string;
  codes: string;
}

export function isUSPS(providerStr: string) {
  return providerStr.toUpperCase().includes('USPS');
}

export function isSPX(providerStr: string) {
  return providerStr.toUpperCase().includes('SPX');
}

export function isGiaoHangNhanh(providerStr: string) {
  return providerStr.toUpperCase().includes('GIAO HÀNG NHANH') || providerStr.toUpperCase().includes('GHN');
}

export function isJTExpress(providerStr: string) {
  return providerStr.toUpperCase().includes('J&T') || providerStr.toUpperCase().includes('JT EXPRESS');
}

export function isBestExpress(providerStr: string) {
  return providerStr.toUpperCase().includes('BEST EXPRESS');
}

export function isViettelPost(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('VIETTEL POST') || upperStr.includes('VTP');
}

export function isVnPost(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('VN POST') || upperStr.includes('VIETNAM POST');
}

export function isYunExpress(providerStr: string) {
  const upperStr = providerStr.toUpperCase();
  return upperStr.includes('YUN');
}

