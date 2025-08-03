import { types, flow, Instance } from "mobx-state-tree"
import * as Device from "expo-device"
import * as Application from "expo-application"
import * as Network from "expo-network"
import Config from "app/config"
import { getOrCreateRunnerId } from "app/utils/identity"
import { registerRunner, pingOrchestrator, getPreauthKey } from "app/services/orchestrator"

export const DeviceStore = types
  .model("DeviceStore", {
    runnerId: types.maybe(types.string),
    optedIn: types.optional(types.boolean, false),
    status: types.optional(types.enumeration(["idle", "registering", "online", "error"]), "idle"),
    lastRegisteredAt: types.maybe(types.number),
    lastPingOk: types.optional(types.boolean, false),
    labels: types.optional(types.array(types.string), []),
  })
  .actions((self) => {
    let hbTimer: any = null

    const fetchRunnerId = flow(function* () {
      self.runnerId = yield getOrCreateRunnerId()
    })

    const checkPing = flow(function* () {
      self.lastPingOk = yield pingOrchestrator()
    })

    const register = flow(function* () {
      if (!self.runnerId) yield fetchRunnerId()
      self.status = "registering"
      try {
        const ip = yield Network.getIpAddressAsync()
        const meta = {
          brand: Device.brand,
          modelName: Device.modelName,
          osName: Device.osName,
          osVersion: Device.osVersion,
          appId: Application.applicationId,
          ip,
          platform: (Device as any).platformApiLevel ?? "n/a",
        }
        const labels = self.labels.length ? self.labels : (Config as any).DEFAULT_LABELS || []
        yield registerRunner(self.runnerId!, labels, meta)
        self.status = "online"
        self.lastRegisteredAt = Date.now()
      } catch (e) {
        self.status = "error"
        console.warn("register error", e)
      }
    })

    const startHeartbeat = () => {
      if (hbTimer) return
      hbTimer = setInterval(() => {
        checkPing()
      }, 15000)
    }

    const stopHeartbeat = () => {
      if (hbTimer) clearInterval(hbTimer)
      hbTimer = null
    }

    const setOptIn = (v: boolean) => {
      self.optedIn = v
      if (v) {
        register()
        startHeartbeat()
      } else {
        stopHeartbeat()
        self.status = "idle"
      }
    }

    const afterCreate = () => {
      fetchRunnerId()
      checkPing()
    }

    const joinMesh = flow(function* () {
      try {
        const HEADSCALE_USER = "mobile"    // must match one of your HEADSCALE_USER_MAP keys
        const { authKey, base } = yield getPreauthKey(HEADSCALE_USER)
        // Save for UI
        self.labels.replace(["mesh"])
        // Kick user to Tailscale/TorGuard/etc via deep-link QR
        self.lastRegisteredAt = Date.now()
        return { authKey, base }
      } catch (e) {
        console.error("joinMesh error", e)
        throw e
      }
    })

    return { joinMesh, register, startHeartbeat, stopHeartbeat, setOptIn, afterCreate, fetchRunnerId, checkPing }
  })

export interface DeviceStoreType extends Instance<typeof DeviceStore> {}