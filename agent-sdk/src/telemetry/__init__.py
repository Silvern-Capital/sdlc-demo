"""Synthetic vehicle telemetry ingest service used by the demo.

Everything in this package is made up for the demo. There is no real
vehicle, customer, or production data here.
"""

from .ingest import IngestService, ValidationError, parse_sample, validate_sample
from .models import TelemetrySample

__all__ = [
    "IngestService",
    "TelemetrySample",
    "ValidationError",
    "parse_sample",
    "validate_sample",
]
