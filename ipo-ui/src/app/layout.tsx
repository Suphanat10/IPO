import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "./theme/ThemeRegistry";
import { AnalysisProvider } from "./lib/AnalysisContext";
import AppShell from "./components/AppShell";

export const metadata: Metadata = {
  title: "IPO Analysis — FA & Underwriter",
  description: "Thai IPO performance & advisor analysis dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body>
        <ThemeRegistry>
          <AnalysisProvider>
            <AppShell>{children}</AppShell>
          </AnalysisProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
