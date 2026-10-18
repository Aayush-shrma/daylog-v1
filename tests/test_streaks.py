"""Unit tests for the pure streak / heatmap functions."""

import datetime as dt

import pytest

from app.services.streaks import current_streak, heatmap_level, longest_streak

TODAY = dt.date(2026, 10, 17)


def days_ago(*offsets):
    return [TODAY - dt.timedelta(days=o) for o in offsets]


# --- heatmap_level -----------------------------------------------------------

@pytest.mark.parametrize(
    "count,level",
    [(0, 0), (1, 1), (2, 1), (3, 2), (4, 2), (5, 3), (6, 3), (7, 4), (100, 4)],
)
def test_heatmap_level_boundaries(count, level):
    assert heatmap_level(count) == level


def test_heatmap_level_negative_is_zero():
    assert heatmap_level(-3) == 0


# --- current_streak ----------------------------------------------------------

def test_current_streak_empty():
    assert current_streak([], TODAY) == 0


def test_current_streak_single_today():
    assert current_streak([TODAY], TODAY) == 1


def test_current_streak_only_yesterday():
    assert current_streak(days_ago(1), TODAY) == 1


def test_current_streak_two_days_ago_is_zero():
    assert current_streak(days_ago(2), TODAY) == 0


def test_current_streak_today_and_yesterday():
    assert current_streak(days_ago(0, 1), TODAY) == 2


def test_current_streak_with_gap():
    # today, yesterday, then a gap at 2
    assert current_streak(days_ago(0, 1, 3, 4), TODAY) == 2


def test_current_streak_duplicates_and_unsorted():
    assert current_streak(days_ago(0, 1, 1, 0, 2), TODAY) == 3


def test_current_streak_long_run_ending_yesterday():
    assert current_streak(days_ago(*range(1, 8)), TODAY) == 7


def test_current_streak_across_month_boundary():
    # 2026-11-01 is today, run spans back into October
    today = dt.date(2026, 11, 1)
    dates = [dt.date(2026, 10, 30), dt.date(2026, 10, 31), today]
    assert current_streak(dates, today) == 3


def test_current_streak_across_year_boundary():
    today = dt.date(2027, 1, 1)
    dates = [dt.date(2026, 12, 30), dt.date(2026, 12, 31), today]
    assert current_streak(dates, today) == 3


def test_current_streak_future_dates_ignored():
    assert current_streak(days_ago(-5), TODAY) == 0


# --- longest_streak ----------------------------------------------------------

def test_longest_streak_empty():
    assert longest_streak([]) == 0


def test_longest_streak_single():
    assert longest_streak([TODAY]) == 1


def test_longest_streak_picks_larger_run():
    dates = days_ago(0, 1, 4, 5, 6, 7)
    assert longest_streak(dates) == 4


def test_longest_streak_duplicates_unsorted():
    dates = days_ago(7, 6, 6, 5, 0)
    assert longest_streak(dates) == 3


def test_longest_streak_month_boundary():
    dates = [dt.date(2026, 10, 30), dt.date(2026, 10, 31), dt.date(2026, 11, 1)]
    assert longest_streak(dates) == 3


def test_longest_streak_year_boundary():
    dates = [dt.date(2026, 12, 30), dt.date(2026, 12, 31), dt.date(2027, 1, 1)]
    assert longest_streak(dates) == 3


def test_longest_streak_all_gaps():
    assert longest_streak(days_ago(0, 2, 4)) == 1
