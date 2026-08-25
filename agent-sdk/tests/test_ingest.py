"""Existing test suite for the synthetic telemetry ingest service."""

from datetime import datetime, timezone

import pytest

from telemetry import IngestService, ValidationError, parse_sample, validate_sample

NOW = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)


def good_sample(**overrides) -> dict:
    raw = {
        "vehicle_id": "VIN-DEMO-0001",
        "timestamp": "2026-01-15T11:59:00+00:00",
        "speed_kph": 88.0,
        "fuel_pct": 42.5,
    }
    raw.update(overrides)
    return raw


def test_parse_sample_converts_to_utc():
    sample = parse_sample(good_sample(timestamp="2026-01-15T06:59:00-05:00"))
    assert sample.timestamp == datetime(2026, 1, 15, 11, 59, tzinfo=timezone.utc)


def test_parse_sample_treats_naive_timestamp_as_utc():
    sample = parse_sample(good_sample(timestamp="2026-01-15T11:59:00"))
    assert sample.timestamp.tzinfo is timezone.utc


def test_parse_sample_missing_field():
    raw = good_sample()
    del raw["fuel_pct"]
    with pytest.raises(ValidationError, match="missing field: fuel_pct"):
        parse_sample(raw)


def test_validate_rejects_bad_speed():
    sample = parse_sample(good_sample(speed_kph=999))
    with pytest.raises(ValidationError, match="speed_kph"):
        validate_sample(sample, now=NOW)


def test_validate_rejects_bad_fuel():
    sample = parse_sample(good_sample(fuel_pct=-1))
    with pytest.raises(ValidationError, match="fuel_pct"):
        validate_sample(sample, now=NOW)


def test_validate_rejects_empty_vehicle_id():
    sample = parse_sample(good_sample(vehicle_id="  "))
    with pytest.raises(ValidationError, match="vehicle_id"):
        validate_sample(sample, now=NOW)


def test_service_counts_accepted_and_rejected():
    service = IngestService(now=NOW)
    assert service.submit(good_sample()) is True
    assert service.submit(good_sample(speed_kph=-5)) is False
    assert service.stats() == {"accepted": 1, "rejected": 1}
    assert service.rejected[0][1].startswith("speed_kph")
