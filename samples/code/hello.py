"""Turbine report — Python sample."""
from dataclasses import dataclass


@dataclass
class Turbine:
    name: str
    power_kw: float

    def status(self) -> str:
        return "Running" if self.power_kw > 0 else "Stopped"


farm = [Turbine("WTG-01", 2410.5), Turbine("WTG-02", 0)]
for t in farm:
    print(f"{t.name}: {t.status()} ({t.power_kw:.1f} kW)")  # 打印状态
