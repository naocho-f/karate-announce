import { describe, it, expect } from "vitest";
import { getEventPhase } from "@/lib/event-phase";
import type { Event, Tournament } from "@/lib/types";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "test-id",
    name: "テスト大会",
    event_date: null,
    court_count: 1,
    status: "preparing",
    is_active: false,
    max_weight_diff: null,
    max_height_diff: null,
    court_names: null,
    entry_closed: false,
    entry_close_at: null,
    banner_image_path: null,
    ogp_image_path: null,
    email_subject_template: null,
    email_body_template: null,
    venue_info: null,
    notification_emails: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    name: "トーナメント1",
    court: "1",
    type: "tournament",
    status: "preparing",
    event_id: "test-id",
    default_rules: null,
    max_weight_diff: null,
    max_height_diff: null,
    sort_order: 0,
    filter_min_weight: null,
    filter_max_weight: null,
    filter_min_age: null,
    filter_max_age: null,
    filter_sex: null,
    filter_experience: null,
    filter_grade: null,
    filter_min_grade: null,
    filter_max_grade: null,
    filter_min_height: null,
    filter_max_height: null,
    ...overrides,
  } as Tournament;
}

describe("getEventPhase", () => {
  it("受付中: entry_closed=false", () => {
    const phase = getEventPhase(makeEvent(), [], []);
    expect(phase.label).toBe("受付中");
    expect(phase.color).toContain("green");
    expect(phase.stepHighlight).toBe(1);
  });

  it("対戦表作成中: entry_closed=true、トーナメント未作成", () => {
    const phase = getEventPhase(makeEvent({ entry_closed: true }), [], []);
    expect(phase.label).toBe("対戦表作成中");
    expect(phase.color).toContain("blue");
    expect(phase.stepHighlight).toBe(2);
  });

  it("対戦表作成中: entry_close_at が過去日時", () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const phase = getEventPhase(makeEvent({ entry_close_at: pastDate }), [], []);
    expect(phase.label).toBe("対戦表作成中");
    expect(phase.stepHighlight).toBe(2);
  });

  it("対戦表作成中: entry_closed=true だがトーナメントに matches がない", () => {
    const phase = getEventPhase(makeEvent({ entry_closed: true }), [makeTournament()], []);
    expect(phase.label).toBe("対戦表作成中");
    expect(phase.stepHighlight).toBe(2);
  });

  it("試合準備中: トーナメント確定済み（matches あり）、is_active=false", () => {
    const phase = getEventPhase(
      makeEvent({ entry_closed: true }),
      [makeTournament()],
      [{ tournament_id: "t1", fighter1_id: "f1", fighter2_id: "f2" }],
    );
    expect(phase.label).toBe("試合準備中");
    expect(phase.color).toContain("yellow");
    expect(phase.stepHighlight).toBe(3);
  });

  it("試合中: is_active=true", () => {
    const phase = getEventPhase(
      makeEvent({ is_active: true, entry_closed: true }),
      [makeTournament()],
      [{ tournament_id: "t1", fighter1_id: "f1", fighter2_id: "f2" }],
    );
    expect(phase.label).toBe("試合中");
    expect(phase.color).toContain("animate-pulse");
    expect(phase.stepHighlight).toBe(3);
  });

  it("試合終了: status=finished", () => {
    const phase = getEventPhase(
      makeEvent({ status: "finished", is_active: true }),
      [makeTournament()],
      [{ tournament_id: "t1", fighter1_id: "f1", fighter2_id: "f2" }],
    );
    expect(phase.label).toBe("試合終了");
    expect(phase.stepHighlight).toBe(3);
  });

  it("試合終了は is_active より優先", () => {
    const phase = getEventPhase(makeEvent({ status: "finished", is_active: true }), [], []);
    expect(phase.label).toBe("試合終了");
  });
});
