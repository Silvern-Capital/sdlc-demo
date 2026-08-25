"""Tests for REQ-042: reject samples timestamped more than 24 hours ahead."""

from datetime import datetime, timedelta, timezone

import pytest

from telemetry import IngestService, ValidationError, parse_sample, validate_sample

NOW = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)


def sample_at(offset: timedelta) -> dict:
    return {
        "vehicle_id": "VIN-DEMO-0002",
        "timestamp": (NOW + offset).isoformat(),
        "speed_kph": 50.0,
        "fuel_pct": 60.0,
    }


def test_req_042_rejects_25_hours_in_the_future():
    sample = parse_sample(sample_at(timedelta(hours=25)))
    with pytest.raises(ValidationError, match="future"):
        validate_sample(sample, now=NOW)


def test_req_042_accepts_23_hours_in_the_future():
    sample = parse_sample(sample_at(timedelta(hours=23)))
    validate_sample(sample, now=NOW)


def test_req_042_service_does_not_store_rejected_sample():
    service = IngestService(now=NOW)
    assert service.submit(sample_at(timedelta(hours=30))) is False
    assert service.accepted == []
    assert "future" in service.rejected[0][1]
