// haiphen-risk/src/var-engine.ts — Value at Risk / CVaR / risk metrics engine

/**
 * Compute Value at Risk (VaR) at a given confidence level.
 *
 * VaR is the loss threshold such that the probability of a loss
 * exceeding VaR is (1 - confidenceLevel).
 *
 * Uses historical simulation method: sort returns and pick the
 * percentile cutoff.  A negative return means a loss.
 *
 * @param simulations Array of simulated portfolio returns (e.g. from Monte Carlo).
 * @param confidenceLevel Confidence level in (0, 1), e.g. 0.95 for 95% VaR.
 * @returns VaR as a negative number (loss).  E.g. -0.05 means 5% loss.
 */
export function computeVaR(simulations: number[], confidenceLevel: number): number {
  if (simulations.length === 0) return 0;
  const sorted = [...simulations].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * (1 - confidenceLevel));
  // Clamp index
  const i = Math.max(0, Math.min(idx, sorted.length - 1));
  return sorted[i];
}

/**
 * Compute Conditional Value at Risk (CVaR), also known as Expected Shortfall.
 *
 * CVaR is the expected (mean) loss in the worst (1 - confidenceLevel)
 * tail of the distribution.  It is always at least as severe as VaR.
 *
 * @param simulations Array of simulated portfolio returns.
 * @param confidenceLevel Confidence level in (0, 1).
 * @returns CVaR as a negative number (expected tail loss).
 */
export function computeCVaR(simulations: number[], confidenceLevel: number): number {
  if (simulations.length === 0) return 0;
  const sorted = [...simulations].sort((a, b) => a - b);
  const cutoff = Math.floor(sorted.length * (1 - confidenceLevel));
  if (cutoff === 0) return sorted[0];

  let sum = 0;
  for (let i = 0; i < cutoff; i++) sum += sorted[i];
  return sum / cutoff;
}

/**
 * Compute the maximum drawdown across all simulation paths.
 *
 * For each path (treated as a single return), we look at the
 * cumulative equity curve.  Since each simulation is a single
 * terminal return, we compute drawdown as the worst single-path
 * loss relative to a starting value of 1.0.
 *
 * For a more granular drawdown, pass in a time series of
 * cumulative returns.  This function also handles that case:
 * if given an array representing an equity curve, it finds
 * the largest peak-to-trough decline.
 *
 * @param simulations Array of returns or equity curve values.
 * @returns Maximum drawdown as a positive fraction (e.g. 0.15 = 15%).
 */
export function computeMaxDrawdown(simulations: number[]): number {
  if (simulations.length === 0) return 0;

  // Treat simulations as terminal returns, build equity values
  // Equity = 1 + return for each path
  // Sort by return to find peak-to-trough in ordered space
  const equities = simulations.map(r => 1 + r).sort((a, b) => a - b);

  // Peak is the maximum equity, trough is the minimum
  const peak = equities[equities.length - 1];
  const trough = equities[0];

  if (peak <= 0) return 1; // total loss
  const drawdown = (peak - trough) / peak;
  return Math.max(0, drawdown);
}

/**
 * Compute the annualized Sharpe ratio from simulation returns.
 *
 * Sharpe = (mean_return - risk_free_rate) / std_dev
 *
 * The returns are assumed to be over the simulation horizon.
 * We annualize by multiplying by sqrt(252 / horizon_days) if
 * the caller does not pre-annualize.
 *
 * @param simulations Array of simulated portfolio returns.
 * @param riskFreeRate Annualized risk-free rate (e.g. 0.04 = 4%).
 * @param horizonDays Simulation horizon in trading days (for annualization).
 * @returns Annualized Sharpe ratio.
 */
export function computeSharpeRatio(
  simulations: number[],
  riskFreeRate: number = 0.04,
  horizonDays: number = 21,
): number {
  if (simulations.length < 2) return 0;

  const n = simulations.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += simulations[i];
  const mean = sum / n;

  let sqSum = 0;
  for (let i = 0; i < n; i++) {
    const d = simulations[i] - mean;
    sqSum += d * d;
  }
  const stdDev = Math.sqrt(sqSum / (n - 1));

  if (stdDev === 0) return 0;

  // De-annualize the risk-free rate to match the horizon
  const rfHorizon = riskFreeRate * (horizonDays / 252);

  // Compute Sharpe over the horizon period, then annualize
  const sharpeHorizon = (mean - rfHorizon) / stdDev;
  const annualizationFactor = Math.sqrt(252 / horizonDays);

  return sharpeHorizon * annualizationFactor;
}

/**
 * Summary of all computed risk metrics.
 */
export interface RiskMetrics {
  var_value: number;
  cvar_value: number;
  max_drawdown: number;
  sharpe_ratio: number;
}

/**
 * Compute all risk metrics in one call.
 */
export function computeAllMetrics(
  simulations: number[],
  confidenceLevel: number,
  riskFreeRate: number = 0.04,
  horizonDays: number = 21,
): RiskMetrics {
  return {
    var_value: computeVaR(simulations, confidenceLevel),
    cvar_value: computeCVaR(simulations, confidenceLevel),
    max_drawdown: computeMaxDrawdown(simulations),
    sharpe_ratio: computeSharpeRatio(simulations, riskFreeRate, horizonDays),
  };
}
