// app/models/setup-root-store.ts
import { useEffect, useState } from "react"
import { RootStore, RootStoreType } from "./RootStore"

type ReadyCallback = () => void

/**
 * Creates the MST root store exactly **once** and exposes a `rehydrated` flag.
 * Any persistence / hydration can be plugged into the effect later.
 */
export function useInitialRootStore(onReady?: ReadyCallback) {
  // ← this function is executed on every render, but the initializer runs only once
  const [rootStore] = useState<RootStoreType>(() => RootStore.create({}))
  const [rehydrated, setRehydrated] = useState(false)

  useEffect(() => {
    let mounted = true

    // hydrate or run post-init logic here if needed
    ;(async () => {
      // await hydrateStore(rootStore)   // <- if you add persistence later
      if (!mounted) return
      setRehydrated(true)
      onReady?.()
    })()

    return () => {
      mounted = false
    }
  }, [onReady, rootStore])

  return { rootStore, rehydrated }
}