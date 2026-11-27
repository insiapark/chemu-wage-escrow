import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/500.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "@fontsource/ibm-plex-sans-kr/700.css";
import "./globals.css";

export const metadata: Metadata = { title: "체무 · 일한 만큼, 차곡차곡", description: "계약부터 일당 보관까지, 알바생과 사장님이 함께 확인하는 체무 시연 앱" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><Providers>{children}</Providers></body></html>;
}
