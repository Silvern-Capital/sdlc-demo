"""Data model for one telemetry sample sent by a (synthetic) vehicle."""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class TelemetrySample:
    """One reading from one vehicle.

    timestamp is always timezone aware and always in UTC. parse_sample()
    takes care of that conversion so the rest of the code can rely on it.
    """

    vehicle_id: str
    timestamp: datetime
    speed_kph: float
    fuel_pct: float
