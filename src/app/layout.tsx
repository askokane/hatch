import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/session";
import { NavBar } from "@/components/layout/NavBar";
import { ToastProvider } from "@/components/ui/ToastProvider";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HATCH — where students build before they graduate",
  description: "A builder-serious network for college students: profiles, project rooms, and context-bearing intros.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-paper text-ink">
        <ToastProvider>
          <NavBar
            isAuthed={!!session}
            hasProfile={!!session?.profileId}
            isAdmin={!!session?.isAdmin}
            name={session?.name ?? null}
            handle={session?.handle ?? null}
            avatarSeed={session?.avatarSeed ?? null}
          />
          <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
