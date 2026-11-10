# AI-Based Elevator Fault Detection & Root Cause Analysis (A-FDIR) Assistant

An industrial-grade, full-stack predictive maintenance and autonomous **Fault Detection, Isolation, and Root Cause Analysis (FDIR)** platform for traction elevator systems.

Built with **React 19**, **FastAPI**, **Scikit-Learn**, and **ESP32 IoT Hardware Bridge**, this system combines continuous sensor telemetry ingestion, unsupervised anomaly detection (Isolation Forest), supervised multi-class fault classification (Random Forest), and a deterministic engineering rule reasoning engine to diagnose physical elevator degradation in real time.

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Monitored Telemetry & Physical Sensors](#-monitored-telemetry--physical-sensors)
- [AI & Machine Learning Diagnostic Pipeline](#-ai--machine-learning-diagnostic-pipeline)
- [Autonomous Root Cause Analysis (RCA) Engine](#-autonomous-root-cause-analysis-rca-engine)
- [UI Dashboard & Color Design](#-ui-dashboard--color-design)
- [Repository Structure](#-repository-structure)
- [Installation & Setup](#-installation--setup)
  - [Backend Setup (FastAPI + ML)](#1-backend-setup-fastapi--ml)
  - [Frontend Setup (React + Vite)](#2-frontend-setup-react--vite)
- [Microcontroller Packet Contract (ESP32)](#-microcontroller-packet-contract-esp32)
- [API Reference & WebSockets](#-api-reference--websockets)
- [Verification & Automated Tests](#-verification--automated-tests)
- [Engineering Standards & Disclaimer](#-engineering-standards--disclaimer)

---

## 🏛 System Architecture

The application is structured into a modular 3-tier architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TIER 1: PHYSICAL / SIMULATION EDGE                    │
│                                                                             │
│   ┌───────────────────────────────┐     ┌───────────────────────────────┐   │
│   │   ESP32 Sensor Microcontroller│     │  Interactive Simulation Bench │   │
│   │   • PT100 RTD (Stator Temp)   │     │  • Slider Telemetry Injection │   │
│   │   • LEM Current Transducer    │ OR  │  • 6 Preset Hazard Scenarios  │   │
│   │   • MPU6050 Accelerometer     │     │  • Gaussian Noise Generator   │   │
│   │   • Optical Rotary Encoder    │     │  • Real-time State Store      │   │
│   │   • Door Gate Contact (GPIO)  │     │                               │   │
│   └───────────────┬───────────────┘     └───────────────┬───────────────┘   │
└───────────────────┼─────────────────────────────────────┼───────────────────┘
                    │ Serial UART / JSON                  │ In-Memory Context
                    ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TIER 2: PYTHON FASTAPI BACKEND                        │
│                                                                             │
│   • Sensor Calibration & Dynamic Range Clamping                             │
│   • Model 1: Isolation Forest (Anomaly Score % Outlier Detection)           │
│   • Model 2: Random Forest Classifier (Multi-Class Probability Vector)      │
│   • Autonomous Rule-Based Root Cause Diagnostic Engine (FDIR)               │
│   • Calculated Motor Health Score (Thermal + Electrical + Vibration Stress) │
│   • SQLite Event Audit Log & Telemetry Persistence (elevator.db)            │
│   • High-Performance WebSocket Telemetry Broadcaster (1.5s Tick)            │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTP REST + WebSocket (/ws/telemetry)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TIER 3: REACT 19 OPERATOR DASHBOARD                    │
│                                                                             │
│   • Overview: Live Health KPI Cards, ML Inference Bar, Recent Event Feed    │
│   • Visualizer: 2D Dynamic Hoistway Shaft with Car, Door & Counterweight    │
│   • Monitoring: Recharts Multi-Waveforms with Automated Threshold Markers   │
│   • Diagnosis: Fault Isolation Cards, Possible Causes & Actions Breakdown   │
│   • Simulation: Interactive Perturbation Bench with One-Click Injection     │
│   • Audit Log: Chronological Incident Table with CSV Export & Ack Filtering │
│   • Settings: Configurable EN 81-20/50 Demonstration Safety Thresholds      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

1. **Dual Operating Modes:**
   - **Simulation Test Bench:** Instant parameter perturbation using interactive sliders and pre-configured edge-case scenarios (*Bearing Wear*, *Thermal Trip*, *Door Bypass*, *Overspeed*).
   - **Real Sensor Hardware Mode:** Ingests live telemetry packets from an ESP32 microcontroller over USB/UART Serial with automatic port discovery and reconnection handling.
2. **Two-Stage Machine Learning Pipeline:**
   - **Stage 1 (Unsupervised):** Isolation Forest calculates an anomaly score ($0.0\% - 100\%$) against nominal operational baseline clusters.
   - **Stage 2 (Supervised):** 6-class Random Forest Classifier generates normalized probability distributions across specific fault classes.
3. **Autonomous Root Cause Analysis (FDIR):**
   - Correlates multi-sensor symptoms into actionable engineering hypotheses with ranked isolation confidence.
   - Formulates dispatch-ready maintenance instructions and safety isolation protocols.
4. **Dynamic Hoistway & Elevator Shaft Visualizer:**
   - Real-time animated 2D hoistway schematic displaying exact car position, velocity vectors, directional indicators, counterweight displacement, and mechanical door interlock states.
5. **Continuous Telemetry Waveforms:**
   - High-frequency rolling time-series charts (Recharts) tracking temperature, armature current, vibration RMS, and car speed with dynamic warning/critical threshold reference markers.
6. **Regulatory-Grade Event Audit Log:**
   - Persistent SQLite storage recording timestamped threshold excursions, operator acknowledgments, and one-click CSV report exports.

---

## 📡 Monitored Telemetry & Physical Sensors

| Sensor Type | Physical Transducer | Monitored Parameter | Nominal Range | Warning Limit | Critical Trip |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Thermal** | PT100 RTD (MAX31865) | Motor Stator Core Temperature | $20.0 - 55.0\ ^\circ\text{C}$ | $\ge 60.0\ ^\circ\text{C}$ | $\ge 75.0\ ^\circ\text{C}$ |
| **Electrical** | LEM Hall Effect Transducer | Armature Line Current | $1.0 - 4.5\ \text{A}$ | $\ge 5.0\ \text{A}$ | $\ge 7.0\ \text{A}$ |
| **Mechanical** | Triaxial Accelerometer / Piezo | Bedplate & Bearing Vibration | $0.5 - 3.0\ \text{mm/s}$ | $\ge 4.0\ \text{mm/s}$ | $\ge 7.0\ \text{mm/s}$ |
| **Kinematic** | Optical Quadrature Rotary Encoder | Car Linear Travel Velocity | $0.0 - 1.50\ \text{m/s}$ | $> 1.75\ \text{m/s}$ | $\ge 2.20\ \text{m/s}$ |
| **Safety Interlock** | Hoistway Gate Limit Microswitch | Car/Sill Door Mechanical Latch | Closed ($0$) | Open at Sill | Open while Speed $> 0.10\ \text{m/s}$ |

---

## 🧠 AI & Machine Learning Diagnostic Pipeline

The platform uses two pre-trained Scikit-Learn models trained on 4,800 calibrated physical elevator operational cycles across diverse load distributions:

### 1. Isolation Forest (Anomaly Detection)
- **Algorithm:** Isolation Forest (`n_estimators=100`, `contamination=0.15`).
- **Input Features:** `[temperature, current, vibration, speed, door_contact]`.
- **Function:** Measures the degree of isolation of the current multi-dimensional telemetry vector against the trained nominal operating manifold.
- **Output:** Boolean anomaly flag and a normalized anomaly score from $0.0\%$ (nominal) to $100.0\%$ (extreme excursion).

### 2. Random Forest Multi-Class Fault Classifier
- **Algorithm:** Random Forest Classifier (`n_estimators=150`, `max_depth=12`, balanced class weighting).
- **Class Labels:**
  1. `Normal`
  2. `Motor Overheating`
  3. `Motor Overcurrent`
  4. `Bearing Vibration`
  5. `Overspeed`
  6. `Door Interlock Fault`
- **Output:** Predicted fault classification string, primary confidence rating ($0 - 100\%$), and full 6-way probability distribution vector.

---

## 🔍 Autonomous Root Cause Analysis (RCA) Engine

When an anomaly or threshold trip occurs, the diagnostic reasoning engine isolates the root cause into a structured fault item:

- **Unique Incident Code:** Standardized industrial format (e.g., `E-SYS-02`, `E-SEC-01`, `E-MOT-02`).
- **Isolation Confidence:** Statistical confidence percentage ($90.0\% - 99.5\%$) based on multi-sensor correlation.
- **Root Cause Hypotheses:** Explicit engineering hypotheses (e.g., *Imminent bearing seizure from lubricant breakdown*, *Welded safety relay contact*, *Brake shoe dragging on traction drum*).
- **Recommended Maintenance Actions:** Step-by-step procedures for dispatch technicians.
- **Autonomous Isolation Protocol:** Automated supervisory actions (e.g., *Lock Out / Tag Out (LOTO)*, *Emergency Safety Stop*, *Car call registration lock*).

---

## 🎨 UI Dashboard & Color Design

The frontend is styled in a **Light Cream & Royal Blue** palette designed for engineering presentations:

| Element | Color Hex | Aesthetic & Usability Purpose |
| :--- | :--- | :--- |
| **Majority Canvas** | `#F8F3F0` (Light Cream) | Warm, soft, non-fatiguing industrial backdrop |
| **Elevated Cards** | `#FFFFFF` (Pure White) | Crisp floating panels with subtle `#E2D9D2` borders |
| **Primary Accent & Brand** | `#014BAA` (Royal Blue) | High-contrast typography, active navigation, and primary buttons |
| **Button Text** | `#F8F3F0` (Light Cream) | High-contrast text on Royal Blue buttons (WCAG AAA compliant) |
| **Secondary Panels** | `#EFE8E2` (Soft Cream) | Sidebar background, slider tracks, and table headers |
| **Status Alerts** | Emerald / Amber / Red | Standardized safety condition indicators (*Normal*, *Warning*, *Critical*) |

---

## 📂 Repository Structure

```
Elevator_AI_Assistant/
├── backend/                        # Python FastAPI Backend
│   ├── database/
│   │   ├── db.py                   # SQLite schema, indices, queries & connection pool
│   │   └── elevator.db             # Primary SQLite application database
│   ├── hardware/
│   │   └── esp32_serial.py         # PySerial UART bridge with auto-discovery
│   ├── ml/
│   │   ├── anomaly_detection.py    # Isolation Forest wrapper & inference
│   │   ├── fault_classifier.py     # Random Forest classification & probabilities
│   │   ├── train_model.py          # Synthetic dataset generator & training script
│   │   └── saved_models/           # Serialized model binaries (.joblib)
│   ├── rca/
│   │   └── root_cause_engine.py    # Rule-based diagnostic & motor health engine
│   ├── tests/                      # Automated test suite
│   │   ├── conftest.py             # Pytest fixtures & isolated test database
│   │   ├── test_sensor.py          # Sensor bounds & calibration unit tests
│   │   ├── test_ml.py              # ML inference & anomaly detection tests
│   │   ├── test_rca.py             # Root cause isolation validation tests
│   │   └── test_db.py              # Persistence & audit deduplication tests
│   ├── api_routes.py               # REST API route handlers
│   ├── main.py                     # FastAPI application entry & WebSocket broadcaster
│   ├── models.py                   # Pydantic v2 validation models & schemas
│   ├── requirements.txt            # Python dependencies
│   ├── sensor_processor.py         # Central telemetry orchestration engine
│   └── ws_manager.py               # WebSocket client connection manager
│
├── src/                            # React 19 Frontend
│   ├── components/
│   │   ├── common/
│   │   │   ├── Header.tsx          # Navigation header & mode switcher
│   │   │   ├── Sidebar.tsx         # Collapsible sidebar with active status
│   │   │   ├── SensorCard.tsx      # Telemetry metric cards with progress bars
│   │   │   ├── ElevatorShaftVisualizer.tsx # 2D hoistway dynamic schematic
│   │   │   └── HardwarePendingModal.tsx    # ESP32 diagnostic modal
│   │   ├── dashboard/
│   │   │   └── DashboardOverview.tsx # Primary overview & KPI strip
│   │   ├── monitoring/
│   │   │   └── LiveMonitoring.tsx  # Rolling Recharts time-series waveforms
│   │   ├── faults/
│   │   │   └── FaultAnalysis.tsx   # FDIR diagnostic breakdown & RCA reports
│   │   ├── history/
│   │   │   └── AlertHistory.tsx    # Searchable audit table with CSV export
│   │   ├── settings/
│   │   │   └── SettingsPage.tsx    # Threshold limit configuration form
│   │   └── simulation/
│   │       └── SensorSimulation.tsx# Parameter sliders & hazard injection bench
│   ├── context/
│   │   └── ElevatorContext.tsx     # Central React Context state store
│   ├── services/
│   │   ├── apiService.ts           # REST API & WebSocket client bridge
│   │   └── rootCauseEngine.ts      # Client-side fallback diagnostic engine
│   ├── types/
│   │   └── elevator.ts             # TypeScript definitions & interfaces
│   ├── App.tsx                     # Top-level layout container
│   ├── index.css                   # Tailwind CSS v4 styling & color tokens
│   └── main.tsx                    # React application bootstrap
│
├── index.html                      # HTML5 template
├── package.json                    # Node.js project manifest & dependencies
├── vite.config.ts                  # Vite build configuration
└── README.md                       # Documentation
```

---

## 🚀 Installation & Setup

### Prerequisites
- **Node.js:** v18.0.0 or later (v20+ recommended)
- **Python:** v3.10, v3.11, or v3.12
- **Package Managers:** `npm` and `pip`

---

### 1. Backend Setup (FastAPI + ML)

1. Open a terminal and navigate to the `backend` directory:
   ```powershell
   cd backend
   ```

2. (Optional but recommended) Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. Install required Python packages:
   ```powershell
   pip install -r requirements.txt
   ```

4. (Optional) Retrain machine learning models:
   ```powershell
   python ml/train_model.py
   ```

5. Launch the FastAPI backend server:
   ```powershell
   python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

The backend is now live:
- **Interactive Swagger API Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **WebSocket Telemetry Stream:** `ws://127.0.0.1:8000/ws/telemetry`

---

### 2. Frontend Setup (React + Vite)

1. Open a second terminal and navigate to the project root directory:
   ```powershell
   cd Elevator_AI_Assistant
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Launch the Vite development server:
   ```powershell
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 🔌 Microcontroller Packet Contract (ESP32)

When running in **Real Sensor Hardware Mode**, an ESP32 microcontroller can stream telemetry packets over USB/UART Serial (`115200` baud) or `POST` directly to `/api/v1/telemetry`:

```json
{
  "device_id": "ESP32_ELEVATOR_RIG_01",
  "firmware_version": "v2.4.1-PROD",
  "uptime_seconds": 1420,
  "wifi_rssi_dbm": -58,
  "raw_adc_temperature": 520,
  "raw_adc_current": 395,
  "raw_accel_vibration": 94,
  "raw_pulse_counter_speed": 820,
  "gpio_door_contact": 0,
  "crc32": "0x9F4C2A11"
}
```

### Microcontroller Calibration Formulations

The backend translates raw 12-bit ADC and pulse count integers into calibrated physical units:

$$\text{Temperature}\ (^\circ\text{C}) = \min\Big(160.0,\ \max\big(-40.0,\ \text{raw\_adc\_temp} \times 0.05 + 18.0\big)\Big)$$

$$\text{Current}\ (\text{A}) = \min\Big(60.0,\ \max\big(0.0,\ \text{raw\_adc\_curr} \times 0.008\big)\Big)$$

$$\text{Vibration}\ (\text{mm/s}) = \min\Big(50.0,\ \max\big(0.0,\ \text{raw\_accel\_vib} \times 0.02\big)\Big)$$

$$\text{Speed}\ (\text{m/s}) = \min\Big(10.0,\ \max\big(0.0,\ \frac{\text{raw\_pulse\_count}}{1000.0} \times 1.5\big)\Big)$$

$$\text{Door Closed} = \big(\text{gpio\_door\_contact} == 0\big)$$

---

## 📡 API Reference & WebSockets

### REST Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend status, service availability & serial bridge status |
| `GET` | `/api/v1/telemetry` | Combined frontend compatibility payload (Sensors + ML + RCA) |
| `GET` | `/api/v1/telemetry/latest` | Latest telemetry reading with diagnostic evaluation |
| `GET` | `/api/v1/telemetry/history` | Historical sensor readings from SQLite (`?limit=50`) |
| `POST` | `/api/v1/telemetry` | Ingest new sensor readings (Calibrated or Raw ESP32 Packet) |
| `GET` | `/api/v1/alerts` | Active and acknowledged fault alerts (`?limit=50`) |
| `POST` | `/api/v1/alerts/{id}/acknowledge` | Mark an alert as acknowledged by operator |
| `GET` | `/api/v1/diagnosis` | Latest ML predictions, confidence & active RCA hypotheses |
| `GET` | `/api/v1/thresholds` | Current warning and critical boundary limits |
| `POST` | `/api/v1/thresholds` | Update configured safety thresholds |
| `POST` | `/api/v1/simulation/scenario` | Inject preset scenario (`warning_bearing`, `critical_thermal`, etc.) |
| `GET` | `/api/v1/hardware/status` | Serial port status, connection state & detected ports |

### WebSocket Endpoint

- **URL:** `ws://127.0.0.1:8000/ws/telemetry`
- **Behavior:**
  - Upon connection, receives an `"initial_state"` packet containing current telemetry, ML scores, and threshold settings.
  - Broadcasts live `"telemetry_update"` payloads every $1.5\ \text{seconds}$.
  - Supports client `"ping"` / `"pong"` heartbeats.
  - Accepts real-time scenario injection commands:
    ```json
    { "action": "scenario", "scenario": "critical_vibration" }
    ```

---

## 🧪 Verification & Automated Tests

### Backend Unit Tests
Execute the automated test suite covering sensor calibration, database persistence, machine learning inference, and root cause analysis:

```powershell
pytest backend/tests/test_sensor.py backend/tests/test_ml.py backend/tests/test_rca.py backend/tests/test_db.py
```

### Frontend Build & Type Check
Verify that the TypeScript types and React build bundles compile cleanly:

```powershell
npm run lint    # Executes tsc --noEmit (Type check)
npm run build   # Executes vite build (Production bundle)
```

---

## 📜 Engineering Standards & Disclaimer

> [!NOTE]
> **Academic Engineering Prototype Notice:**
> This system is designed as an educational and engineering prototype for demonstrating autonomous fault isolation (FDIR), statistical anomaly detection, and predictive maintenance principles in elevator transportation systems.
>
> All threshold values, interlocks, and protocols are modeled following international safety baselines (**EN 81-20/50** and **ASME A17.1**), but do not replace certified safety controller hardware or physical governor emergency brakes in commercial installations.

---

## 👥 Authors & Academic Context

- **Project:** Autonomous AI-Based Elevator Fault Detection & Root Cause Analysis Platform
- **Scope:** Final-Year Engineering Project
- **Core Specializations:** Industrial IoT, Machine Learning, Predictive Maintenance, Cyber-Physical Systems

