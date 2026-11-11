"""Editor view settings.

Unknown keys are dropped, so an older or newer frontend can't break them.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Palette = Literal["inverted-gray", "gray", "magma"]


class DbLevels(BaseModel):
    floor: float = Field(ge=-130, le=0)
    ceil: float = Field(ge=-130, le=0)


class EditorDefaultsSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    palette: Optional[Palette] = None
    # Standardised contrast range; one value for all recordings keeps them comparable.
    range_db: Optional[float] = Field(default=None, ge=20, le=90)


class RecordingViewSettingsData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    palette: Optional[Palette] = None
    fft_size: Optional[Literal[256, 512, 1024, 2048, 4096]] = None
    contrast: Optional[Literal["standard", "custom"]] = None
    # Hand-set levels, only meaningful with contrast "custom".
    levels: Optional[DbLevels] = None
    # Hz; an explicit null means "no floor" (as opposed to never set).
    freq_floor: Optional[float] = Field(default=None, ge=0, le=500_000)
