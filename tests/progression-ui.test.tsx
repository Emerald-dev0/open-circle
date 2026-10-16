import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankTable } from "../src/components/board/rank-table";
import { publicMember } from "./helpers/fixtures";

describe("Progression marks on the leaderboard", () => {
  it("shows the current streak, its breakdown and earned milestone labels for a ranked member", () => {
    render(<RankTable
      members={[publicMember({ currentStreak: 5, longestStreak: 9, achievements: ["first_contribution", "streak_7", "streak_30"] })]}
      total={1}
    />);

    expect(screen.getByTitle("Current streak 5 days · longest 9 · next milestone 30")).toBeTruthy();
    expect(screen.getByText(/day activity streak/)).toBeTruthy();
    expect(screen.getByText("First verified contribution")).toBeTruthy();
    expect(screen.getByText("Thirty-day streak")).toBeTruthy();
  });

  it("names how rare each earned badge is when counts are known", () => {
    render(<RankTable
      members={[publicMember({ currentStreak: 5, longestStreak: 5, achievements: ["first_contribution"] })]}
      total={1}
      achievementCounts={{ first_contribution: 7 }}
      memberCount={42}
    />);

    expect(screen.getByText("First verified contribution · earned by 7 of 42 members")).toBeTruthy();
  });

  it("adds no progression marks for a member without verified activity", () => {
    render(<RankTable members={[publicMember({ currentStreak: 0, achievements: [] })]} total={1} />);

    expect(screen.queryByText(/day activity streak/)).toBeNull();
    expect(screen.queryByText("First verified contribution")).toBeNull();
  });
});
