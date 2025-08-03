import React, { useEffect } from "react"
import { View, Switch, Image, Alert, Linking } from "react-native"
import { observer } from "mobx-react-lite"
import { Screen, Text, Button, Card } from "../components"
import { useStores } from "app/models"
import { useSafeAreaInsetsStyle } from "../utils/useSafeAreaInsetsStyle"

export const LandingScreen = observer(function LandingScreen() {
  // Create a simple root store holder if you don't have one:
  // Add DeviceStore to RootStore in app/models/RootStore.ts (shown below)
  const { deviceStore } = useStores()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  useEffect(() => {
    // Ensure runnerId is ready early
    deviceStore.fetchRunnerId()
  }, [])

  return (
    <Screen preset="scroll" contentContainerStyle={[$insets, { padding: 16, gap: 16 }]}>
      {/* App logo (kept even if not clickable so it feels like a real app) */}
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Image
          source={require("../../assets/images/robot_haiphen.png")}
          style={{ width: 160, height: 160 }}
          resizeMode="contain"
          accessible
          accessibilityLabel="Haiphen robot logo"
          testID="landing-logo"
        />
      </View>
      <Text preset="heading" text="Haiphen Edge Node" />
      <Card
        style={{ padding: 16 }}
        HeadingComponent={<Text preset="subheading" text="Device status" />}
        ContentComponent={
          <View style={{ gap: 8 }}>
            <Text text={`Runner: ${deviceStore.runnerId ?? "…"}`} />
            <Text text={`State: ${deviceStore.status}`} />
            <Text text={`Orchestrator reachable: ${deviceStore.lastPingOk ? "yes" : "no"}`} />
            {deviceStore.lastRegisteredAt ? (
              <Text text={`Last registered: ${new Date(deviceStore.lastRegisteredAt).toLocaleTimeString()}`} />
            ) : null}
          </View>
        }
      />

      <Card
        style={{ padding:16 }}
        HeadingComponent={<Text preset="subheading" text="Mesh VPN" />}
        ContentComponent={
          <>
            <Text text="Generate a one-time key and open Tailscale" />
            <Button
              text="Join Mesh"
              onPress={async () => {
                try {
                  const { authKey, base } = await deviceStore.joinMesh()
                  const deeplink = `tailscale://login?server=${encodeURIComponent(base)}&authkey=${authKey}`
                  Linking.openURL(deeplink)           // Android
                  // On iOS simply copy to clipboard or show QR
                } catch (e) { Alert.alert("Error", String(e)) }
              }}
            />
          </>
        }
      />

      <Card
        style={{ padding: 16 }}
        HeadingComponent={<Text preset="subheading" text="Participation" />}
        ContentComponent={
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text text={deviceStore.optedIn ? "Enabled" : "Disabled"} />
            <Switch
              value={deviceStore.optedIn}
              onValueChange={(v) => deviceStore.setOptIn(v)}
            />
          </View>
        }
      />

      <Button
        text="Check Connection"
        onPress={() => deviceStore.checkPing()}
        style={{ marginTop: 12 }}
      />
    </Screen>
  )
})