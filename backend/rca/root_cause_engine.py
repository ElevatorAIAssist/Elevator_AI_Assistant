"""
Rule-Based Root Cause Analysis (RCA) Engine for Elevator Systems.
Adheres to EN 81-20/50 & ASME A17.1 baseline principles.
Supports multiple simultaneous abnormal conditions.
Clearly distinguishes potential hypotheses from confirmed failures.
"""

import time
from typing import List, Dict, Any, Optional
from models import RCAResult, SensorThresholds, MotorHealthMetrics, SystemSeverity


def perform_rca(
    temperature: float,
    current: float,
    vibration: float,
    speed: float,
    door_closed: bool,
    thresholds: Optional[SensorThresholds] = None,
    ml_predicted_fault: Optional[str] = None
) -> List[RCAResult]:
    """
    Evaluates sensor values, thresholds, and ML predictions to isolate faults
    and produce engineering root cause hypotheses with corrective action steps.
    """
    if thresholds is None:
        thresholds = SensorThresholds()

    faults: List[RCAResult] = []
    now = time.time()

    # 1. Door Interlock Hazard Check (Class-1 Safety Critical)
    if not door_closed and speed > thresholds.doorHazardSpeedLimit:
        faults.append(RCAResult(
            id="FLT-DOOR-01",
            code="E-SEC-01",
            name="Unsafe Hoistway Door Opening in Motion",
            severity="critical",
            affectedComponent="Car Door Interlock Switch & Safety Circuit",
            componentCategory="door_interlock",
            sensorResponsible="Door Position & Lock Contact Limit Switch",
            triggerValue=f"Door OPEN at {speed:.2f} m/s",
            thresholdBreached=f"Movement with doors unlatched (limit: {thresholds.doorHazardSpeedLimit:.2f} m/s)",
            detectedAt=now,
            isolationConfidence=98.5,
            maintenanceUrgency="Immediate Shutdown Required",
            possibleRootCauses=[
                "HYPOTHESIS 1: Physical bypass or mechanical failure of car door gate switch interlock beak.",
                "HYPOTHESIS 2: Foreign object debris jammed in car sill or door clutch roller assembly.",
                "HYPOTHESIS 3: Worn door operator synchronous belt causing premature latch release during flight.",
                "HYPOTHESIS 4: Welded safety relay contact maintaining run circuit despite open contact blade."
            ],
            recommendedActions=[
                "Step 1: Actuate emergency safety brake circuit immediately (Class-1 Safety Stop).",
                "Step 2: Verify physical integrity of door pick-up rollers, interlock beak, and contact wipe.",
                "Step 3: Inspect door gate switch wiring harness for ground faults or bridged terminals.",
                "Step 4: Execute static door dwell time and closing force recalibration prior to return-to-service."
            ],
            isolationProtocol=[
                "Isolate Car Door Operator subsystem from dispatch supervisor.",
                "Lock out car call registration and verify hoistway door landing contacts.",
                "Execute slow-speed inspection run to verify electrical break on door opening."
            ]
        ))

    # 2. Elevator Speed Check (Overspeed / Profile Drift)
    if speed >= thresholds.speedCritical:
        faults.append(RCAResult(
            id="FLT-SPD-02",
            code="E-DRV-03",
            name="Traction Drive Overspeed Trip",
            severity="critical",
            affectedComponent="Traction Sheave & Governor Mechanism",
            componentCategory="drive_inverter",
            sensorResponsible="Shaft Optical Rotary Encoder & Speed Sensor",
            triggerValue=f"{speed:.2f} m/s",
            thresholdBreached=f"Exceeded critical speed trip (> {thresholds.speedCritical:.2f} m/s)",
            detectedAt=now,
            isolationConfidence=95.0,
            maintenanceUrgency="Immediate Shutdown Required",
            possibleRootCauses=[
                "HYPOTHESIS 1: Variable Frequency Drive (VFD) inverter IGBT runaway or closed-loop feedback pulse loss.",
                "HYPOTHESIS 2: Traction rope slip across drive sheave grooves under unbalanced counterweight loading.",
                "HYPOTHESIS 3: Mechanical overspeed governor trip switch failure or slack tension cable.",
                "HYPOTHESIS 4: Mechanical brake caliper failed to drop or experiencing severe lining glazing."
            ],
            recommendedActions=[
                "Step 1: Initiate controlled electrical deceleration followed by mechanical emergency brake drop.",
                "Step 2: Inspect tachometer/encoder coupling and shielded quadrature signal cable.",
                "Step 3: Perform counterweight balance ratio verification and traction rope groove tension audit.",
                "Step 4: Examine mechanical governor flyweights, trip linkage, and safety gear wedge clearance."
            ],
            isolationProtocol=[
                "Disconnect VFD output contactor.",
                "Deploy primary electromechanical disc brake and auxiliary rope gripper.",
                "Log hoistway position index for elevator safety code EN 81-20 inspection."
            ]
        ))
    elif speed > thresholds.speedMaxNormal:
        faults.append(RCAResult(
            id="FLT-SPD-01",
            code="E-DRV-02",
            name="Elevator Speed Profile Variance (High Velocity)",
            severity="warning",
            affectedComponent="Variable Frequency Inverter (VFD) Speed Regulator",
            componentCategory="drive_inverter",
            sensorResponsible="Shaft Optical Rotary Encoder",
            triggerValue=f"{speed:.2f} m/s",
            thresholdBreached=f"Exceeded nominal operating envelope (> {thresholds.speedMaxNormal:.2f} m/s)",
            detectedAt=now,
            isolationConfidence=88.0,
            maintenanceUrgency="Schedule Inspection within 24 Hours",
            possibleRootCauses=[
                "HYPOTHESIS 1: Tuning drift in VFD proportional-integral (PI) speed loop.",
                "HYPOTHESIS 2: Mild traction sheave friction variation during acceleration curve.",
                "HYPOTHESIS 3: Encoder pulse jitter caused by electrical noise coupling onto 24V supply."
            ],
            recommendedActions=[
                "Step 1: Perform drive auto-tune and inspect S-curve acceleration profile parameters.",
                "Step 2: Verify encoder cable grounding shield and check for pulse jitter on oscilloscope.",
                "Step 3: Inspect guide shoe friction and rail lubrication film uniformity."
            ],
            isolationProtocol=[
                "Monitor subsequent travel cycles for repeatable velocity overshoot.",
                "Throttle maximum rated acceleration parameter by 15% if drift continues."
            ]
        ))

    # 3. Motor Temperature Evaluation
    if temperature >= thresholds.temperatureCritical:
        faults.append(RCAResult(
            id="FLT-TMP-02",
            code="E-MOT-02",
            name="Critical Traction Motor Thermal Overload",
            severity="critical",
            affectedComponent="Permanent Magnet Synchronous Motor (PMSM) Stator",
            componentCategory="traction_motor",
            sensorResponsible="Motor Stator PT100 Resistance Temperature Detector (RTD)",
            triggerValue=f"{temperature:.1f} °C",
            thresholdBreached=f"Exceeded critical thermal threshold (> {thresholds.temperatureCritical:.1f} °C)",
            detectedAt=now,
            isolationConfidence=96.0,
            maintenanceUrgency="Immediate Shutdown Required",
            possibleRootCauses=[
                "HYPOTHESIS 1: Prolonged excessive mechanical drag in guide rails or hoisting ropes.",
                "HYPOTHESIS 2: Cooling blower failure or obstructed ventilation ducts in machine room.",
                "HYPOTHESIS 3: High harmonic losses or unbalanced phase voltages from drive inverter.",
                "HYPOTHESIS 4: Stator winding turn-to-turn insulation breakdown creating localized hotspots."
            ],
            recommendedActions=[
                "Step 1: Safely park car at nearest landing, release passengers, and remove from service.",
                "Step 2: Measure stator winding insulation resistance (Megger test 500V DC).",
                "Step 3: Check forced cooling fan airflow, thermal relay circuit, and air filters.",
                "Step 4: Verify three-phase current balance and thermal camera scan of stator iron core."
            ],
            isolationProtocol=[
                "Isolate Traction Machine from dispatch group.",
                "Engage machine room exhaust auxiliary fan override.",
                "Prevent motor restart until core temperature cools below 50.0°C."
            ]
        ))
    elif temperature >= thresholds.temperatureWarning:
        faults.append(RCAResult(
            id="FLT-TMP-01",
            code="E-MOT-01",
            name="Elevated Motor Operating Temperature",
            severity="warning",
            affectedComponent="Traction Motor Stator & Machine Room Cooling",
            componentCategory="traction_motor",
            sensorResponsible="Motor Stator PT100 RTD Sensor",
            triggerValue=f"{temperature:.1f} °C",
            thresholdBreached=f"Exceeded warning threshold (> {thresholds.temperatureWarning:.1f} °C)",
            detectedAt=now,
            isolationConfidence=89.0,
            maintenanceUrgency="Schedule Inspection within 24 Hours",
            possibleRootCauses=[
                "HYPOTHESIS 1: Heavy traffic duty cycle exceeding thermal dissipation capacity.",
                "HYPOTHESIS 2: Inadequate machine room ventilation or elevated ambient room temperature.",
                "HYPOTHESIS 3: Early-stage bearing friction or slight brake drag during run cycles."
            ],
            recommendedActions=[
                "Step 1: Verify ambient machine room HVAC cooling temperature is maintained below 35°C.",
                "Step 2: Inspect motor cooling fan impeller and remove dust buildup on heatsink fins.",
                "Step 3: Audit brake air gap to ensure zero mechanical friction during full travel."
            ],
            isolationProtocol=[
                "Increase dispatch inter-run dwell timer by 5 seconds to reduce thermal buildup.",
                "Log temperature decay rate to estimate motor thermal time constant."
            ]
        ))

    # 4. Motor Current Evaluation
    curr_unit = "mA" if thresholds.currentCritical <= 50.0 else "A"
    if current > thresholds.currentCritical:
        faults.append(RCAResult(
            id="FLT-CUR-02",
            code="E-ELE-02",
            name="Motor Overcurrent Spike / Mechanical Jam Risk",
            severity="critical",
            affectedComponent="Motor Armature Windings & Drive Power Stage",
            componentCategory="drive_inverter",
            sensorResponsible="INA219 Current Sensor" if curr_unit == "mA" else "Hall Effect AC Current Transducer (LEM)",
            triggerValue=f"{current:.2f} {curr_unit}",
            thresholdBreached=f"Exceeded critical current limit (> {thresholds.currentCritical:.2f} {curr_unit})",
            detectedAt=now,
            isolationConfidence=95.0,
            maintenanceUrgency="Immediate Shutdown Required",
            possibleRootCauses=[
                "HYPOTHESIS 1: Severe mechanical binding or obstruction in car safety gear or counterweight shoes.",
                "HYPOTHESIS 2: Traction motor brake failing to lift fully (brake shoe dragging on drum/disc).",
                "HYPOTHESIS 3: Short-circuit or ground fault in motor supply feeder cables.",
                "HYPOTHESIS 4: Current sensor calibration drift or damaged inverter transistor module."
            ],
            recommendedActions=[
                "Step 1: Cut motor drive torque immediately and set mechanical holding brake.",
                "Step 2: Manually inspect brake shoe lift clearance with feeler gauge (standard 0.25 - 0.35 mm).",
                "Step 3: Conduct mechanical free-wheel test in balanced car condition.",
                "Step 4: Verify phase resistance balance across U-V-W motor terminals."
            ],
            isolationProtocol=[
                "Trigger VFD electronic overcurrent trip relay (OC-1).",
                "Isolate power converter supply to protect power semiconductor modules."
            ]
        ))
    elif current >= thresholds.currentWarning:
        faults.append(RCAResult(
            id="FLT-CUR-01",
            code="E-ELE-01",
            name="Elevated Motor Current Consumption",
            severity="warning",
            affectedComponent="Traction Drive Line / Counterweight Balance",
            componentCategory="traction_motor",
            sensorResponsible="INA219 Current Sensor" if curr_unit == "mA" else "Hall Effect AC Current Transducer",
            triggerValue=f"{current:.2f} {curr_unit}",
            thresholdBreached=f"Exceeded warning current limit (> {thresholds.currentWarning:.2f} {curr_unit})",
            detectedAt=now,
            isolationConfidence=86.0,
            maintenanceUrgency="Schedule Inspection within 24 Hours",
            possibleRootCauses=[
                "HYPOTHESIS 1: Elevated friction on elevator car guide rail shoe liners or roller guides.",
                "HYPOTHESIS 2: Counterweight balance miscalibration (improper compensation chains).",
                "HYPOTHESIS 3: Transient overcapacity or uneven car load distribution."
            ],
            recommendedActions=[
                "Step 1: Lubricate guide rails and inspect roller guide spring tensions.",
                "Step 2: Check counterweight fill weight ratio against empty car mass.",
                "Step 3: Calibrate load weighing transducer beneath car platform."
            ],
            isolationProtocol=[
                "Compare current draw during UP vs DOWN travel to isolate direction-dependent drag."
            ]
        ))

    # 5. Vibration Evaluation
    vib_unit = "events/sec" if thresholds.vibrationCritical > 25.0 else "mm/s"
    vib_low = getattr(thresholds, "vibrationLow", 45.0)
    if vibration > thresholds.vibrationCritical:
        faults.append(RCAResult(
            id="FLT-VIB-02",
            code="E-MEC-02",
            name="Critical Mechanical Vibration / Bearing Degradation",
            severity="critical",
            affectedComponent="Drive Machine Bearings & Deflector Sheave",
            componentCategory="bearing_gearbox",
            sensorResponsible="SW-420 Vibration Sensor" if vib_unit == "events/sec" else "Triaxial Industrial Piezoelectric Accelerometer",
            triggerValue=f"{vibration:.2f} {vib_unit}",
            thresholdBreached=f"Exceeded critical vibration limit (> {thresholds.vibrationCritical:.2f} {vib_unit})",
            detectedAt=now,
            isolationConfidence=94.0,
            maintenanceUrgency="Immediate Shutdown Required",
            possibleRootCauses=[
                "HYPOTHESIS 1: Severe spalling, raceway pitting, or cage rupture in drive sheave bearing.",
                "HYPOTHESIS 2: Major mechanical misalignment between motor shaft and traction sheave.",
                "HYPOTHESIS 3: Rope fatigue, uneven rope elongation, or damaged traction grooves causing resonance.",
                "HYPOTHESIS 4: Loose structural anchor bolts securing machine bedplate to structural slab."
            ],
            recommendedActions=[
                "Step 1: Halt high-speed operation; park elevator at designated service floor.",
                "Step 2: Perform vibration spectral FFT analysis to confirm bearing defect frequencies (BPFO/BPFI).",
                "Step 3: Check torque on bedplate mounting bolts and vibration isolator rubber pads.",
                "Step 4: Inspect drive sheave bearing grease for metallic particle contamination."
            ],
            isolationProtocol=[
                "Lock out traction machine drive.",
                "Transfer car to manual hoistway inspection mode."
            ]
        ))
    elif vibration >= thresholds.vibrationWarning:
        faults.append(RCAResult(
            id="FLT-VIB-01",
            code="E-MEC-01",
            name="Elevated Machine Vibration Level",
            severity="warning",
            affectedComponent="Traction Sheave Bearings & Guide Rail Joints",
            componentCategory="bearing_gearbox",
            sensorResponsible="SW-420 Vibration Sensor" if vib_unit == "events/sec" else "Triaxial Accelerometer (Machine Bedplate)",
            triggerValue=f"{vibration:.2f} {vib_unit}",
            thresholdBreached=f"Exceeded warning vibration limit (> {thresholds.vibrationWarning:.2f} {vib_unit})",
            detectedAt=now,
            isolationConfidence=85.0,
            maintenanceUrgency="Schedule Inspection within 24 Hours",
            possibleRootCauses=[
                "HYPOTHESIS 1: Early micro-fretting or grease starvation in machine bearings.",
                "HYPOTHESIS 2: Minor guide rail joint misalignment or dry friction spot in hoistway.",
                "HYPOTHESIS 3: Slight unbalance in drive motor rotor."
            ],
            recommendedActions=[
                "Step 1: Replenish synthetic polyurea bearing grease according to manufacturer specification.",
                "Step 2: Inspect rail joints using precision straightedge and alignment gauge.",
                "Step 3: Log acceleration RMS trending to assess rate of mechanical wear."
            ],
            isolationProtocol=[
                "Tag car for automated vibration trend monitoring on subsequent travel cycles."
            ]
        ))
    elif vibration < vib_low and (speed > 0.1 or vibration > 0):
        faults.append(RCAResult(
            id="FLT-VIB-00",
            code="E-MEC-00",
            name="Insufficient Vibration Telemetry / Below Operating Range",
            severity="warning",
            affectedComponent="Vibration Transducer Mounting & SW-420 Sensor",
            componentCategory="bearing_gearbox",
            sensorResponsible="SW-420 Digital Vibration Sensor",
            triggerValue=f"{vibration:.2f} {vib_unit}",
            thresholdBreached=f"Below minimum normal operating range (< {vib_low:.2f} {vib_unit})",
            detectedAt=now,
            isolationConfidence=80.0,
            maintenanceUrgency="Inspect sensor mounting and wiring",
            possibleRootCauses=[
                "HYPOTHESIS 1: Vibration sensor detached or loose mounting on test frame.",
                "HYPOTHESIS 2: Sensitivity potentiometer on SW-420 misadjusted.",
                "HYPOTHESIS 3: Signal wire loose or discontinuous digital pulse train."
            ],
            recommendedActions=[
                "Step 1: Check sensor bracket mechanical fastening to elevator rig.",
                "Step 2: Calibrate SW-420 digital comparator sensitivity threshold."
            ],
            isolationProtocol=[
                "Tag vibration telemetry channel for inspection."
            ]
        ))

    # 6. Compound Multi-Sensor Fault Isolation
    has_high_temp = temperature >= thresholds.temperatureWarning
    has_high_current = current >= thresholds.currentWarning
    has_high_vib = vibration >= thresholds.vibrationWarning

    # Compound A: High Temp + High Current -> Stator Stress
    if has_high_temp and has_high_current:
        sev = "critical" if (temperature >= thresholds.temperatureCritical or current > thresholds.currentCritical) else "warning"
        faults.append(RCAResult(
            id="FLT-CMP-01",
            code="E-SYS-01",
            name="Compound Electro-Thermal Stator Stress",
            severity=sev,
            affectedComponent="Motor Armature & Power Inverter Stage",
            componentCategory="traction_motor",
            sensorResponsible="Correlated: PT100 RTD + LEM Current Sensor",
            triggerValue=f"Temp: {temperature:.1f}°C, Current: {current:.2f}A",
            thresholdBreached="Dual Warning/Critical breach in Thermal and Electrical domains",
            detectedAt=now,
            isolationConfidence=97.0,
            maintenanceUrgency="Immediate Shutdown Required" if sev == "critical" else "Schedule Inspection within 24 Hours",
            possibleRootCauses=[
                "HYPOTHESIS 1: Stator winding inter-turn insulation degradation creating local eddy current loops.",
                "HYPOTHESIS 2: Persistent mechanical dragging in brake assembly holding friction during run.",
                "HYPOTHESIS 3: VFD carrier frequency harmonics inducing excessive iron losses."
            ],
            recommendedActions=[
                "Step 1: Perform motor winding surge test and phase inductance balance test.",
                "Step 2: Verify mechanical brake shoe completely clears the drum/disc with 0.3mm feeler gauge.",
                "Step 3: Audit VFD switching frequency settings and output choke filtering."
            ],
            isolationProtocol=[
                "Isolate from multi-car group dispatching.",
                "Run thermal cooldown diagnostic cycle."
            ]
        ))

    # Compound B: High Vib + High Temp -> Bearing Seizure Risk
    if has_high_vib and has_high_temp:
        faults.append(RCAResult(
            id="FLT-CMP-02",
            code="E-SYS-02",
            name="Mechanical Bearing Frictional Overheating",
            severity="critical",
            affectedComponent="Drive Sheave Main Spherical Roller Bearing",
            componentCategory="bearing_gearbox",
            sensorResponsible="Correlated: Accelerometer + PT100 RTD",
            triggerValue=f"Vib: {vibration:.2f} mm/s, Temp: {temperature:.1f}°C",
            thresholdBreached="Simultaneous mechanical vibration and thermal threshold escalation",
            detectedAt=now,
            isolationConfidence=99.0,
            maintenanceUrgency="Immediate Shutdown Required",
            possibleRootCauses=[
                "HYPOTHESIS 1: Imminent bearing seizure: severe grease degradation, metal-to-metal raceway contact.",
                "HYPOTHESIS 2: Loss of internal radial bearing clearance due to improper fit or thermal expansion.",
                "HYPOTHESIS 3: Fractured ball or roller element inside main machine bearing cartridge."
            ],
            recommendedActions=[
                "Step 1: Immediately cease passenger service and engage physical machine lock.",
                "Step 2: Sample bearing lubricant for ferrographic wear debris analysis.",
                "Step 3: Prepare replacement bearing cartridge and hydraulic puller tools for immediate overhaul."
            ],
            isolationProtocol=[
                "Lock Out / Tag Out (LOTO) traction machine drive power.",
                "Isolate hoistway and display 'Out of Service for Maintenance' at landing halls."
            ]
        ))

    # Compound C: High Current + High Vib -> Mechanical Jam
    if has_high_current and has_high_vib:
        sev = "critical" if (current > thresholds.currentCritical or vibration > thresholds.vibrationCritical) else "warning"
        faults.append(RCAResult(
            id="FLT-CMP-03",
            code="E-SYS-03",
            name="High Friction Electro-Mechanical Drag",
            severity=sev,
            affectedComponent="Guide Shoes, Safety Gear & Traction Sheave",
            componentCategory="guide_rail_counterweight",
            sensorResponsible="Correlated: LEM Current Sensor + Accelerometer",
            triggerValue=f"Current: {current:.2f}A, Vib: {vibration:.2f} mm/s",
            thresholdBreached="Simultaneous motor current draw surge and mechanical vibration spike",
            detectedAt=now,
            isolationConfidence=95.0,
            maintenanceUrgency="Immediate Shutdown Required" if sev == "critical" else "Schedule Inspection within 24 Hours",
            possibleRootCauses=[
                "HYPOTHESIS 1: Mechanical binding between car roller guide shoes and misaligned hoistway guide rails.",
                "HYPOTHESIS 2: Car safety gear wedge partially dragging along rail blade.",
                "HYPOTHESIS 3: Unbalanced counterweight compensation chain binding at pit bottom."
            ],
            recommendedActions=[
                "Step 1: Inspect guide shoe rollers and spring tension adjustments on car and counterweight frame.",
                "Step 2: Verify guide rail plumbness, joint alignment, and surface rail lubrication.",
                "Step 3: Examine safety gear linkages for proper free release travel clearance."
            ],
            isolationProtocol=[
                "Execute slow-speed test run in inspection mode.",
                "Monitor instantaneous motor torque output across each hoistway zone."
            ]
        ))

    # Sort critical first, then by confidence
    faults.sort(key=lambda f: (0 if f.severity == "critical" else 1, -f.isolationConfidence))
    return faults


