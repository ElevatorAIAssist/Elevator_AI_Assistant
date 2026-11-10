import { SensorData, SensorThresholds, DetectedFault, SystemStatus, MotorHealthMetrics } from '../types/elevator';

/**
 * Rule-Based Autonomous Fault Isolation and Detection Engine
 * Evaluates real-time or simulated elevator sensor readings against demonstration thresholds.
 */
export function evaluateSensors(
  sensors: SensorData,
  thresholds: SensorThresholds
): {
  status: SystemStatus;
  faults: DetectedFault[];
  motorHealth: MotorHealthMetrics;
} {
  const faults: DetectedFault[] = [];
  const now = sensors.timestamp || Date.now();

  // 1. Door Interlock Hazard Check (Safety Critical)
  // If doors are open while elevator is in motion (speed > threshold)
  // Only evaluate when explicitly false (prototype hardware has no door sensor, doorClosed is null)
  if (sensors.doorClosed === false && sensors.speed > thresholds.doorHazardSpeedLimit) {
    faults.push({
      id: 'FLT-DOOR-01',
      code: 'E-SEC-01',
      name: 'Unsafe Hoistway Door Opening in Motion',
      severity: 'critical',
      affectedComponent: 'Car Door Interlock Switch & Safety Circuit',
      componentCategory: 'door_interlock',
      sensorResponsible: 'Door Position & Lock Contact Limit Switch',
      triggerValue: `Door OPEN at ${sensors.speed.toFixed(2)} m/s`,
      thresholdBreached: `Movement with doors unlatched (limit: ${thresholds.doorHazardSpeedLimit.toFixed(2)} m/s)`,
      detectedAt: now,
      isolationConfidence: 98,
      maintenanceUrgency: 'Immediate Shutdown Required',
      possibleRootCauses: [
        'Physical bypass or failure of the car door gate switch mechanical interlock.',
        'Foreign object debris jammed in the car sill or door clutch roller assembly.',
        'Worn door operator belt causing premature latch disengagement during leveling.',
        'Safety circuit bridge or relay contact welded in energized position.'
      ],
      recommendedActions: [
        'Actuate emergency safety brake circuit immediately (Class-1 Safety Stop).',
        'Verify physical integrity of door pick-up rollers, interlock beak, and electrical contact blades.',
        'Inspect car door lock wiring harness for grounding or intermittent short circuits.',
        'Conduct static door force and dwell time recalibration before returning car to normal dispatch.'
      ],
      isolationProtocol: [
        'Isolate Car Door Operator subsystem from dispatch controller.',
        'Lock out car call registration and verify hoistway door landing contacts.',
        'Execute slow-speed inspection run to verify electrical break on door opening.'
      ]
    });
  }

  // 2. Elevator Speed Check (Overspeed / Irregular Speed)
  if (sensors.speed >= thresholds.speedCritical) {
    faults.push({
      id: 'FLT-SPD-02',
      code: 'E-DRV-03',
      name: 'Traction Drive Overspeed Trip',
      severity: 'critical',
      affectedComponent: 'Traction Sheave & Governor Mechanism',
      componentCategory: 'drive_inverter',
      sensorResponsible: 'Shaft Optical Rotary Encoder & Speed Sensor',
      triggerValue: `${sensors.speed.toFixed(2)} m/s`,
      thresholdBreached: `Exceeded critical speed trip (> ${thresholds.speedCritical.toFixed(2)} m/s)`,
      detectedAt: now,
      isolationConfidence: 94,
      maintenanceUrgency: 'Immediate Shutdown Required',
      possibleRootCauses: [
        'Variable Frequency Drive (VFD) inverter IGBT runaway or closed-loop feedback pulse loss.',
        'Traction rope slip across drive sheave grooves under unbalanced counterweight loading.',
        'Mechanical overspeed governor trip switch failure or slack tension cable.',
        'Mechanical brake caliper failed to drop or experiencing severe lining glazing.'
      ],
      recommendedActions: [
        'Initiate controlled electrical deceleration followed by mechanical emergency brake drop.',
        'Inspect tachometer/encoder coupling and shielded quadrature signal cable.',
        'Perform counterweight balance ratio verification and traction rope groove tension audit.',
        'Examine mechanical governor flyweights, trip linkage, and safety gear wedge clearance.'
      ],
      isolationProtocol: [
        'Disconnect VFD output contactor.',
        'Deploy primary electromechanical disc brake and auxiliary rope gripper if equipped.',
        'Log hoistway position index for elevator safety code EN 81-20 inspection.'
      ]
    });
  } else if (sensors.speed > thresholds.speedMaxNormal) {
    faults.push({
      id: 'FLT-SPD-01',
      code: 'E-DRV-02',
      name: 'Elevator Speed Profile Variance (High Velocity)',
      severity: 'warning',
      affectedComponent: 'Variable Frequency Inverter (VFD) Speed Regulator',
      componentCategory: 'drive_inverter',
      sensorResponsible: 'Shaft Optical Rotary Encoder',
      triggerValue: `${sensors.speed.toFixed(2)} m/s`,
      thresholdBreached: `Exceeded nominal operating envelope (> ${thresholds.speedMaxNormal.toFixed(2)} m/s)`,
      detectedAt: now,
      isolationConfidence: 87,
      maintenanceUrgency: 'Schedule Inspection within 24 Hours',
      possibleRootCauses: [
        'Tuning drift in VFD proportional-integral (PI) speed loop.',
        'Mild traction sheave friction variation during acceleration curve.',
        'Encoder pulse skipping caused by electrical noise coupling onto 24V supply.'
      ],
      recommendedActions: [
        'Perform drive auto-tune and check S-curve acceleration profile parameters.',
        'Verify encoder cable grounding shield and check for pulse jitter on oscilloscope.',
        'Inspect guide shoe friction and rail lubrication film uniformity.'
      ],
      isolationProtocol: [
        'Monitor next 5 travel cycles for repeatable velocity overshoot.',
        'Throttle maximum rated acceleration parameter by 15% if drift continues.'
      ]
    });
  }

  // 3. Motor Temperature Evaluation
  if (sensors.temperature >= thresholds.temperatureCritical) {
    faults.push({
      id: 'FLT-TMP-02',
      code: 'E-MOT-02',
      name: 'Critical Traction Motor Thermal Overload',
      severity: 'critical',
      affectedComponent: 'Permanent Magnet Synchronous Motor (PMSM) Stator',
      componentCategory: 'traction_motor',
      sensorResponsible: 'Motor Stator PT100 Resistance Temperature Detector (RTD)',
      triggerValue: `${sensors.temperature.toFixed(1)} °C`,
      thresholdBreached: `Exceeded critical thermal threshold (> ${thresholds.temperatureCritical.toFixed(1)} °C)`,
      detectedAt: now,
      isolationConfidence: 96,
      maintenanceUrgency: 'Immediate Shutdown Required',
      possibleRootCauses: [
        'Prolonged excessive mechanical drag in guide rails or hoisting ropes.',
        'Cooling blower failure or obstructed ventilation ducts in machine room.',
        'High harmonic losses or unbalanced phase voltages from drive inverter.',
        'Stator winding turn-to-turn insulation breakdown causing localized hotspots.'
      ],
      recommendedActions: [
        'Hold elevator at next landing, safely release passengers, and park out of service.',
        'Measure stator winding insulation resistance (Megger test 500V DC).',
        'Check forced cooling fan airflow, thermal relay circuit, and air filters.',
        'Verify three-phase current balance and thermal camera scan of stator iron core.'
      ],
      isolationProtocol: [
        'Isolate Traction Machine from dispatch group.',
        'Engage machine room exhaust auxiliary fan override.',
        'Prevent motor restart until core temperature cools below 50.0°C.'
      ]
    });
  } else if (sensors.temperature >= thresholds.temperatureWarning) {
    faults.push({
      id: 'FLT-TMP-01',
      code: 'E-MOT-01',
      name: 'Elevated Motor Operating Temperature',
      severity: 'warning',
      affectedComponent: 'Traction Motor Stator & Machine Room Cooling',
      componentCategory: 'traction_motor',
      sensorResponsible: 'Motor Stator PT100 RTD Sensor',
      triggerValue: `${sensors.temperature.toFixed(1)} °C`,
      thresholdBreached: `Exceeded warning threshold (> ${thresholds.temperatureWarning.toFixed(1)} °C)`,
      detectedAt: now,
      isolationConfidence: 89,
      maintenanceUrgency: 'Schedule Inspection within 24 Hours',
      possibleRootCauses: [
        'Heavy traffic duty cycle exceeding thermal dissipation capacity.',
        'Inadequate machine room ventilation or elevated ambient room temperature.',
        'Early-stage bearing friction or slight brake drag during run cycles.'
      ],
      recommendedActions: [
        'Verify ambient machine room HVAC cooling temperature is maintained below 35°C.',
        'Inspect motor cooling fan impeller and remove dust buildup on heatsink fins.',
        'Audit brake air gap to ensure zero mechanical friction during full travel.'
      ],
      isolationProtocol: [
        'Increase dispatch inter-run dwell timer by 5 seconds to reduce thermal buildup.',
        'Log temperature decay rate to estimate motor thermal time constant.'
      ]
    });
  }

  // 4. Motor Current Evaluation
  const currUnit = thresholds.currentCritical <= 50 ? 'mA' : 'A';
  if (sensors.current > thresholds.currentCritical) {
    faults.push({
      id: 'FLT-CUR-02',
      code: 'E-ELE-02',
      name: 'Motor Overcurrent Spike / Mechanical Jam Risk',
      severity: 'critical',
      affectedComponent: 'Motor Armature Windings & Drive Power Stage',
      componentCategory: 'drive_inverter',
      sensorResponsible: currUnit === 'mA' ? 'INA219 Current Sensor' : 'Hall Effect AC Current Transducer (LEM)',
      triggerValue: `${sensors.current.toFixed(2)} ${currUnit}`,
      thresholdBreached: `Exceeded critical current limit (> ${thresholds.currentCritical.toFixed(2)} ${currUnit})`,
      detectedAt: now,
      isolationConfidence: 95,
      maintenanceUrgency: 'Immediate Shutdown Required',
      possibleRootCauses: [
        'Severe mechanical binding or obstruction in car safety gear or counterweight shoes.',
        'Traction motor brake failing to lift fully (brake shoe dragging on drum/disc).',
        'Short-circuit or ground fault in motor supply feeder cables.',
        'Current sensor calibration drift or damaged inverter transistor module.'
      ],
      recommendedActions: [
        'Cut motor drive torque immediately and set mechanical holding brake.',
        'Manually inspect brake shoe lift clearance with feeler gauge (standard 0.25 - 0.35 mm).',
        'Conduct mechanical free-wheel test in balanced car condition.',
        'Verify phase resistance balance across U-V-W motor terminals.'
      ],
      isolationProtocol: [
        'Trigger VFD electronic overcurrent trip relay (OC-1).',
        'Isolate power converter supply to protect power semiconductor modules.'
      ]
    });
  } else if (sensors.current >= thresholds.currentWarning) {
    faults.push({
      id: 'FLT-CUR-01',
      code: 'E-ELE-01',
      name: 'Elevated Motor Current Consumption',
      severity: 'warning',
      affectedComponent: 'Traction Drive Line / Counterweight Balance',
      componentCategory: 'traction_motor',
      sensorResponsible: currUnit === 'mA' ? 'INA219 Current Sensor' : 'Hall Effect AC Current Transducer',
      triggerValue: `${sensors.current.toFixed(2)} ${currUnit}`,
      thresholdBreached: `Exceeded warning current limit (> ${thresholds.currentWarning.toFixed(2)} ${currUnit})`,
      detectedAt: now,
      isolationConfidence: 86,
      maintenanceUrgency: 'Schedule Inspection within 24 Hours',
      possibleRootCauses: [
        'Elevated friction on elevator car guide rail shoe liners or roller guides.',
        'Counterweight balance miscalibration (improper compensation chains).',
        'Transient overcapacity or uneven car load distribution.'
      ],
      recommendedActions: [
        'Lubricate guide rails and inspect roller guide spring tensions.',
        'Check counterweight fill weight ratio against empty car mass.',
        'Calibrate load weighing transducer beneath car platform.'
      ],
      isolationProtocol: [
        'Compare current draw during UP vs DOWN travel to isolate direction-dependent drag.'
      ]
    });
  }

  // 5. Vibration Evaluation
  const vibUnit = thresholds.vibrationCritical > 25 ? 'events/sec' : 'mm/s';
  const vibLow = thresholds.vibrationLow ?? 45.0;
  if (sensors.vibration > thresholds.vibrationCritical) {
    faults.push({
      id: 'FLT-VIB-02',
      code: 'E-MEC-02',
      name: 'Critical Mechanical Vibration / Bearing Degradation',
      severity: 'critical',
      affectedComponent: 'Drive Machine Bearings & Deflector Sheave',
      componentCategory: 'bearing_gearbox',
      sensorResponsible: vibUnit === 'events/sec' ? 'SW-420 Vibration Sensor' : 'Triaxial Industrial Piezoelectric Accelerometer',
      triggerValue: `${sensors.vibration.toFixed(1)} ${vibUnit}`,
      thresholdBreached: `Exceeded critical vibration limit (> ${thresholds.vibrationCritical.toFixed(1)} ${vibUnit})`,
      detectedAt: now,
      isolationConfidence: 93,
      maintenanceUrgency: 'Immediate Shutdown Required',
      possibleRootCauses: [
        'Severe spalling, raceway pitting, or cage rupture in drive sheave bearing.',
        'Major mechanical misalignment between motor shaft and traction sheave.',
        'Rope fatigue, uneven rope elongation, or damaged traction grooves causing resonance.',
        'Loose structural anchor bolts securing machine bedplate to structural slab.'
      ],
      recommendedActions: [
        'Halt high-speed operation; park elevator at designated service floor.',
        'Perform vibration spectral FFT analysis to confirm bearing defect frequencies (BPFO/BPFI).',
        'Check torque on bedplate mounting bolts and vibration isolator rubber pads.',
        'Inspect drive sheave bearing grease for metallic particle contamination.'
      ],
      isolationProtocol: [
        'Lock out traction machine drive.',
        'Transfer car to manual hoistway inspection mode.'
      ]
    });
  } else if (sensors.vibration >= thresholds.vibrationWarning) {
    faults.push({
      id: 'FLT-VIB-01',
      code: 'E-MEC-01',
      name: 'Elevated Machine Vibration Level',
      severity: 'warning',
      affectedComponent: 'Traction Sheave Bearings & Guide Rail Joints',
      componentCategory: 'bearing_gearbox',
      sensorResponsible: vibUnit === 'events/sec' ? 'SW-420 Vibration Sensor' : 'Triaxial Accelerometer (Machine Bedplate)',
      triggerValue: `${sensors.vibration.toFixed(1)} ${vibUnit}`,
      thresholdBreached: `Exceeded warning vibration limit (> ${thresholds.vibrationWarning.toFixed(1)} ${vibUnit})`,
      detectedAt: now,
      isolationConfidence: 84,
      maintenanceUrgency: 'Schedule Inspection within 24 Hours',
      possibleRootCauses: [
        'Early micro-fretting or grease starvation in machine bearings.',
        'Minor guide rail joint misalignment or dry friction spot in hoistway.',
        'Slight unbalance in drive motor rotor.'
      ],
      recommendedActions: [
        'Replenish synthetic polyurea bearing grease according to manufacturer specification.',
        'Inspect rail joints using precision straightedge and alignment gauge.',
        'Log acceleration RMS trending to assess rate of mechanical wear.'
      ],
      isolationProtocol: [
        'Tag car for automated vibration trend monitoring on subsequent travel cycles.'
      ]
    });
  } else if (sensors.vibration < vibLow && (sensors.speed > 0.1 || sensors.vibration > 0)) {
    faults.push({
      id: 'FLT-VIB-00',
      code: 'E-MEC-00',
      name: 'Insufficient Vibration Telemetry / Below Operating Range',
      severity: 'warning',
      affectedComponent: 'Vibration Transducer Mounting & SW-420 Sensor',
      componentCategory: 'bearing_gearbox',
      sensorResponsible: 'SW-420 Digital Vibration Sensor',
      triggerValue: `${sensors.vibration.toFixed(1)} ${vibUnit}`,
      thresholdBreached: `Below minimum normal operating range (< ${vibLow.toFixed(1)} ${vibUnit})`,
      detectedAt: now,
      isolationConfidence: 80,
      maintenanceUrgency: 'Inspect sensor mounting and wiring',
      possibleRootCauses: [
        'Vibration sensor detached or loose mounting on test frame.',
        'Sensitivity potentiometer on SW-420 misadjusted.',
        'Signal wire loose or discontinuous digital pulse train.'
      ],
      recommendedActions: [
        'Check sensor bracket mechanical fastening to elevator rig.',
        'Calibrate SW-420 digital comparator sensitivity threshold.'
      ],
      isolationProtocol: [
        'Tag vibration telemetry channel for inspection.'
      ]
    });
  }

  // 6. Compound Multi-Sensor Fault Isolation
  const hasHighTemp = sensors.temperature >= thresholds.temperatureWarning;
  const hasHighCurrent = sensors.current >= thresholds.currentWarning;
  const hasHighVib = sensors.vibration >= thresholds.vibrationWarning;

  // Case A: High Temp + High Current -> Stator Insulation / Rotor Drag
  if (hasHighTemp && hasHighCurrent) {
    faults.push({
      id: 'FLT-CMP-01',
      code: 'E-SYS-01',
      name: 'Compound Electro-Thermal Stator Stress',
      severity: sensors.temperature >= thresholds.temperatureCritical || sensors.current > thresholds.currentCritical ? 'critical' : 'warning',
      affectedComponent: 'Motor Armature & Power Inverter Stage',
      componentCategory: 'traction_motor',
      sensorResponsible: 'Correlated: PT100 RTD + LEM Current Sensor',
      triggerValue: `Temp: ${sensors.temperature.toFixed(1)}°C, Current: ${sensors.current.toFixed(2)}A`,
      thresholdBreached: 'Dual Warning/Critical breach in Thermal and Electrical domains',
      detectedAt: now,
      isolationConfidence: 97,
      maintenanceUrgency: sensors.temperature >= thresholds.temperatureCritical ? 'Immediate Shutdown Required' : 'Schedule Inspection within 24 Hours',
      possibleRootCauses: [
        'Stator winding inter-turn insulation degradation creating local eddy current loops.',
        'Persistent mechanical dragging in brake assembly holding friction during run.',
        'VFD pulse-width modulation carrier frequency harmonics inducing excessive iron losses.'
      ],
      recommendedActions: [
        'Perform motor winding surge test and phase inductance balance test.',
        'Verify mechanical brake shoe completely clears the drum/disc with 0.3mm feeler gauge.',
        'Audit VFD switching frequency settings and output choke filtering.'
      ],
      isolationProtocol: [
        'Isolate from multi-car group dispatching.',
        'Run thermal cooldown diagnostic cycle.'
      ]
    });
  }

  // Case B: High Vibration + High Temp -> Bearing Seizure Risk
  if (hasHighVib && hasHighTemp) {
    faults.push({
      id: 'FLT-CMP-02',
      code: 'E-SYS-02',
      name: 'Mechanical Bearing Frictional Overheating',
      severity: 'critical',
      affectedComponent: 'Drive Sheave Main Spherical Roller Bearing',
      componentCategory: 'bearing_gearbox',
      sensorResponsible: 'Correlated: Accelerometer + PT100 RTD',
      triggerValue: `Vib: ${sensors.vibration.toFixed(2)} mm/s, Temp: ${sensors.temperature.toFixed(1)}°C`,
      thresholdBreached: 'Simultaneous mechanical vibration and thermal threshold escalation',
      detectedAt: now,
      isolationConfidence: 99,
      maintenanceUrgency: 'Immediate Shutdown Required',
      possibleRootCauses: [
        'Imminent bearing seizure: severe grease degradation, metal-to-metal raceway contact.',
        'Loss of internal radial bearing clearance due to improper fit or thermal expansion.',
        'Fractured ball or roller element inside main machine bearing cartridge.'
      ],
      recommendedActions: [
        'Immediately cease passenger service and engage physical machine lock.',
        'Sample bearing lubricant for ferrographic wear debris analysis.',
        'Prepare replacement bearing cartridge and hydraulic puller tools for immediate overhaul.'
      ],
      isolationProtocol: [
        'Lock Out / Tag Out (LOTO) traction machine drive power.',
        'Isolate hoistway and display "Out of Service for Maintenance" at landing halls.'
      ]
    });
  }

  // Case C: High Current + High Vibration -> Mechanical Binding / Pinion Jam Risk
  if (hasHighCurrent && hasHighVib) {
    faults.push({
      id: 'FLT-CMP-03',
      code: 'E-SYS-03',
      name: 'High Friction Electro-Mechanical Drag',
      severity: sensors.current > thresholds.currentCritical || sensors.vibration > thresholds.vibrationCritical ? 'critical' : 'warning',
      affectedComponent: 'Guide Shoes, Safety Gear & Traction Sheave',
      componentCategory: 'guide_rail_counterweight',
      sensorResponsible: 'Correlated: LEM Current Sensor + Accelerometer',
      triggerValue: `Current: ${sensors.current.toFixed(2)}A, Vib: ${sensors.vibration.toFixed(2)} mm/s`,
      thresholdBreached: 'Simultaneous motor current draw surge and mechanical vibration spike',
      detectedAt: now,
      isolationConfidence: 95,
      maintenanceUrgency: sensors.current >= thresholds.currentCritical || sensors.vibration >= thresholds.vibrationCritical ? 'Immediate Shutdown Required' : 'Schedule Inspection within 24 Hours',
      possibleRootCauses: [
        'Mechanical binding between car roller guide shoes and misaligned hoistway guide rails.',
        'Car safety gear wedge partially dragging along rail blade.',
        'Unbalanced counterweight compensation chain binding at pit bottom.'
      ],
      recommendedActions: [
        'Inspect guide shoe rollers and spring tension adjustments on car and counterweight frame.',
        'Verify guide rail plumbness, joint alignment, and surface rail lubrication.',
        'Examine safety gear linkages for proper free release travel clearance.'
      ],
      isolationProtocol: [
        'Execute slow-speed test run in inspection mode.',
        'Monitor instantaneous motor torque output across each hoistway zone.'
      ]
    });
  }

  // Prioritize Critical faults first, then Warnings, then by ID
  faults.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (a.severity !== 'critical' && b.severity === 'critical') return 1;
    return b.isolationConfidence - a.isolationConfidence;
  });

  // Calculate Overall System Status
  let status: SystemStatus = 'normal';
  if (faults.some(f => f.severity === 'critical')) {
    status = 'critical';
  } else if (faults.length > 0) {
    status = 'warning';
  }

  // Calculate Motor Health Metrics
  const motorHealth = calculateMotorHealth(sensors, thresholds, status);

  return { status, faults, motorHealth };
}

