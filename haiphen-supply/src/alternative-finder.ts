// alternative-finder.ts — Find alternative suppliers by product category

export interface AlternativeSupplier {
  supplier_id: string;
  name: string;
  country: string | null;
  region: string | null;
  tier: number;
  matching_categories: string[];
  composite_score: number; // higher is better (inverted risk)
  advantage: string;
}

interface SupplierRow {
  supplier_id: string;
  name: string;
  country: string | null;
  region: string | null;
  tier: number;
  categories_json: string | null;
  financial_score: number;
  geopolitical_score: number;
  delivery_score: number;
  single_source: number;
}

export async function findAlternatives(
  db: D1Database,
  userLogin: string,
  excludeSupplierIds: string[],
  targetCategories: string[]
): Promise<AlternativeSupplier[]> {
  if (targetCategories.length === 0) return [];

  // Fetch all active suppliers for this user
  const rows = await db.prepare(
    `SELECT supplier_id, name, country, region, tier, categories_json, financial_score, geopolitical_score, delivery_score, single_source
     FROM supply_suppliers
     WHERE user_login = ? AND status = 'active'
     ORDER BY financial_score DESC`
  ).bind(userLogin).all<SupplierRow>();

  const excludeSet = new Set(excludeSupplierIds);
  const alternatives: AlternativeSupplier[] = [];

  for (const row of rows.results) {
    if (excludeSet.has(row.supplier_id)) continue;

    const categories: string[] = row.categories_json ? JSON.parse(row.categories_json) : [];
    const matching = categories.filter(c =>
      targetCategories.some(tc => tc.toLowerCase() === c.toLowerCase())
    );

    if (matching.length === 0) continue;

    // Composite score: average of all factor scores (higher = better)
    const composite = Math.round(
      (row.financial_score + row.geopolitical_score + row.delivery_score) / 3
    );

    // Determine advantage
    let advantage = "General alternative";
    if (row.financial_score > 80) advantage = "Strong financial stability";
    else if (row.geopolitical_score > 80) advantage = "Low geopolitical risk";
    else if (row.delivery_score > 80) advantage = "Excellent delivery track record";
    else if (row.tier === 1) advantage = "Direct supplier (Tier 1)";

    alternatives.push({
      supplier_id: row.supplier_id,
      name: row.name,
      country: row.country,
      region: row.region,
      tier: row.tier,
      matching_categories: matching,
      composite_score: composite,
      advantage,
    });
  }

  // Sort by composite score descending
  alternatives.sort((a, b) => b.composite_score - a.composite_score);

  return alternatives.slice(0, 10);
}