def calculate_motor_health(
    temperature: float,
    current: float,
    vibration: float,
    thresholds: Optional[SensorThresholds] = None,
    system_status: SystemSeverity = "normal"
) -> MotorHealthMetrics:
    if thresholds is None:
        thresholds = SensorThresholds()

    temp_ratio = max(0.0, (temperature - 20.0) / (thresholds.temperatureCritical - 20.0))
    thermal_score = max(0, min(100, round(100.0 - temp_ratio * 90.0)))

    current_ratio = max(0.0, current / thresholds.currentCritical)
    electrical_score = max(0, min(100, round(100.0 - current_ratio * 85.0)))

    vib_ratio = max(0.0, vibration / thresholds.vibrationCritical)
    mechanical_score = max(0, min(100, round(100.0 - vib_ratio * 95.0)))

    overall = max(0, min(100, round(
        thermal_score * 0.35 + electrical_score * 0.35 + mechanical_score * 0.30
    )))

    valid_status: SystemSeverity
    if system_status == "critical":
        valid_status = "critical"
    elif system_status == "warning":
        valid_status = "warning"
    else:
        valid_status = "normal"

    return MotorHealthMetrics(
        overallHealthScore=overall,
        thermalStressScore=thermal_score,
        electricalStressScore=electrical_score,
        mechanicalVibrationScore=mechanical_score,
        status=valid_status
    )

