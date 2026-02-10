// haiphen-risk/src/monte-carlo.ts — Monte Carlo simulation engine
// Uses crypto.getRandomValues() for Workers-compatible RNG (no Math.random)

/**
 * Single asset in a portfolio for simulation.
 */
export interface PortfolioAsset {
  name: string;
  weight: number;
  expected_return: number;   // annualized (e.g. 0.08 = 8%)
  volatility: number;        // annualized std deviation (e.g. 0.20 = 20%)
  current_value: number;     // notional value in dollars
}

/**
 * Result of a Monte Carlo simulation run.
 */
export interface MonteCarloResult {
  /** Array of simulated portfolio returns (one per iteration). */
  simulated_returns: number[];
  /** Per-asset simulated terminal values (iterations x assets). */
  asset_simulations: Map<string, number[]>;
  /** Total iterations completed. */
  iterations: number;
  /** Horizon in trading days. */
  horizon_days: number;
}

/* ------------------------------------------------------------------ */
/*  Crypto-safe random number generation                              */
/* ------------------------------------------------------------------ */

/**
 * Generate `n` uniform random numbers in [0, 1) using crypto.getRandomValues.
 * Each value is derived from a 32-bit unsigned integer.
 */
function uniformRandom(n: number): Float64Array {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Divide by 2^32 to get [0, 1). Avoid exact 0 for Box-Muller.
    out[i] = (buf[i] + 0.5) / 4294967296;
  }
  return out;
}

/**
 * Box-Muller transform: convert pairs of uniform [0,1) into
 * standard normal N(0,1) samples.  Returns `n` normal values.
 */
function normalRandom(n: number): Float64Array {
  // We need pairs, so request an even count of uniforms
  const pairCount = Math.ceil(n / 2);
  const u = uniformRandom(pairCount * 2);
  const out = new Float64Array(n);
  let idx = 0;
  for (let i = 0; i < pairCount && idx < n; i++) {
    const u1 = u[i * 2];
    const u2 = u[i * 2 + 1];
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    out[idx++] = r * Math.cos(theta);
    if (idx < n) out[idx++] = r * Math.sin(theta);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Cholesky decomposition for correlation                            */
/* ------------------------------------------------------------------ */

/**
 * Build a correlation matrix with `rho` cross-correlation and
 * 1.0 on the diagonal, then compute its Cholesky lower-triangular
 * decomposition so we can generate correlated normal draws.
 *
 * For an n×n matrix with uniform off-diagonal rho the Cholesky
 * decomposition is computed in O(n^3) which is fine for typical
 * portfolio sizes (< 50 assets).
 */
function choleskyDecompose(size: number, rho: number): Float64Array[] {
  // Build correlation matrix (row-major, each row is Float64Array)
  const C: number[][] = [];
  for (let i = 0; i < size; i++) {
    C[i] = [];
    for (let j = 0; j < size; j++) {
      C[i][j] = i === j ? 1.0 : rho;
    }
  }

  // Cholesky: L such that L * L^T = C
  const L: Float64Array[] = [];
  for (let i = 0; i < size; i++) L[i] = new Float64Array(size);

  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        L[i][j] = Math.sqrt(C[i][i] - sum);
      } else {
        L[i][j] = (C[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/* ------------------------------------------------------------------ */
/*  Monte Carlo simulation                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_CROSS_CORRELATION = 0.3;

/**
 * Run a Monte Carlo simulation for a portfolio of assets.
 *
 * Model: Geometric Brownian Motion per asset over `horizonDays` trading
 * days with correlated Brownian increments (cross-correlation = 0.3).
 *
 * Each iteration:
 *   1. Draw `n_assets × horizonDays` correlated standard normals
 *   2. For each asset, simulate daily log-returns:
 *        r_t = (mu - 0.5 * sigma^2) * dt + sigma * sqrt(dt) * Z_t
 *      where dt = 1/252 (one trading day), mu = annualized expected return,
 *      sigma = annualized volatility, Z_t = correlated normal.
 *   3. Terminal value = current_value * exp(sum of log-returns)
 *   4. Portfolio return = weighted sum of asset returns.
 *
 * @param portfolio  Array of portfolio assets.
 * @param iterations Number of simulation paths (max 10000).
 * @param horizonDays Horizon in trading days.
 * @param confidenceLevel Confidence level (e.g. 0.95) — passed through
 *                        for downstream use, not used directly here.
 * @returns MonteCarloResult with simulated portfolio returns.
 */
export function runMonteCarlo(
  portfolio: PortfolioAsset[],
  iterations: number,
  horizonDays: number,
  _confidenceLevel: number,
): MonteCarloResult {
  const n = portfolio.length;
  const dt = 1 / 252; // one trading day as fraction of year
  const sqrtDt = Math.sqrt(dt);

  // Cholesky factor for correlated draws
  const L = choleskyDecompose(n, DEFAULT_CROSS_CORRELATION);

  // Pre-compute drift and diffusion per asset
  const drift = new Float64Array(n);
  const diffusion = new Float64Array(n);
  for (let a = 0; a < n; a++) {
    const mu = portfolio[a].expected_return;
    const sigma = portfolio[a].volatility;
    drift[a] = (mu - 0.5 * sigma * sigma) * dt;
    diffusion[a] = sigma * sqrtDt;
  }

  // Total portfolio value (for computing weighted returns)
  const totalValue = portfolio.reduce((s, a) => s + a.current_value, 0);

  // Results storage
  const simReturns = new Float64Array(iterations);
  const assetSims = new Map<string, number[]>();
  for (const asset of portfolio) assetSims.set(asset.name, []);

  // Run simulations
  for (let iter = 0; iter < iterations; iter++) {
    // Generate independent normals for all assets × all days
    const Z_independent = normalRandom(n * horizonDays);

    let portfolioReturn = 0;

    for (let a = 0; a < n; a++) {
      let logReturnSum = 0;

      for (let d = 0; d < horizonDays; d++) {
        // Correlate: Z_corr[a] = sum_j L[a][j] * Z_independent[j]
        let zCorr = 0;
        for (let j = 0; j <= a; j++) {
          zCorr += L[a][j] * Z_independent[j * horizonDays + d];
        }
        logReturnSum += drift[a] + diffusion[a] * zCorr;
      }

      const terminalValue = portfolio[a].current_value * Math.exp(logReturnSum);
      const assetReturn = (terminalValue - portfolio[a].current_value) / portfolio[a].current_value;

      assetSims.get(portfolio[a].name)!.push(terminalValue);

      // Weight by dollar value proportion (not by stated weight alone,
      // use weight * current_value for proper dollar-weighted aggregation)
      const dollarWeight = (portfolio[a].weight * portfolio[a].current_value) / totalValue;
      portfolioReturn += dollarWeight * assetReturn;
    }

    simReturns[iter] = portfolioReturn;
  }

  return {
    simulated_returns: Array.from(simReturns),
    asset_simulations: assetSims,
    iterations,
    horizon_days: horizonDays,
  };
}
