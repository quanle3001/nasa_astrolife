"""Hide consecutive USB-serial replays of the same complete PPG packet."""

from platformio.device.monitor.filters.base import DeviceMonitorFilterBase


class DedupePpg(DeviceMonitorFilterBase):
    """Synchronize on fresh PPG data and hide display-only duplicates."""

    NAME = "dedupe_ppg"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pending = ""
        self._sync_candidate = None
        self._synchronized = False
        self._previous_ppg = None

    @staticmethod
    def _is_ppg(line):
        fields = line.split(",")
        return len(fields) == 5 and fields[0] == "PPG" and all(
            field.isascii() and field.isdecimal() for field in fields[1:]
        )

    def rx(self, text):
        self._pending += text
        output = []

        while "\n" in self._pending:
            line, self._pending = self._pending.split("\n", 1)
            normalized = line.rstrip("\r")

            if not self._synchronized:
                if not self._is_ppg(normalized):
                    continue
                if self._sync_candidate is None:
                    self._sync_candidate = normalized
                    continue
                if normalized == self._sync_candidate:
                    continue
                self._synchronized = True
                self._previous_ppg = normalized
                output.append(line + "\n")
                continue

            if self._is_ppg(normalized):
                if normalized == self._previous_ppg:
                    continue
                self._previous_ppg = normalized
            else:
                self._previous_ppg = None

            output.append(line + "\n")

        return "".join(output)
