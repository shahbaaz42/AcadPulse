import "./globals.css";

export const metadata = {
  title: "AcadPulse",
  description: "Integrated Education Management & Intelligence Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
