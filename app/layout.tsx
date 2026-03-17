import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2d7a3a",
};

export const metadata: Metadata = {
  title: "GardenOS",
  description: "Interaktivt havekort til bede, træer, buske og noter.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GardenOS",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
        {/* Service Worker registration for PWA */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                var isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

                if (isDev) {
                  // ── DEV MODE: nuke all SWs + caches so every reload is fresh ──
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    regs.forEach(function(r) {
                      r.unregister().then(function() {
                        console.log('[GardenOS] SW unregistered (dev mode)');
                      });
                    });
                  });
                  caches.keys().then(function(keys) {
                    keys.forEach(function(k) { caches.delete(k); });
                    if (keys.length) console.log('[GardenOS] Cleared', keys.length, 'caches (dev mode)');
                  });
                } else {
                  // ── PRODUCTION: register SW with aggressive update ──
                  navigator.serviceWorker.addEventListener('message', function(evt) {
                    if (evt.data && evt.data.type === 'SW_UPDATED') {
                      console.log('[GardenOS] SW updated to', evt.data.version, '- reloading…');
                      window.location.reload();
                    }
                  });

                  window.addEventListener('load', async () => {
                    try {
                      var reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
                      reg.update();

                      if (reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                      }

                      reg.addEventListener('updatefound', function() {
                        var newSW = reg.installing;
                        if (!newSW) return;
                        newSW.addEventListener('statechange', function() {
                          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                            newSW.postMessage({ type: 'SKIP_WAITING' });
                          }
                        });
                      });

                      var refreshing = false;
                      navigator.serviceWorker.addEventListener('controllerchange', function() {
                        if (!refreshing) { refreshing = true; window.location.reload(); }
                      });
                    } catch (e) {}
                  });
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
