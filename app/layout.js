import "./globals.css";

export const metadata = {
  title: "TICKER — Ranked Trading Battle Royale",
  description:
    "A 100-player, five-second trading battle royale. First to $30,000 wins.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
