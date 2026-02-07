import { describe, it, expect } from "vitest";
import { decodePackets, buildTraceSummary } from "../protocol-analyzer";
import type { PacketInput } from "../protocol-analyzer";

const modbusProtocol = {
  protocol_id: "modbus",
  name: "Modbus TCP",
  default_port: 502,
  function_codes: {
    "1": { name: "Read Coils", description: "Read coil status", category: "read" },
    "2": { name: "Read Discrete Inputs", description: "Read discrete inputs", category: "read" },
    "3": { name: "Read Holding Registers", description: "Read holding registers", category: "read" },
    "4": { name: "Read Input Registers", description: "Read input registers", category: "read" },
    "5": { name: "Write Single Coil", description: "Write single coil", category: "write" },
    "6": { name: "Write Single Register", description: "Write single register", category: "write" },
    "15": { name: "Write Multiple Coils", description: "Write multiple coils", category: "write" },
    "16": { name: "Write Multiple Registers", description: "Write multiple registers", category: "write" },
  },
  anomaly_rules: [
    { rule: "unknown_function_code", description: "Unknown FC detected", severity: "high" },
    { rule: "oversized_payload", description: "Payload exceeds protocol max", severity: "critical" },
    { rule: "rapid_polling", description: "Excessive request rate", severity: "medium" },
    { rule: "timing_jitter", description: "Abnormal timing pattern", severity: "low" },
  ],
};

describe("Protocol Analyzer", () => {
  describe("decodePackets", () => {
    it("should decode valid modbus packets with known function codes", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 3, src_addr: "10.0.0.1", dst_addr: "10.0.0.2", payload_hex: "0001000a" },
        { timestamp_ms: 1050, direction: "response", function_code: 3, src_addr: "10.0.0.2", dst_addr: "10.0.0.1", payload_hex: "14000100020003" },
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      expect(decoded).toHaveLength(2);
      expect(decoded[0].function_name).toBe("Read Holding Registers");
      expect(decoded[0].is_anomaly).toBe(false);
      expect(decoded[0].protocol).toBe("modbus");
      expect(decoded[0].decoded.operation).toBe("read");
    });

    it("should flag unknown function codes as anomalies", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 99, src_addr: "10.0.0.1" },
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      expect(decoded[0].is_anomaly).toBe(true);
      expect(decoded[0].anomaly_type).toBe("unknown_function_code");
      expect(decoded[0].function_name).toBeNull();
    });

    it("should flag oversized payloads for modbus (>260 bytes)", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 3, payload_size: 300 },
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      expect(decoded[0].is_anomaly).toBe(true);
      expect(decoded[0].anomaly_type).toBe("oversized_payload");
    });

    it("should flag rapid polling (>10 same FC requests in 1 second)", () => {
      const packets: PacketInput[] = [];
      for (let i = 0; i < 12; i++) {
        packets.push({
          timestamp_ms: 1000 + i * 50, // 12 packets in 550ms
          direction: "request",
          function_code: 3,
          src_addr: "10.0.0.1",
        });
      }

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      // The 11th packet should trigger rapid_polling
      const anomalies = decoded.filter(p => p.anomaly_type === "rapid_polling");
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it("should detect timing jitter", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 3 },
        { timestamp_ms: 1100, direction: "response", function_code: 3 },
        { timestamp_ms: 1200, direction: "request", function_code: 3 },
        { timestamp_ms: 1300, direction: "response", function_code: 3 },
        { timestamp_ms: 2500, direction: "request", function_code: 3 }, // big gap
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      const jitterAnomaly = decoded.find(p => p.anomaly_type === "timing_jitter");
      expect(jitterAnomaly).toBeDefined();
    });

    it("should assign sequential seq numbers", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 3 },
        { timestamp_ms: 1100, direction: "response", function_code: 3 },
        { timestamp_ms: 1200, direction: "request", function_code: 4 },
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      expect(decoded[0].seq).toBe(0);
      expect(decoded[1].seq).toBe(1);
      expect(decoded[2].seq).toBe(2);
    });

    it("should compute payload_size from hex when not provided", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 3, payload_hex: "0001000a0002" },
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      expect(decoded[0].payload_size).toBe(3); // 6 hex chars = 3 bytes
    });
  });

  describe("buildTraceSummary", () => {
    it("should aggregate sessions correctly", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 3, src_addr: "10.0.0.1", dst_addr: "10.0.0.2" },
        { timestamp_ms: 1100, direction: "response", function_code: 3, src_addr: "10.0.0.2", dst_addr: "10.0.0.1" },
        { timestamp_ms: 1200, direction: "request", function_code: 4, src_addr: "10.0.0.1", dst_addr: "10.0.0.2" },
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      const summary = buildTraceSummary(decoded, modbusProtocol);

      expect(summary.packet_count).toBe(3);
      expect(summary.session_count).toBe(2); // two direction pairs
      expect(summary.duration_ms).toBe(200);
      expect(summary.protocols_seen).toContain("modbus");
      expect(summary.function_codes_seen).toContain(3);
      expect(summary.function_codes_seen).toContain(4);
    });

    it("should count anomalies in summary", () => {
      const packets: PacketInput[] = [
        { timestamp_ms: 1000, direction: "request", function_code: 99, src_addr: "10.0.0.1" },
      ];

      const decoded = decodePackets(packets, modbusProtocol, "plc:502");
      const summary = buildTraceSummary(decoded, modbusProtocol);

      expect(summary.anomaly_count).toBe(1);
      expect(summary.anomalies[0].type).toBe("unknown_function_code");
    });
  });
});
