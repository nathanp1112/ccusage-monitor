'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-md">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <span className="text-white/30">|</span>
        <Link
          href="/playground"
          className="text-sm font-medium text-white/90 transition-colors hover:text-white"
        >
          3D Playground
        </Link>
      </nav>
      <div className="pt-12">{children}</div>
    </div>
  )
}
