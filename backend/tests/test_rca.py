"""
Unit tests for Root Cause Analysis (RCA) Engine.
Validates newly updated physical sensor thresholds for INA219 Current and SW-420 Vibration.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rca.root_cause_engine import perform_rca, calculate_motor_health
from models import SensorThresholds


def test_rca_nominal():
    thresholds = SensorThresholds()
    # Nominal: temp=25°C (<35), current=4.5mA (<7.0), vibration=55.0 ev/s (45..90), speed=30.0 RPM (<=60)
    faults = perform_rca(25.0, 4.5, 55.0, 30.0, True, thresholds)
    assert len(faults) == 0

    health = calculate_motor_health(25.0, 4.5, 55.0, thresholds, "normal")
    assert health.overallHealthScore >= 60
    assert health.status == "normal"


def test_rca_door_hazard():
    thresholds = SensorThresholds()
    # Door open while moving at 30.0 RPM
    faults = perform_rca(25.0, 4.5, 55.0, 30.0, False, thresholds)
    assert len(faults) >= 1
    primary = faults[0]
    assert primary.code == "E-SEC-01"
    assert primary.severity == "critical"
    assert primary.affectedComponent == "Car Door Interlock Switch & Safety Circuit"
    assert len(primary.possibleRootCauses) >= 3
    assert len(primary.recommendedActions) >= 3


def test_rca_overspeed_trip():
    thresholds = SensorThresholds()
    # Speed 135.0 RPM (critical > 120.0 RPM)
    faults = perform_rca(25.0, 4.5, 55.0, 135.0, True, thresholds)
    assert any(f.code == "E-DRV-03" and f.severity == "critical" for f in faults)


def test_rca_compound_bearing_overheating():
    thresholds = SensorThresholds()
    # High vibration (140.0 events/sec > 135.0) + High temperature (50.0°C > 45.0)
    faults = perform_rca(50.0, 4.5, 140.0, 30.0, True, thresholds)
    codes = [f.code for f in faults]
    assert "E-SYS-02" in codes  # Compound Bearing Frictional Overheating
    compound = next(f for f in faults if f.code == "E-SYS-02")
    assert compound.severity == "critical"
    assert compound.componentCategory == "bearing_gearbox"
    assert any("bearing seizure" in c.lower() for c in compound.possibleRootCauses)


# ---------------------------------------------------------------------------
# Specific Current Threshold Boundary Tests:
# NORMAL: < 7.0 mA (e.g. 6.9 mA)
# WARNING: >= 7.0 and <= 9.0 mA (e.g. 7.0, 8.0, 9.0 mA)
# CRITICAL: > 9.0 mA (e.g. 9.1 mA)
# ---------------------------------------------------------------------------

def test_current_boundary_normal_6_9():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 6.9, 55.0, 30.0, True, thresholds)
    current_faults = [f for f in faults if "current" in f.sensorResponsible.lower() or "overcurrent" in f.name.lower()]
    assert len(current_faults) == 0


def test_current_boundary_warning_7_0():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 7.0, 55.0, 30.0, True, thresholds)
    current_faults = [f for f in faults if f.code == "E-ELE-01"]
    assert len(current_faults) == 1
    assert current_faults[0].severity == "warning"


def test_current_boundary_warning_8_0():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 8.0, 55.0, 30.0, True, thresholds)
    current_faults = [f for f in faults if f.code == "E-ELE-01"]
    assert len(current_faults) == 1
    assert current_faults[0].severity == "warning"


def test_current_boundary_warning_9_0():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 9.0, 55.0, 30.0, True, thresholds)
    current_faults = [f for f in faults if f.code == "E-ELE-01"]
    assert len(current_faults) == 1
    assert current_faults[0].severity == "warning"


def test_current_boundary_critical_9_1():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 9.1, 55.0, 30.0, True, thresholds)
    current_faults = [f for f in faults if f.code == "E-ELE-02"]
    assert len(current_faults) == 1
    assert current_faults[0].severity == "critical"


# ---------------------------------------------------------------------------
# Specific Vibration Threshold Boundary Tests:
# 0 RPM & 0 Vibration -> Stationary, Normal (No false fault)
# < 45 events/sec (when moving/active) -> Below normal range / warning (e.g. 44)
# 45 to < 90 events/sec -> NORMAL (e.g. 45, 89)
# 90 to 135 events/sec -> WARNING (e.g. 90, 135)
# > 135 events/sec -> CRITICAL (e.g. 136)
# ---------------------------------------------------------------------------

def test_vibration_stationary_zero_rpm_no_fault():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 4.5, 0.0, 0.0, True, thresholds)
    assert len(faults) == 0


def test_vibration_boundary_below_normal_44():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 4.5, 44.0, 30.0, True, thresholds)
    vib_faults = [f for f in faults if f.code == "E-MEC-00"]
    assert len(vib_faults) == 1
    assert vib_faults[0].severity == "warning"


def test_vibration_boundary_normal_45():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 4.5, 45.0, 30.0, True, thresholds)
    vib_faults = [f for f in faults if "vibration" in f.sensorResponsible.lower()]
    assert len(vib_faults) == 0


def test_vibration_boundary_normal_89():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 4.5, 89.0, 30.0, True, thresholds)
    vib_faults = [f for f in faults if "vibration" in f.sensorResponsible.lower()]
    assert len(vib_faults) == 0


def test_vibration_boundary_warning_90():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 4.5, 90.0, 30.0, True, thresholds)
    vib_faults = [f for f in faults if f.code == "E-MEC-01"]
    assert len(vib_faults) == 1
    assert vib_faults[0].severity == "warning"


def test_vibration_boundary_warning_135():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 4.5, 135.0, 30.0, True, thresholds)
    vib_faults = [f for f in faults if f.code == "E-MEC-01"]
    assert len(vib_faults) == 1
    assert vib_faults[0].severity == "warning"


def test_vibration_boundary_critical_136():
    thresholds = SensorThresholds()
    faults = perform_rca(25.0, 4.5, 136.0, 30.0, True, thresholds)
    vib_faults = [f for f in faults if f.code == "E-MEC-02"]
    assert len(vib_faults) == 1
    assert vib_faults[0].severity == "critical"
