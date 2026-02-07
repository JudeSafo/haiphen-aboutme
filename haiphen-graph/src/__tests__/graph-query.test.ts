import { describe, it, expect } from "vitest";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "../graph-query";

describe("Graph Query Engine", () => {
  describe("schema constants", () => {
    it("should export valid entity types", () => {
      expect(ENTITY_TYPES).toContain("device");
      expect(ENTITY_TYPES).toContain("network");
      expect(ENTITY_TYPES).toContain("protocol");
      expect(ENTITY_TYPES).toContain("vulnerability");
      expect(ENTITY_TYPES).toContain("user");
      expect(ENTITY_TYPES).toContain("location");
      expect(ENTITY_TYPES).toContain("vendor");
      expect(ENTITY_TYPES).toContain("service");
      expect(ENTITY_TYPES).toContain("firmware");
      expect(ENTITY_TYPES).toContain("certificate");
      expect(ENTITY_TYPES.length).toBe(10);
    });

    it("should export valid relationship types", () => {
      expect(RELATIONSHIP_TYPES).toContain("connects_to");
      expect(RELATIONSHIP_TYPES).toContain("runs_on");
      expect(RELATIONSHIP_TYPES).toContain("exploits");
      expect(RELATIONSHIP_TYPES).toContain("manages");
      expect(RELATIONSHIP_TYPES).toContain("depends_on");
      expect(RELATIONSHIP_TYPES).toContain("communicates_with");
      expect(RELATIONSHIP_TYPES.length).toBe(12);
    });
  });

  describe("function exports", () => {
    it("should export all required functions", async () => {
      const mod = await import("../graph-query");
      expect(typeof mod.upsertEntities).toBe("function");
      expect(typeof mod.createEdges).toBe("function");
      expect(typeof mod.queryGraph).toBe("function");
      expect(typeof mod.listEntities).toBe("function");
    });
  });
});
