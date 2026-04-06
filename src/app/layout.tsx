import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ShiftSync',
  description: 'Multi-location staff scheduling for Coastal Eats',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  )
}
