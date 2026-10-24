import type { Metadata } from "next";
import { AuthProvider } from "./components/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bus Ticketing",
    template: "%s | Bus Ticketing",
  },
  description:
    "Book bus tickets online for Cebu, Bato, Oslob, Boljoon and Dalaguete. Manage reservations, view e-tickets and track your trips in one place.",
  icons: {
    icon: [{ url: "/BUSLOGO.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/BUSLOGO.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider
          realtimeConfig={{
            // The anon key is designed to be public. NEXT_PUBLIC values are
            // replaced at build time by Next.js and are used by the browser
            // Realtime client; server variables remain a fallback.
            url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
            anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
          }}
        >
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
