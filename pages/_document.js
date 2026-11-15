import { Html, Head, Main, NextScript } from "next/document";

const INTRO_BOOT_SCRIPT = `(function(){try{try{var a=localStorage.getItem("divine:accent");if(!a){var raw=localStorage.getItem("viv:settings");if(raw){var s=JSON.parse(raw);if(s&&s.accent)a=s.accent;}}if(a==="autumn"||a==="gold"||a==="mono"){document.documentElement.dataset.accent=a;}}catch(e){}var p=location.pathname||"/",q=location.search||"",u=new URLSearchParams(q);if(/^\\/(watch|auth|admin|api)(\\/|$)/.test(p)||u.has("room")){try{sessionStorage.setItem("divine:intro-seen","1");}catch(e){}return;}if(u.get("nointro")==="1")return;if(navigator.webdriver)return;if(/bot|crawler|spider|crawling|headless|lighthouse/i.test(navigator.userAgent||""))return;if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(navigator.connection&&navigator.connection.saveData)return;try{if(localStorage.getItem("divine:intro-enabled")==="false")return;}catch(e){}try{if(sessionStorage.getItem("divine:intro-seen"))return;}catch(e){}document.documentElement.classList.add("divine-intro-pending");}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#0A0807" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="preload"
          href="/fonts/NS-Sans-Medium.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/NS-Sans-Bold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Creato-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: INTRO_BOOT_SCRIPT }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
