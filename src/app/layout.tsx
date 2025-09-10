// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Topbar from "@/components/Topbar";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Student–Teacher Booking",
  description: "Modern booking system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {/* No DevTools provider here */}
          <Topbar />
          <main className="container py-6">{children}</main>
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </body>
    </html>
  );
}
