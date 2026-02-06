import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ApiError } from '@/lib/api-client'

interface ErrorFallbackProps {
  error: Error
  onRetry?: () => void
}

export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  const isApiError = error instanceof ApiError

  const getMessage = (): string => {
    if (!isApiError) return 'An unexpected error occurred'

    switch (error.status) {
      case 401:
        return 'Please log in to continue'
      case 403:
        return 'You do not have permission to view this'
      case 404:
        return 'The requested data was not found'
      case 500:
        return 'Server error. Please try again later'
      default:
        return error.message
    }
  }

  return (
    <Card className="border-destructive">
      <CardContent className="flex items-center gap-4 p-6">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <div className="flex-1">
          <h3 className="font-semibold">Error</h3>
          <p className="text-sm text-muted-foreground">{getMessage()}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
