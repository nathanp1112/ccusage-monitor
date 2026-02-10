'use client'

import Link from 'next/link'

interface Demo {
  href: string
  emoji: string
  title: string
  description: string
  gradient: string
  border: string
  glow: string
}

const demos: Demo[] = [
  {
    href: '/playground/v2',
    emoji: '\u{1F680}',
    title: 'V2 - Real Data',
    description: 'All 6 demos in one page powered by live API data from your team members.',
    gradient: 'from-indigo-500/20 to-fuchsia-500/20',
    border: 'hover:border-indigo-500/50',
    glow: 'hover:shadow-indigo-500/20',
  },
  {
    href: '/playground/tokens',
    emoji: '\u{1FA99}',
    title: 'Flying Token Coins',
    description: 'Tokens rain down like coins with realistic physics simulation and bouncing effects.',
    gradient: 'from-amber-500/20 to-yellow-500/20',
    border: 'hover:border-amber-500/50',
    glow: 'hover:shadow-amber-500/20',
  },
  {
    href: '/playground/meter',
    emoji: '\u{1F3AF}',
    title: '3D Usage Meter',
    description: 'A tilted gauge that shows your team burn rate with smooth animated needle.',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    border: 'hover:border-emerald-500/50',
    glow: 'hover:shadow-emerald-500/20',
  },
  {
    href: '/playground/podium',
    emoji: '\u{1F3C6}',
    title: '3D Leaderboard Podium',
    description: 'Top 3 members standing on an animated podium with spotlight effects.',
    gradient: 'from-violet-500/20 to-purple-500/20',
    border: 'hover:border-violet-500/50',
    glow: 'hover:shadow-violet-500/20',
  },
  {
    href: '/playground/planets',
    emoji: '\u{1FA90}',
    title: 'Orbiting Model Planets',
    description: 'Claude models rendered as planets orbiting in a miniature solar system.',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'hover:border-blue-500/50',
    glow: 'hover:shadow-blue-500/20',
  },
  {
    href: '/playground/city',
    emoji: '\u{1F3D9}\u{FE0F}',
    title: '3D Bar Chart City',
    description: 'Usage bars transformed into a 3D city skyline with glowing buildings.',
    gradient: 'from-rose-500/20 to-pink-500/20',
    border: 'hover:border-rose-500/50',
    glow: 'hover:shadow-rose-500/20',
  },
  {
    href: '/playground/mascot',
    emoji: '\u{1F916}',
    title: 'Claude Mascot',
    description: 'A 3D character that reacts to usage levels with expressive animations.',
    gradient: 'from-orange-500/20 to-amber-500/20',
    border: 'hover:border-orange-500/50',
    glow: 'hover:shadow-orange-500/20',
  },
]

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero section */}
      <div className="relative overflow-hidden px-6 py-16 text-center">
        {/* Background glow effect */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute left-1/4 top-20 h-[300px] w-[400px] rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute right-1/4 top-10 h-[300px] w-[400px] rounded-full bg-cyan-500/10 blur-3xl" />
        </div>

        <div className="relative z-10">
          <p className="mb-3 text-sm font-medium tracking-widest text-purple-400 uppercase">
            Experimental
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            3D Playground
          </h1>
          <p className="mx-auto max-w-xl text-lg text-white/50">
            Interactive 3D visualizations and experimental demos for
            exploring usage data in creative ways.
          </p>
        </div>
      </div>

      {/* Demo grid */}
      <div className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map((demo) => (
            <Link
              key={demo.href}
              href={demo.href as '/'}
              className={`group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition-all duration-300 ${demo.border} ${demo.glow} hover:scale-[1.03] hover:bg-white/[0.06] hover:shadow-2xl`}
            >
              {/* Gradient background on hover */}
              <div
                className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${demo.gradient}`}
              />

              <div className="relative z-10">
                <span className="mb-4 block text-4xl" role="img">
                  {demo.emoji}
                </span>
                <h2 className="mb-2 text-lg font-semibold text-white">
                  {demo.title}
                </h2>
                <p className="text-sm leading-relaxed text-white/40 transition-colors group-hover:text-white/60">
                  {demo.description}
                </p>
              </div>

              {/* Arrow indicator */}
              <div className="relative z-10 mt-auto pt-5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-white/30 transition-colors group-hover:text-white/70">
                  Explore
                  <svg
                    className="h-3.5 w-3.5 translate-x-0 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                    />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
