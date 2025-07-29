import React from "react"
import { View } from "react-native"
import { Screen, Text } from "../components"
import { useSafeAreaInsetsStyle } from "../utils/useSafeAreaInsetsStyle"

export function PermissionsScreen() {
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
  return (
    <Screen preset="scroll" contentContainerStyle={[$insets, { padding: 16, gap: 16 }]}>
      <Text preset="heading" text="Permissions" />
      <View style={{ gap: 8 }}>
        <Text text="• Internet access: required to reach the orchestrator." />
        <Text text="• (Optional) Local network discovery: for LAN scans (future)." />
        <Text text="• We do not access photos, contacts, or location." />
      </View>
    </Screen>
  )
}