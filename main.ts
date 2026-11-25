// Tiny trend bot for agent-fun/bars-replay/v1: beat buy-and-hold on Solana hourly bars.
//
// Original design (measured, not copied from any baseline):
//   - Per symbol, a fast EMA(4) over a slow EMA(12), both seeded as the mean of
//     their first span of closes, then stepping 2/(span+1) toward each new close.
//   - Entry: the fast EMA crosses above the slow EMA on this bar's close AND the
//     symbol's 12-bar return is positive (momentum confirmation, so a cross that
//     happens while the price is still falling does not buy).
//   - Exit: the whole position, the first bar whose close has the fast EMA below
//     the slow EMA again. No take-profit, no stop-loss: in a 72-bar final window
//     the trend signal itself is the exit, and exits are what keep the drawdown
//     small in a falling market.
//   - Stake: equity / 7 (one slot per universe symbol), capped at the harness
//     max weight (25% of equity) and at the cash this reply has not spent yet.
//     Sells go first, then buys in universe order, at most the harness order cap.
//   - Orders are decided on a bar's close and fill at the next bar's open, so
//     every order caps slippage at 100 bps past the close it was decided on.
//   - Deterministic by construction: float64 arithmetic only, iteration over
//     insertion-ordered maps fed by the batch stream, no clock, no randomness,
//     no environment reads, no network.
//
// Measured on the kit dev window (136 hourly bars, 2026-10-29 to 2026-11-03,
// all seven symbols down -3% to -14%): official grade-local net PnL -193.1 USDC
// on 10,000 USDC capital with 41 trades and 2.4% max drawdown, versus -869.3 USDC
// for the buy-and-hold baseline and -173.0 USDC for the house EMA-cross baseline
// on the same window. The last-72-bars proxy of the final window scores about
// -63 USDC with 17 trades, versus -301 USDC for buy-and-hold there. These are
// sanity checks on one downtrend sample, not a forecast: the final window is
// three fresh days recorded after entries close.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const FAST_SPAN = 4;
const SLOW_SPAN = 12;
const MOMENTUM_BARS = 12;
const MAX_SLIPPAGE_BPS = 100;

/** One EMA: the closes it has seen until it starts, then its value. */
interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

interface Series {
  fast: Ema;
  slow: Ema;
  /** fast - slow after the symbol's bar before this one, once both are set. */
  prevGap: number | null;
  /** fast - slow after this bar. */
  gap: number | null;
  /** Recent closes, oldest first, for the momentum check. */
  closes: number[];
}

const series = new Map<string, Series>();

function stepEma(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

function pushBar(bar: Bar): Series {
  let s = series.get(bar.symbol);
  if (s === undefined) {
    s = {
      fast: { span: FAST_SPAN, warm: [], value: null },
      slow: { span: SLOW_SPAN, warm: [], value: null },
      prevGap: null,
      gap: null,
      closes: [],
    };
    series.set(bar.symbol, s);
  }
  const c = Number(bar.c);
  stepEma(s.fast, c);
  stepEma(s.slow, c);
  s.prevGap = s.gap;
  s.gap = s.fast.value !== null && s.slow.value !== null ? s.fast.value - s.slow.value : null;
  s.closes.push(c);
  if (s.closes.length > MOMENTUM_BARS + 1) s.closes.shift();
  return s;
}

/** The 12-bar return is positive: the cross is confirmed by rising prices. */
function momentumUp(s: Series): boolean {
  if (s.closes.length < MOMENTUM_BARS + 1) return false;
  return s.closes[s.closes.length - 1] > s.closes[0];
}

await runBars({
  onBatch(state: BarsState, batch) {
    const crossUp = new Set<string>();
    const fresh = new Set<string>();
    for (const bar of batch.bars) {
      const s = pushBar(bar);
      fresh.add(bar.symbol);
      if (s.prevGap === null || s.gap === null) continue;
      if (s.gap > 0 && s.prevGap <= 0 && momentumUp(s)) crossUp.add(bar.symbol);
    }
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;

    const sells: SellInput[] = [];
    for (const { symbol } of state.hello.symbols) {
      if (!fresh.has(symbol)) continue;
      const held = state.positions.get(symbol);
      if (held === undefined) continue;
      const s = series.get(symbol)!;
      if (s.gap !== null && s.gap < 0) {
        sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    }

    const orders: (SellInput | BuyInput)[] = sells.slice(0, caps.max_orders_per_bar);
    const slots = Math.min(state.hello.symbols.length, caps.max_open_positions);
    const stake = state.equity / BigInt(slots);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = slots - state.positions.size + sells.length;
    let cash = state.cash;
    for (const { symbol } of state.hello.symbols) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      if (state.positions.has(symbol) || !crossUp.has(symbol)) continue;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) continue;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
      room--;
    }
    return orders;
  },
});
