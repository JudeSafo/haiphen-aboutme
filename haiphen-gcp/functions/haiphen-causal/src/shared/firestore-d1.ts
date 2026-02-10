// ---------------------------------------------------------------------------
// Firestore D1 Adapter — drop-in replacement for env.DB (D1Database)
//
// Implements D1's prepare().bind().run()/all()/first() interface over
// Firestore collections. Handles the simple query patterns used by
// Haiphen workers (single-table CRUD, no complex JOINs in hot paths).
// ---------------------------------------------------------------------------

import { Firestore, FieldValue } from "@google-cloud/firestore";
import type { D1Database, D1PreparedStatement, D1Result } from "./types";

export class FirestoreD1Adapter implements D1Database {
  constructor(private db: Firestore) {}

  prepare(sql: string): D1PreparedStatement {
    return new FirestoreStatement(this.db, sql);
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const results: D1Result[] = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  async exec(sql: string): Promise<D1Result> {
    return this.prepare(sql).run();
  }
}

// ---------------------------------------------------------------------------
// SQL parser — extracts table, operation, columns, WHERE clauses
// ---------------------------------------------------------------------------

type SqlOp = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "COUNT";

interface ParsedSql {
  op: SqlOp;
  table: string;
  columns: string[];           // SELECT columns or INSERT columns
  whereClauses: { col: string; op: string; paramIdx: number }[];
  orderBy?: { col: string; dir: "ASC" | "DESC" };
  limit?: number;
  offset?: number;
  setColumns: string[];        // UPDATE SET columns
  isCount: boolean;
  limitParamIdx: number;       // -1 if limit is literal
  offsetParamIdx: number;      // -1 if offset is literal
}

function parseSql(sql: string): ParsedSql {
  const norm = sql.replace(/\s+/g, " ").trim();
  const upper = norm.toUpperCase();

  const isCount = /SELECT\s+COUNT\s*\(\s*\*\s*\)/i.test(norm);
  let op: SqlOp = "SELECT";
  if (upper.startsWith("INSERT")) op = "INSERT";
  else if (upper.startsWith("UPDATE")) op = "UPDATE";
  else if (upper.startsWith("DELETE")) op = "DELETE";
  if (isCount) op = "COUNT";

  // Extract table name
  let table = "";
  if (op === "SELECT" || op === "COUNT") {
    const m = norm.match(/FROM\s+(\w+)/i);
    table = m?.[1] ?? "";
  } else if (op === "INSERT") {
    const m = norm.match(/INTO\s+(\w+)/i);
    table = m?.[1] ?? "";
  } else if (op === "UPDATE") {
    const m = norm.match(/UPDATE\s+(\w+)/i);
    table = m?.[1] ?? "";
  } else if (op === "DELETE") {
    const m = norm.match(/FROM\s+(\w+)/i);
    table = m?.[1] ?? "";
  }

  // SELECT columns
  let columns: string[] = [];
  if (op === "SELECT") {
    const m = norm.match(/SELECT\s+(.+?)\s+FROM/i);
    if (m && m[1] !== "*") {
      columns = m[1].split(",").map(c => c.trim().replace(/\s+AS\s+\w+/i, ""));
    }
  }

  // INSERT columns
  if (op === "INSERT") {
    const m = norm.match(/\(([^)]+)\)\s*VALUES/i);
    if (m) {
      columns = m[1].split(",").map(c => c.trim());
    }
  }

  // UPDATE SET columns
  const setColumns: string[] = [];
  if (op === "UPDATE") {
    const m = norm.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
    if (m) {
      // Split by comma but respect ? placeholders
      const parts = m[1].split(",");
      for (const part of parts) {
        const colMatch = part.trim().match(/^(\w+)\s*=/);
        if (colMatch) setColumns.push(colMatch[1]);
      }
    }
  }

  // WHERE clauses — track param index based on ? position in full SQL
  const whereClauses: ParsedSql["whereClauses"] = [];
  const whereMatch = norm.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|\s*$)/i);
  if (whereMatch) {
    // Count ? placeholders before WHERE to get starting param index
    const beforeWhere = norm.substring(0, norm.toUpperCase().indexOf("WHERE"));
    let paramIdx = (beforeWhere.match(/\?/g) ?? []).length;

    const conditions = whereMatch[1].split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const cm = cond.trim().match(/^(\w+)\s*(=|!=|<>|>=?|<=?|LIKE|IS)\s*\?/i);
      if (cm) {
        whereClauses.push({ col: cm[1], op: cm[2].toUpperCase(), paramIdx });
        paramIdx++;
      }
    }
  }

  // ORDER BY
  let orderBy: ParsedSql["orderBy"];
  const orderMatch = norm.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i);
  if (orderMatch) {
    orderBy = { col: orderMatch[1], dir: (orderMatch[2]?.toUpperCase() as "ASC" | "DESC") ?? "ASC" };
  }

  // LIMIT / OFFSET — check if literal or param
  let limit: number | undefined;
  let limitParamIdx = -1;
  const limitMatch = norm.match(/LIMIT\s+(\?|\d+)/i);
  if (limitMatch) {
    if (limitMatch[1] === "?") {
      // Count all ?'s before this LIMIT ? to find its param index
      const beforeLimit = norm.substring(0, norm.toUpperCase().lastIndexOf("LIMIT"));
      limitParamIdx = (beforeLimit.match(/\?/g) ?? []).length;
    } else {
      limit = parseInt(limitMatch[1], 10);
    }
  }

  let offset: number | undefined;
  let offsetParamIdx = -1;
  const offsetMatch = norm.match(/OFFSET\s+(\?|\d+)/i);
  if (offsetMatch) {
    if (offsetMatch[1] === "?") {
      const beforeOffset = norm.substring(0, norm.toUpperCase().lastIndexOf("OFFSET"));
      offsetParamIdx = (beforeOffset.match(/\?/g) ?? []).length;
    } else {
      offset = parseInt(offsetMatch[1], 10);
    }
  }

  return { op, table, columns, whereClauses, orderBy, limit, offset, setColumns, isCount, limitParamIdx, offsetParamIdx };
}

