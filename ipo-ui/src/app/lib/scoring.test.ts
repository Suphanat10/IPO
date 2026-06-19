/**
 * @jest-environment node
 */
import { scoreFAFromConclusion, scoreUWFromConclusion } from "./scoring";
import type { Conclusion } from "./ipoAnalytics";

// Minimal Conclusion stub — the conclusion-based scorers only read found,
// summary.{prob_close_above_ipo,avg_return_close_d1}, risk.downside_freq_20,
// score and sampleSize.
function conclusion(score: number): Conclusion {
  return {
    found: true,
    sampleSize: 25,
    score,
    summary: {
      prob_close_above_ipo: 95,
      avg_return_close_d1: 70,
    },
    risk: {
      downside_freq_20: 5,
    },
  } as unknown as Conclusion;
}

describe("conclusion bucket scores are clamped to [0,1]", () => {
  it("caps an over-strong FA score (calculateScore can exceed 1) at 1", () => {
    // Real-world cause of the 114% ring: calculateScore normalizes without
    // clamping, so a standout FA history yields score > 1.
    const bucket = scoreFAFromConclusion(conclusion(1.14));
    expect(bucket).not.toBeNull();
    expect(bucket!.score).toBe(1);
    expect(bucket!.decision).toBe("BUY");
  });

  it("floors a negative score at 0", () => {
    const bucket = scoreUWFromConclusion(conclusion(-0.1));
    expect(bucket).not.toBeNull();
    expect(bucket!.score).toBe(0);
    expect(bucket!.decision).toBe("AVOID");
  });

  it("passes an in-range score through unchanged", () => {
    expect(scoreFAFromConclusion(conclusion(0.72))!.score).toBeCloseTo(0.72);
  });
});
