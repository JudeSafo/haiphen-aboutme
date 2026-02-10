// protocol-analyzer.ts — Decode protocol-specific packet fields against D1 definitions

export interface PacketInput {
  timestamp_ms: number;
  direction: "request" | "response";
  src_addr?: string;
  dst_addr?: string;
  function_code?: number;
  payload_hex?: string;
  payload_size?: number;
}

export interface DecodedPacket {
  seq: number;
  timestamp_ms: number;
  direction: "request" | "response";
  src_addr: string;
  dst_addr: string;
  protocol: string;
  function_code: number | null;
  function_name: string | null;
  payload_hex: string;
  payload_size: number;
  decoded: Record<string, unknown>;
  is_anomaly: boolean;
  anomaly_type: string | null;
  anomaly_detail: string | null;
}

interface ProtocolDef {
  protocol_id: string;
  name: string;
  default_port: number;
  function_codes: Record<string, { name: string; description: string; category: string }>;
  anomaly_rules: Array<{ rule: string; description: string; severity: string }>;
}

export async function loadProtocolDef(db: D1Database, protocolId: string): Promise<ProtocolDef | null> {
  const row = await db.prepare(
    "SELECT protocol_id, name, default_port, function_codes_json, anomaly_rules_json FROM network_protocol_definitions WHERE protocol_id = ?"
  ).bind(protocolId).first<{
    protocol_id: string; name: string; default_port: number;
    function_codes_json: string | null; anomaly_rules_json: string | null;
  }>();

  if (!row) return null;

  return {
    protocol_id: row.protocol_id,
    name: row.name,
    default_port: row.default_port,
    function_codes: row.function_codes_json ? JSON.parse(row.function_codes_json) : {},
    anomaly_rules: row.anomaly_rules_json ? JSON.parse(row.anomaly_rules_json) : [],
  };
}

export function decodePackets(
  packets: PacketInput[],
  protocol: ProtocolDef,
  target: string
): DecodedPacket[] {
  const decoded: DecodedPacket[] = [];
  const fcTimestamps: Map<string, number[]> = new Map();

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];
    const fc = pkt.function_code ?? null;
    const fcStr = fc !== null ? String(fc) : null;
    const fcDef = fcStr ? protocol.function_codes[fcStr] : null;

    const payloadHex = pkt.payload_hex || "";
    const payloadSize = pkt.payload_size ?? Math.floor(payloadHex.length / 2);

    // Anomaly detection
    let isAnomaly = false;
    let anomalyType: string | null = null;
    let anomalyDetail: string | null = null;

    // Check unknown function code
    if (fc !== null && !fcDef) {
      isAnomaly = true;
      anomalyType = "unknown_function_code";
      anomalyDetail = `Function code ${fc} not in ${protocol.name} specification`;
    }

    // Check oversized payload
    if (!isAnomaly && payloadSize > getMaxPayloadSize(protocol.protocol_id)) {
      isAnomaly = true;
      anomalyType = "oversized_payload";
      anomalyDetail = `Payload size ${payloadSize} bytes exceeds maximum ${getMaxPayloadSize(protocol.protocol_id)} for ${protocol.name}`;
    }

    // Check rapid polling (same FC > 10 times per second)
    if (fcStr && pkt.direction === "request") {
      const key = `${pkt.src_addr || "?"}-${fcStr}`;
      const times = fcTimestamps.get(key) || [];
      times.push(pkt.timestamp_ms);
      // Keep only last 1 second of timestamps
      const cutoff = pkt.timestamp_ms - 1000;
      const recent = times.filter(t => t > cutoff);
      fcTimestamps.set(key, recent);

      if (!isAnomaly && recent.length > 10) {
        isAnomaly = true;
        anomalyType = "rapid_polling";
        anomalyDetail = `${recent.length} requests for FC ${fc} in 1 second from ${pkt.src_addr || "unknown"}`;
      }
    }

    // Build decoded fields based on protocol
    const decodedFields = buildDecodedFields(protocol.protocol_id, fc, payloadHex, payloadSize);

    decoded.push({
      seq: i,
      timestamp_ms: pkt.timestamp_ms,
      direction: pkt.direction,
      src_addr: pkt.src_addr || "unknown",
      dst_addr: pkt.dst_addr || target,
      protocol: protocol.protocol_id,
      function_code: fc,
      function_name: fcDef?.name || null,
      payload_hex: payloadHex,
      payload_size: payloadSize,
      decoded: decodedFields,
      is_anomaly: isAnomaly,
      anomaly_type: anomalyType,
      anomaly_detail: anomalyDetail,
    });
  }

  // Check timing jitter
  checkTimingJitter(decoded);

  return decoded;
}

