const i = setInterval(() => {
  if ((globalThis as any).turnstile) {
    clearInterval(i);
    (globalThis as any).turnstile.render = (a: any, b: any) => {
      let p = {
        type: "TurnstileTaskProxyless",
        websiteKey: b.sitekey,
        websiteURL: (globalThis as any).location.href,
        data: b.cData,
        pagedata: b.chlPageData,
        action: b.action,
        userAgent: (globalThis as any).navigator ? (globalThis as any).navigator.userAgent : ""
      }
      if (typeof console.log === "function") {
        console.log(JSON.stringify(p));
      }
      (globalThis as any).tsCallback = b.callback
      return 'foo'
    }
  }
}, 10)  