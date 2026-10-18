import { render, screen } from "@testing-library/react";
import { Flame } from "lucide-react";
import { describe, expect, it } from "vitest";

import { StatCard, StatsBar } from "@/features/stats/StatsBar";
import type { Stats } from "@/types";

const stats: Stats = {
  current_streak: 5,
  longest_streak: 12,
  total_days: 30,
  total_items: 123,
  heatmap: [],
};

describe("StatCard", () => {
  it("shows the value with its label", () => {
    const { container } = render(
      <StatCard label="Current streak" value={5} icon={Flame} animate={false} />,
    );
    expect(screen.getByText("Current streak")).toBeTruthy();
    expect(container.textContent).toContain("5");
  });
});

describe("StatsBar", () => {
  it("renders every streak and total", () => {
    const { container } = render(<StatsBar stats={stats} animate={false} />);
    expect(screen.getByText("Current streak")).toBeTruthy();
    expect(screen.getByText("Longest streak")).toBeTruthy();
    expect(screen.getByText("Active days")).toBeTruthy();
    expect(screen.getByText("Items logged")).toBeTruthy();
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("30");
    expect(container.textContent).toContain("123");
  });

  it("formats a zero streak without a flame pulse error", () => {
    const { container } = render(
      <StatsBar stats={{ ...stats, current_streak: 0 }} animate={false} />,
    );
    expect(container.textContent).toContain("0");
  });
});