function getMaxPayloadSize(protocolId: string): number {
  switch (protocolId) {
    case "modbus": return 260;
    case "opcua": return 65535;
    case "mqtt": return 268435455;
    case "dnp3": return 2048;
    case "bacnet": return 1497;
    case "ethernetip": return 65535;
    default: return 65535;
  }
}

function buildDecodedFields(protocolId: string, fc: number | null, payloadHex: string, payloadSize: number): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (protocolId === "modbus" && fc !== null) {
    fields.unit_id = 1;
    if (fc >= 1 && fc <= 4) {
      fields.operation = "read";
      fields.register_count = Math.max(1, Math.floor(payloadSize / 2));
    } else if (fc === 5 || fc === 6) {
      fields.operation = "write_single";
    } else if (fc === 15 || fc === 16) {
      fields.operation = "write_multiple";
      fields.register_count = Math.max(1, Math.floor(payloadSize / 2));
    } else if (fc === 8) {
      fields.operation = "diagnostic";
    }
  } else if (protocolId === "opcua") {
    fields.message_type = fc !== null && fc <= 14 ? "OPN" : "MSG";
    fields.chunk_type = "F";
  } else if (protocolId === "mqtt" && fc !== null) {
    fields.packet_type = fc;
    if (fc === 3) fields.qos = 1;
  } else if (protocolId === "dnp3" && fc !== null) {
    fields.transport_seq = 0;
    fields.application_control = fc;
  }

  fields.payload_bytes = payloadSize;
  return fields;
}

function checkTimingJitter(packets: DecodedPacket[]): void {
  if (packets.length < 3) return;

  const intervals: number[] = [];
  for (let i = 1; i < packets.length; i++) {
    intervals.push(packets[i].timestamp_ms - packets[i - 1].timestamp_ms);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (avgInterval <= 0) return;

  for (let i = 0; i < intervals.length; i++) {
    if (!packets[i + 1].is_anomaly && intervals[i] > avgInterval * 3 && intervals[i] > 100) {
      packets[i + 1].is_anomaly = true;
      packets[i + 1].anomaly_type = "timing_jitter";
      packets[i + 1].anomaly_detail = `Interval ${Math.round(intervals[i])}ms is ${(intervals[i] / avgInterval).toFixed(1)}x the average ${Math.round(avgInterval)}ms`;
    }
  }
}

export interface TraceSummary {
  packet_count: number;
  session_count: number;
  anomaly_count: number;
  duration_ms: number;
  protocols_seen: string[];
  function_codes_seen: number[];
  sessions: SessionSummary[];
  anomalies: AnomalySummary[];
}

interface SessionSummary {
  src: string;
  dst: string;
  protocol: string;
  function_codes: number[];
  packets: number;
  anomalies: number;
}

interface AnomalySummary {
  type: string;
  detail: string;
  severity: string;
  packet_seq: number;
  timestamp_ms: number;
}

export function buildTraceSummary(packets: DecodedPacket[], protocolDef: ProtocolDef): TraceSummary {
  const sessions: Map<string, SessionSummary> = new Map();
  const anomalies: AnomalySummary[] = [];
  const fcsSeen = new Set<number>();

  for (const pkt of packets) {
    // Build session key
    const sessionKey = `${pkt.src_addr}→${pkt.dst_addr}`;
    let session = sessions.get(sessionKey);
    if (!session) {
      session = { src: pkt.src_addr, dst: pkt.dst_addr, protocol: pkt.protocol, function_codes: [], packets: 0, anomalies: 0 };
      sessions.set(sessionKey, session);
    }
    session.packets++;
    if (pkt.function_code !== null) {
      fcsSeen.add(pkt.function_code);
      if (!session.function_codes.includes(pkt.function_code)) session.function_codes.push(pkt.function_code);
    }

    if (pkt.is_anomaly) {
      session.anomalies++;
      const rule = protocolDef.anomaly_rules.find(r => r.rule === pkt.anomaly_type);
      anomalies.push({
        type: pkt.anomaly_type || "unknown",
        detail: pkt.anomaly_detail || "",
        severity: rule?.severity || "medium",
        packet_seq: pkt.seq,
        timestamp_ms: pkt.timestamp_ms,
      });
    }
  }

  const minTs = packets.length > 0 ? packets[0].timestamp_ms : 0;
  const maxTs = packets.length > 0 ? packets[packets.length - 1].timestamp_ms : 0;

  return {
    packet_count: packets.length,
    session_count: sessions.size,
    anomaly_count: anomalies.length,
    duration_ms: maxTs - minTs,
    protocols_seen: [protocolDef.protocol_id],
    function_codes_seen: Array.from(fcsSeen).sort((a, b) => a - b),
    sessions: Array.from(sessions.values()),
    anomalies,
  };
}
