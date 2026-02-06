'use client'

import { LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLogout, useSession } from '@/hooks/use-auth'
import { ThemeToggle } from '@/components/theme'

export function Navbar() {
  const { data: user, isLoading } = useSession()
  const { mutate: logout, isPending } = useLogout()

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div>
        <h1 className="text-lg font-semibold">Team Usage Monitor</h1>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm">
            <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ) : user ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>{user.name}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {user.role}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => logout()}
              disabled={isPending}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Logout
            </Button>
          </>
        ) : null}
      </div>
    </header>
  )
}
