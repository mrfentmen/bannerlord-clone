"""Tests for the route-graph edge builder (worlddata.transforms.roads).

What these check, and why it matters:

* A TIGER/Line rail feature is often a short fragment (yard lead, siding,
  digitisation piece). With a 20 km snap radius such a fragment can snap to
  two towns far apart and become a "route" whose recorded length is shorter
  than the straight line between the towns -- geometrically impossible, and
  it poisons every travel-time and trade-cost number the game derives from
  ``distance_km``. The builder must drop fragments that cannot plausibly
  connect their snapped settlements.
* No route may ever report a distance shorter than the great-circle distance
  between its endpoints. This is the regression gate for the 2026-09-30
  audit that found 63% of rail routes violating it.
"""

from __future__ import annotations

from worlddata.config import load_config
from worlddata.geo.wgs84 import haversine_km
from worlddata.transforms.roads import RouteSegment, _build_route_edges


def _segment(
    segment_id: str,
    from_id: str | None,
    to_id: str | None,
    length_km: float,
    kind: str = "rail",
) -> RouteSegment:
    return RouteSegment(
        segment_id=segment_id,
        kind=kind,
        name=None,
        road_class="rail",
        length_km=length_km,
        speed_kmh=60.0,
        travel_hours=length_km / 60.0,
        road_safety=0.5,
        from_settlement_id=from_id,
        to_settlement_id=to_id,
        snap_from_km=1.0 if from_id else None,
        snap_to_km=1.0 if to_id else None,
        vertex_count=4,
    )


def _points():
    # Two towns ~19.3 km apart (mirrors the worst offender in the audit:
    # rail:06-16350->06-86832).
    return {"town-a": (-82.0, 39.0), "town-b": (-81.78, 39.0)}


def test_phantom_fragment_forms_no_route():
    """A 30-metre siding snapping to towns 19 km apart is not a connection."""
    config = load_config()
    points = _points()
    gc = haversine_km(points["town-a"], points["town-b"])
    assert gc > 10.0  # the fixture really is far apart
    segments = [_segment("rail-frag", "town-a", "town-b", 0.03)]
    routes, note = _build_route_edges(segments, points, config)
    assert routes == []
    assert "1" in note  # the drop is reported


def test_plausible_segment_forms_route():
    """A line covering most of the inter-town distance becomes an edge."""
    config = load_config()
    points = _points()
    gc = haversine_km(points["town-a"], points["town-b"])
    segments = [_segment("rail-main", "town-a", "town-b", gc * 1.2)]
    routes, _ = _build_route_edges(segments, points, config)
    assert len(routes) == 1
    assert routes[0].distance_km == gc * 1.2
    assert routes[0].segment_ids == ("rail-main",)


def test_route_distance_never_below_great_circle():
    """Even surviving members cannot sum to less than the straight line."""
    config = load_config()
    points = _points()
    gc = haversine_km(points["town-a"], points["town-b"])
    # Two members, each just over half the straight line: both plausible,
    # but their sum is still below it once the floor is removed -- the
    # builder must floor at the great circle.
    segments = [
        _segment("rail-p1", "town-a", "town-b", gc * 0.55),
        _segment("rail-p2", "town-a", "town-b", gc * 0.40),
    ]
    routes, _ = _build_route_edges(segments, points, config)
    assert len(routes) == 1
    # Only p1 is plausible (0.40 < 0.5 fraction); distance floored at gc.
    assert routes[0].segment_ids == ("rail-p1",)
    assert routes[0].distance_km == gc


def test_unrelated_segments_still_grouped():
    """Plausible parallel members of one town pair sum into a single edge."""
    config = load_config()
    points = _points()
    gc = haversine_km(points["town-a"], points["town-b"])
    segments = [
        _segment("rail-n1", "town-a", "town-b", gc * 0.9),
        _segment("rail-n2", "town-a", "town-b", gc * 0.8),
    ]
    routes, _ = _build_route_edges(segments, points, config)
    assert len(routes) == 1
    assert routes[0].distance_km == gc * 1.7
    assert set(routes[0].segment_ids) == {"rail-n1", "rail-n2"}
