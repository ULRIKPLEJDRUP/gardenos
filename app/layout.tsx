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
                window.addEventListener('load', async () => {
                  try {
                    // Register / get existing registration
                    const reg = await navigator.serviceWorker.register('/sw.js');

                    // Force check for a new SW every page-load
                    reg.update();

                    // If a new SW is waiting right now, tell it to activate
                    if (reg.waiting) {
                      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }

                    // When a new SW moves to waiting, activate it immediately
                    reg.addEventListener('updatefound', () => {
                      const newSW = reg.installing;
                      if (!newSW) return;
                      newSW.addEventListener('statechange', () => {
                        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                          newSW.postMessage({ type: 'SKIP_WAITING' });
                        }
                      });
                    });

                    // When the new SW takes control, reload to get fresh assets
                    let refreshing = false;
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                      if (!refreshing) {
                        refreshing = true;
                        window.location.reload();
                      }
                    });
                  } catch (e) {
                    // SW registration failed – app still works without it
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
