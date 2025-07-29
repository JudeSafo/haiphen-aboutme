// app/models/RootStore.tsx
import React, { createContext, useContext } from "react"
import { types, Instance } from "mobx-state-tree"
import { DeviceStore } from "./DeviceStore"

/**
 * Root MST model
 */
export const RootStore = types.model("RootStore", {
  deviceStore: types.optional(DeviceStore, {}),
})

export type RootStoreType = Instance<typeof RootStore>

/**
 * Context & provider (receives an already-created store)
 */
const RootStoreContext = createContext<RootStoreType | null>(null)
export function RootStoreProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: RootStoreType
}) {
  return <RootStoreContext.Provider value={value}>{children}</RootStoreContext.Provider>
}

/**
 * Hook to access the root store from React components.
 */
export function useStores(): RootStoreType {
  const store = useContext(RootStoreContext)
  if (!store) throw new Error("Missing <RootStoreProvider>")
  return store
}