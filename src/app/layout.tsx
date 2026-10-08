import type { Metadata } from "next";
import "./globals.css";

// CSP script nonces require a fresh render for every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HaloPSA AI Assistant",
  description: "Secure HaloPSA ticket assistant",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