// ---------------------------------------------------------------------------
// Statement implementation
// ---------------------------------------------------------------------------

class FirestoreStatement implements D1PreparedStatement {
  private params: unknown[] = [];

  constructor(private db: Firestore, private sql: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.params = values;
    return this;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const parsed = parseSql(this.sql);
    const coll = this.db.collection(parsed.table);
    const start = Date.now();

    switch (parsed.op) {
      case "INSERT": {
        const doc: Record<string, unknown> = {};
        for (let i = 0; i < parsed.columns.length; i++) {
          doc[parsed.columns[i]] = this.params[i] ?? null;
        }
        // Use first column value as doc ID if it looks like a primary key
        const idCol = parsed.columns[0];
        const idVal = String(this.params[0] ?? "");
        if (idVal) {
          await coll.doc(idVal).set({ ...doc, _created_at: FieldValue.serverTimestamp() });
        } else {
          await coll.add({ ...doc, _created_at: FieldValue.serverTimestamp() });
        }
        return { results: [] as T[], success: true, meta: { changes: 1, last_row_id: 0, duration: Date.now() - start } };
      }

      case "UPDATE": {
        const updates: Record<string, unknown> = {};
        for (let i = 0; i < parsed.setColumns.length; i++) {
          updates[parsed.setColumns[i]] = this.params[i] ?? null;
        }
        updates._updated_at = FieldValue.serverTimestamp();

        const updateDocs = await this.queryDocs(coll, parsed);
        const batch = this.db.batch();
        for (const docSnap of updateDocs) {
          batch.update(docSnap.ref, updates as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
        }
        await batch.commit();
        return { results: [] as T[], success: true, meta: { changes: updateDocs.length, last_row_id: 0, duration: Date.now() - start } };
      }

      case "DELETE": {
        const deleteDocs = await this.queryDocs(coll, parsed);
        const batch = this.db.batch();
        for (const docSnap of deleteDocs) {
          batch.delete(docSnap.ref);
        }
        await batch.commit();
        return { results: [] as T[], success: true, meta: { changes: deleteDocs.length, last_row_id: 0, duration: Date.now() - start } };
      }

      case "COUNT": {
        const snapshot = await this.buildQuery(coll, parsed).count().get();
        const cnt = snapshot.data().count;
        return { results: [{ cnt } as unknown as T], success: true, meta: { changes: 0, last_row_id: 0, duration: Date.now() - start } };
      }

      case "SELECT":
      default: {
        const docs = await this.queryDocs(coll, parsed);
        const results = docs.map(d => this.docToRow(d, parsed.columns)) as T[];
        return { results, success: true, meta: { changes: 0, last_row_id: 0, duration: Date.now() - start } };
      }
    }
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.run<T>();
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.run<T>();
    if (result.results.length === 0) return null;
    const row = result.results[0];
    if (column) return (row as any)[column] ?? null;
    return row;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const result = await this.run();
    return result.results.map(r => Object.values(r)) as T[];
  }

  // ---------------------------------------------------------------------------
  // Internal query builder
  // ---------------------------------------------------------------------------

  private buildQuery(
    coll: FirebaseFirestore.CollectionReference,
    parsed: ParsedSql,
  ): FirebaseFirestore.Query {
    let q: FirebaseFirestore.Query = coll;

    for (const clause of parsed.whereClauses) {
      const val = this.params[clause.paramIdx];
      const firestoreOp = this.mapOp(clause.op);
      q = q.where(clause.col, firestoreOp, val);
    }

    if (parsed.orderBy) {
      q = q.orderBy(parsed.orderBy.col, parsed.orderBy.dir === "DESC" ? "desc" : "asc");
    }

    const limit = parsed.limitParamIdx >= 0 ? Number(this.params[parsed.limitParamIdx]) : parsed.limit;
    const offset = parsed.offsetParamIdx >= 0 ? Number(this.params[parsed.offsetParamIdx]) : parsed.offset;

    if (offset && offset > 0) {
      q = q.offset(offset);
    }
    if (limit && limit > 0) {
      q = q.limit(limit);
    }

    return q;
  }

  private async queryDocs(
    coll: FirebaseFirestore.CollectionReference,
    parsed: ParsedSql,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const q = this.buildQuery(coll, parsed);
    const snap = await q.get();
    return snap.docs;
  }

  private mapOp(sqlOp: string): FirebaseFirestore.WhereFilterOp {
    switch (sqlOp) {
      case "=":  return "==";
      case "!=": case "<>": return "!=";
      case ">":  return ">";
      case ">=": return ">=";
      case "<":  return "<";
      case "<=": return "<=";
      default:   return "==";
    }
  }

  private docToRow(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    columns: string[],
  ): Record<string, unknown> {
    const data = doc.data();
    // Strip internal Firestore fields
    delete data._created_at;
    delete data._updated_at;

    if (columns.length === 0) return data;

    // Project only requested columns
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      row[col] = data[col] ?? null;
    }
    return row;
  }
}
