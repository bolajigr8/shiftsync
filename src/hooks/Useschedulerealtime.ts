import { useEffect, useRef } from 'react'

export function useScheduleRealtime(
  locationId: string | undefined,
  onUpdate: () => void,
) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!locationId) return
    let channel: any

    import('@/lib/supabase').then(({ getBrowserSupabase }) => {
      const supabase = getBrowserSupabase()
      channel = supabase
        .channel(`schedule:${locationId}`)
        .on('broadcast', { event: 'schedule_updated' }, () => {
          onUpdateRef.current()
        })
        .subscribe()
    })

    return () => {
      channel?.unsubscribe()
    }
  }, [locationId])
}
