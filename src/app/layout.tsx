import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FocusGroupAI",
  description: "Virtual focus group manager powered by AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold tracking-tight">
              FocusGroupAI
            </a>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <a href="/" className="hover:text-foreground transition-colors">
                Sessoes
              </a>
              <a
                href="/settings/dimensions"
                className="hover:text-foreground transition-colors"
              >
                Dimensoes
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          {children}
        </main>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
