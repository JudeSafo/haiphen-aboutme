import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Application from "expo-application"
import * as Random from "expo-random"

// Stable-ish per install; we store a generated UUID the first time.
const KEY = "@haiphen:runnerId"

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("")
}

export async function getOrCreateRunnerId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY)
  if (existing) return existing

  const rand = await Random.getRandomBytesAsync(16)
  const uuid = bytesToHex(rand)
  const runnerId = `mobile-${Application.applicationName || "app"}-${uuid}`
  await AsyncStorage.setItem(KEY, runnerId)
  return runnerId
}
