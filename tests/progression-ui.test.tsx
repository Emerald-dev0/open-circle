import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RankTable } from "../src/components/board/rank-table";
import { publicMember } from "./helpers/fixtures";

describe("Progression marks on the leaderboard", () => {
  it("shows the current streak and earned milestone labels for a ranked member", () => {
    render(<RankTable
      members={[publicMember({ currentStreak: 5, achievements: ["first_contribution", "streak_7", "streak_30"] })]}
      total={1}
    />);

    expect(screen.getByTitle("5-day activity streak")).toBeTruthy();
    expect(screen.getByText("day activity streak")).toBeTruthy();
    expect(screen.getByText("First verified contribution")).toBeTruthy();
    expect(screen.getByText("Thirty-day streak")).toBeTruthy();
  });

  it("adds no progression marks for a member without verified activity", () => {
    render(<RankTable members={[publicMember({ currentStreak: 0, achievements: [] })]} total={1} />);

    expect(screen.queryByText("day activity streak")).toBeNull();
    expect(screen.queryByText("First verified contribution")).toBeNull();
  });
});
