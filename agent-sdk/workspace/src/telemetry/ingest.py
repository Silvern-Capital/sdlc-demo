"""Parse and validate telemetry samples, then count what was accepted.

The rules here are deliberately simple. The demo asks the agent to add one
more rule (see requirements/REQ-042.md) without breaking the existing ones.
"""

from datetime import datetime, timedelta, timezone

from .models import TelemetrySample

MAX_SPEED_KPH = 400.0
MAX_FUTURE_SKEW = timedelta(hours=24)


class ValidationError(ValueError):
    """Raised when a sample breaks one of the ingest rules."""


def parse_sample(raw: dict) -> TelemetrySample:
    """Turn a raw dict (for example from JSON) into a TelemetrySample.

    The timestamp must be ISO 8601. A naive timestamp is treated as UTC.
    """
    try:
        vehicle_id = str(raw["vehicle_id"])
        timestamp = datetime.fromisoformat(str(raw["timestamp"]))
        speed_kph = float(raw["speed_kph"])
        fuel_pct = float(raw["fuel_pct"])
    except KeyError as exc:
        raise ValidationError(f"missing field: {exc.args[0]}") from exc
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"bad field value: {exc}") from exc

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    else:
        timestamp = timestamp.astimezone(timezone.utc)

    return TelemetrySample(vehicle_id, timestamp, speed_kph, fuel_pct)


def validate_sample(sample: TelemetrySample, now: datetime | None = None) -> None:
    """Raise ValidationError if the sample breaks a rule. Return None if it is fine.

    now is injectable so tests can control the clock. It defaults to the
    current UTC time.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    if not sample.vehicle_id.strip():
        raise ValidationError("vehicle_id must not be empty")
    if not 0.0 <= sample.speed_kph <= MAX_SPEED_KPH:
        raise ValidationError(f"speed_kph out of range: {sample.speed_kph}")
    if not 0.0 <= sample.fuel_pct <= 100.0:
        raise ValidationError(f"fuel_pct out of range: {sample.fuel_pct}")
    if sample.timestamp - now > MAX_FUTURE_SKEW:
        raise ValidationError(
            f"timestamp is more than 24 hours in the future: {sample.timestamp.isoformat()}"
        )


class IngestService:
    """Accepts raw samples, keeps the valid ones, and counts the rest."""

    def __init__(self, now: datetime | None = None) -> None:
        self._now = now
        self.accepted: list[TelemetrySample] = []
        self.rejected: list[tuple[dict, str]] = []

    def submit(self, raw: dict) -> bool:
        """Return True if the sample was accepted, False if it was rejected."""
        try:
            sample = parse_sample(raw)
            validate_sample(sample, now=self._now)
        except ValidationError as exc:
            self.rejected.append((raw, str(exc)))
            return False
        self.accepted.append(sample)
        return True

    def stats(self) -> dict:
        return {"accepted": len(self.accepted), "rejected": len(self.rejected)}