/**
 * Calculates synthetic health indices based on physical stress models
 */
function calculateMotorHealth(
  sensors: SensorData,
  thresholds: SensorThresholds,
  systemStatus: SystemStatus
): MotorHealthMetrics {
  // Thermal stress score (0-100, where 100 is pristine, 0 is failed)
  const tempRatio = Math.max(0, (sensors.temperature - 20) / (thresholds.temperatureCritical - 20));
  const thermalScore = Math.max(0, Math.min(100, Math.round(100 - tempRatio * 90)));

  // Electrical stress score
  const currentRatio = Math.max(0, sensors.current / thresholds.currentCritical);
  const electricalScore = Math.max(0, Math.min(100, Math.round(100 - currentRatio * 85)));

  // Mechanical vibration score
  const vibRatio = Math.max(0, sensors.vibration / thresholds.vibrationCritical);
  const mechanicalScore = Math.max(0, Math.min(100, Math.round(100 - vibRatio * 95)));

  // Weighted overall motor health score
  const overall = Math.max(
    0,
    Math.min(100, Math.round(thermalScore * 0.35 + electricalScore * 0.35 + mechanicalScore * 0.30))
  );

  return {
    overallHealthScore: overall,
    thermalStressScore: thermalScore,
    electricalStressScore: electricalScore,
    mechanicalVibrationScore: mechanicalScore,
    status: systemStatus
  };
}
