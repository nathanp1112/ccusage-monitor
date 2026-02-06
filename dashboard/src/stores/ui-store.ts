import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Date range for UI state (uses Date objects for local manipulation)
 * Note: API DateRange in types/api.ts uses strings for serialization
 */
interface UIDateRange {
  from: Date
  to: Date
}

interface UIState {
  // Sidebar state
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Date range filter
  dateRange: UIDateRange | null
  setDateRange: (range: UIDateRange | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Date range
      dateRange: null,
      setDateRange: (dateRange) => set({ dateRange }),
    }),
    {
      name: 'ccusage-ui',
      // Only persist these specific fields
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
)
