import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Account Authentication',
    template: '%s | Prodily PM Academy',
  },
  robots: {
    index: false,
    follow: true,
  },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
