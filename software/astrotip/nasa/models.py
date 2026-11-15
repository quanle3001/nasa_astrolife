"""Pydantic models for NASA API data and its provenance.

Every reading retrieved from a NASA API is validated through these models
before it is cleaned, analysed, cached or shown. A value that fails validation
is never repaired silently: the response or cache is rejected.
"""

from __future__ import annotations

from datetime import datetime
import math

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RadLabReading(BaseModel):
    """One row of the RadLab response: when, which instrument, what value."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    #: Timestamp text exactly as published; RadLab states no time zone.
    timestamp: str = Field(min_length=10, max_length=40)
    instrument_id: str = Field(min_length=1, max_length=80)
    value: float

    @field_validator("timestamp")
    @classmethod
    def _readable_timestamp(cls, text: str) -> str:
        datetime.fromisoformat(text)
        return text

    @field_validator("value")
    @classmethod
    def _finite_non_negative(cls, value: float) -> float:
        if not math.isfinite(value) or value < 0:
            raise ValueError("a dose-rate reading must be a finite, non-negative number")
        return value

    @property
    def moment(self) -> datetime:
        return datetime.fromisoformat(self.timestamp).replace(tzinfo=None)


class InstrumentSeries(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamps: list[str]
    values: list[float]

    @model_validator(mode="after")
    def _aligned_and_valid(self) -> "InstrumentSeries":
        if not self.values or len(self.timestamps) != len(self.values):
            raise ValueError("an instrument series needs one value per timestamp")
        if any(not math.isfinite(value) or value < 0 for value in self.values):
            raise ValueError("an instrument series contains an invalid reading")
        for timestamp in self.timestamps:
            datetime.fromisoformat(timestamp)
        return self


class RadLabDataset(BaseModel):
    """A retrieved dataset with everything needed to say where it came from."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int
    provider: str
    api_url: str
    documentation_url: str
    request_url: str
    measurement: str
    #: Unit as documented by the source; None when the source does not state one.
    unit: str | None
    unit_note: str
    window_start: str
    window_end: str
    timestamp_note: str
    #: When the data was retrieved from NASA (ISO 8601 with offset).
    retrieved_at: str
    response_sha256: str = Field(min_length=64, max_length=64)
    data_sha256: str = Field(min_length=64, max_length=64)
    row_count: int = Field(ge=1)
    #: Version of the retrieve-validate-clean pipeline that produced this dataset.
    pipeline_version: str
    #: What was done to the response before analysis, in order. Values are never altered.
    transformation_steps: list[str]
    limitations: list[str]
    instruments: dict[str, InstrumentSeries]

    @field_validator("retrieved_at")
    @classmethod
    def _readable_retrieval_time(cls, text: str) -> str:
        datetime.fromisoformat(text)
        return text

    @model_validator(mode="after")
    def _consistent(self) -> "RadLabDataset":
        if not self.instruments:
            raise ValueError("a dataset needs at least one instrument")
        if self.row_count != sum(len(series.values) for series in self.instruments.values()):
            raise ValueError("the row count does not match the stored readings")
        return self


class MeasurementProvenance(BaseModel):
    """Where one of the astronaut's own values came from."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    observation_id: str
    indicator_id: str
    label: str
    value: float
    unit: str
    #: "sensor" (ESP32 firmware estimate), "manual" (typed in) or "simulated" (demo stream).
    source: str
    sensor_port: str = ""
    #: When the backend received the firmware report (ISO 8601, UTC); empty for manual entries.
    measured_at: str = ""
    signal_quality: str = "unknown"

    @field_validator("source")
    @classmethod
    def _known_source(cls, source: str) -> str:
        if source not in {"sensor", "manual", "simulated"}:
            raise ValueError("unknown measurement source")
        return source


class HealthIndicator(BaseModel):
    """An indicator AstroLife can collect and the NASA catalog risks it relates to."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    unit: str
    source: str
    checkin_field: str = Field(min_length=1)
    condition_ids: list[str] = Field(min_length=1)
    question_ids: list[str] = []
    why: str = Field(min_length=1)

    @field_validator("source")
    @classmethod
    def _known_source(cls, source: str) -> str:
        if source not in {"sensor", "question"}:
            raise ValueError("an indicator comes from the sensor or from a question")
        return source
