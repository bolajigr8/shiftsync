import { useEffect, useRef } from 'react'

export function useSwapRealtime(
  userId: string | undefined,
  onUpdate: () => void,
) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!userId) return
    let channel: any

    import('@/lib/supabase').then(({ getBrowserSupabase }) => {
      const supabase = getBrowserSupabase()
      channel = supabase
        .channel(`swaps:${userId}`)
        .on('broadcast', { event: 'swap_updated' }, () => {
          onUpdateRef.current()
        })
        .subscribe()
    })

    return () => {
      channel?.unsubscribe()
    }
  }, [userId])
}
