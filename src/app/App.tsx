import { useState, useEffect, useRef, type ReactNode } from "react";
import logoSvg from "@/imports/Untitled-1.svg?url";
import mapImg from "@/imports/Map_with_ground_stations_satellite_image.png";

// ─── Projection ───────────────────────────────────────────────────────────────

const W = 900, H = 480;
const INCL_RAD = 97.516 * Math.PI / 180; // SSO — Sun-Synchronous Orbit
const EARTH_R = 6371;
const SAT_ALT_KM = 530;
const EL_MIN_DEG = 5;

// Exact formula from Python script: sin(eta)=R_E*cos(el)/(R_E+h), rho=90-el-eta
const _el = EL_MIN_DEG * Math.PI / 180;
const _eta = Math.asin(EARTH_R * Math.cos(_el) / (EARTH_R + SAT_ALT_KM));
const RHO_RAD = Math.PI / 2 - _el - _eta; // Earth central angle (half-cone)
const MAX_RANGE_KM = RHO_RAD * EARTH_R;   // ~2019 km for 530 km alt, 5° el

function project(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

// Orbital period for a=6908.137 km: T = 2π√(a³/μ) = 5714.7 s = 95.25 min
// Earth sidereal rotation rate: 360° / 86164 s
// Earth rotation per orbit: 5714.7 / 86164 * 360 = 23.87°
const EARTH_ROT_PER_ORBIT_DEG = (5714.7 / 86164) * 360; // 23.87°

function trackPoint(t: number, raanDeg: number, inclDeg = E1_INCL) {
  const inclRad = inclDeg * Math.PI / 180;
  const theta = t * 2 * Math.PI;
  const lat = Math.asin(Math.sin(inclRad) * Math.sin(theta)) * 180 / Math.PI;
  const lonOff = Math.atan2(Math.cos(inclRad) * Math.sin(theta), Math.cos(theta)) * 180 / Math.PI;
  const earthRot = t * EARTH_ROT_PER_ORBIT_DEG;
  const lon = ((raanDeg + lonOff - earthRot + 540) % 360) - 180;
  return { lat, lon };
}

function gcDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeTrackSegments(raanDeg: number, startT = 0, inclDeg = E1_INCL) {
  const N = 500;
  const segments: string[] = [];
  let current: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const { lat, lon } = trackPoint(startT + i / N, raanDeg, inclDeg);
    const [x, y] = project(lat, lon);
    if (current.length > 0 && Math.abs(x - current[current.length - 1][0]) > W * 0.5) {
      if (current.length > 1) segments.push(current.map(p => p.join(",")).join(" "));
      current = [];
    }
    current.push([x, y]);
  }
  if (current.length > 1) segments.push(current.map(p => p.join(",")).join(" "));
  return segments;
}

// Geodetic visibility circle matching Python visibility_circle() exactly
function visibilityCircleSegments(lat0_deg: number, lon0_deg: number): string[] {
  const lat0 = lat0_deg * Math.PI / 180;
  const lon0 = lon0_deg * Math.PI / 180;
  const segs: string[] = [];
  let cur: [number, number][] = [];
  let prevX = -9999;
  for (let i = 0; i <= 360; i++) {
    const b = (i / 360) * 2 * Math.PI;
    const lat = Math.asin(Math.sin(lat0) * Math.cos(RHO_RAD) + Math.cos(lat0) * Math.sin(RHO_RAD) * Math.cos(b));
    const lon = lon0 + Math.atan2(Math.sin(b) * Math.sin(RHO_RAD) * Math.cos(lat0), Math.cos(RHO_RAD) - Math.sin(lat0) * Math.sin(lat));
    const latD = lat * 180 / Math.PI;
    const lonD = ((lon * 180 / Math.PI) + 180) % 360 - 180;
    const [x, y] = project(latD, lonD);
    if (Math.abs(x - prevX) > W * 0.5 && cur.length > 1) {
      segs.push(cur.map(p => p.join(",")).join(" "));
      cur = [];
    }
    cur.push([x, y]);
    prevX = x;
  }
  if (cur.length > 1) segs.push(cur.map(p => p.join(",")).join(" "));
  return segs;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

// Earendil 1 — in orbit
const E1_RAAN   = 272.1844;
const E1_INCL   = 97.516;
const E1_ALT_KM = 530;
const E1_INIT_T = 219.4775 / 360;

const E2_INCL   = 88.0;
const E2_ALT_KM = 500;
const E2_RAAN   = 92.0;   // different plane from E1
const E2_INIT_T = 0.35;

const SAT_CONFIG = [
  { id: "001", name: "Earendil 1", raan: E1_RAAN, initT: E1_INIT_T, incl: E1_INCL, altKm: E1_ALT_KM, color: "#00D4FF", label: "cyan",  launched: true },
  { id: "002", name: "Earendil 2", raan: E2_RAAN, initT: E2_INIT_T, incl: E2_INCL, altKm: E2_ALT_KM, color: "#FF6B1A", label: "amber", launched: true },
];

const ILLUMINATION_KM = 2.5; // 5 km diameter service spot


// Exact coordinates from plot-mc-ground-tracks.py
// sband: true = has S-band antenna → draw visibility circle (530 km alt, 5° el)
const GROUND_STATIONS_RAW = [
  { id: "GS-01", name: "Awarua",       lat: -46.50, lon:  168.35, active: true,  sband: true  },
  { id: "GS-02", name: "Punta Arenas", lat: -52.94, lon:  -70.87, active: true,  sband: true  },
  { id: "GS-03", name: "Blondous",     lat:  65.65, lon:  -20.25, active: true,  sband: true  },
  { id: "GS-04", name: "Pretoria",     lat: -25.86, lon:   28.45, active: true,  sband: true  },
  { id: "GS-05", name: "Deadhorse",    lat:  70.21, lon: -148.41, active: true,  sband: false },
  { id: "GS-06", name: "Pitea",        lat:  65.34, lon:   21.43, active: true,  sband: true  },
  { id: "GS-07", name: "Absheron",     lat:  40.47, lon:   49.49, active: true,  sband: true  },
  { id: "GS-08", name: "Kandy",        lat:   7.27, lon:   80.72, active: true,  sband: true  },
  { id: "GS-09", name: "Nangetty",     lat: -29.01, lon:  115.34, active: true,  sband: true  },
  { id: "GS-10", name: "Umea",         lat:  63.83, lon:   20.26, active: true,  sband: false },
  { id: "GS-11", name: "Fairbanks",    lat:  64.82, lon: -147.72, active: true,  sband: true  },
  { id: "GS-12", name: "Torrance",     lat:  33.81, lon: -118.35, active: true,  sband: true  },
];

// Pre-compute geodetic visibility circle segments for each S-band station
const GROUND_STATIONS = GROUND_STATIONS_RAW.map(gs => ({
  ...gs,
  circles: gs.sband ? visibilityCircleSegments(gs.lat, gs.lon) : [] as string[],
}));

// Countries where service is restricted
const RESTRICTED_ZONES = [
  { name: "Russia",      latMin:  41, latMax:  82, lonMin:  27, lonMax: 190 },
  { name: "China",       latMin:  18, latMax:  53, lonMin:  73, lonMax: 135 },
  { name: "North Korea", latMin:  37, latMax:  43, lonMin: 124, lonMax: 130 },
  { name: "Iran",        latMin:  25, latMax:  40, lonMin:  44, lonMax:  64 },
];

function isRestricted(lat: number, lon: number): boolean {
  return RESTRICTED_ZONES.some(z =>
    lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax
  );
}

type ServiceRequest = { id: string; customer: string; lat: number; lon: number; region: string; type: string; priority: string; status: string; window: string; flux: string; areakm2: string; };

const CUSTOMER_POOL: ServiceRequest[] = [
  { id: "SVC-0001", customer: "Tromsø Greenhouse Co.",       lat:  69.65, lon:  18.95, region: "Tromsø, Norway",            type: "Greenhouse Cultivation",  priority: "HIGH",   status: "SCHEDULED", window: "22:00–04:00 UTC", flux: "80 W/m²",  areakm2: "120"   },
  { id: "SVC-0002", customer: "Svalbard Seed Vault",         lat:  78.24, lon:  15.49, region: "Svalbard, Norway",          type: "Polar Agriculture",       priority: "LOW",    status: "SCHEDULED", window: "00:00–06:00 UTC", flux: "40 W/m²",  areakm2: "4800"  },
  { id: "SVC-0003", customer: "Reykjavik Energy",            lat:  64.13, lon: -21.82, region: "Reykjavik, Iceland",        type: "Solar Charging Ext.",     priority: "MEDIUM", status: "SCHEDULED", window: "20:00–02:00 UTC", flux: "90 W/m²",  areakm2: "600"   },
  { id: "SVC-0004", customer: "Port of Rotterdam",           lat:  51.90, lon:   4.48, region: "Rotterdam, Netherlands",    type: "Port Night Operations",   priority: "HIGH",   status: "SCHEDULED", window: "20:00–00:00 UTC", flux: "110 W/m²", areakm2: "105"   },
  { id: "SVC-0005", customer: "Scottish Highland Farms",     lat:  57.50, lon:  -4.20, region: "Highlands, Scotland",       type: "Agricultural Extension",  priority: "MEDIUM", status: "SCHEDULED", window: "21:00–03:00 UTC", flux: "65 W/m²",  areakm2: "1800"  },
  { id: "SVC-0006", customer: "Churchill Mining Corp.",      lat:  58.77, lon: -94.17, region: "Churchill, Canada",         type: "Open-Pit Mining",         priority: "HIGH",   status: "SCHEDULED", window: "01:00–07:00 UTC", flux: "140 W/m²", areakm2: "450"   },
  { id: "SVC-0007", customer: "Atacama Lithium Partners",   lat: -23.50, lon: -68.00, region: "Atacama Desert, Chile",     type: "Mining Operations",       priority: "HIGH",   status: "SCHEDULED", window: "00:00–06:00 UTC", flux: "160 W/m²", areakm2: "900"   },
  { id: "SVC-0008", customer: "Salt River Project",          lat:  33.45, lon:-112.07, region: "Phoenix, AZ, USA",          type: "Agricultural Extension",  priority: "MEDIUM", status: "SCHEDULED", window: "02:00–06:00 UTC", flux: "95 W/m²",  areakm2: "3100"  },
  { id: "SVC-0009", customer: "Bogotá Flower Farms",         lat:   4.71, lon: -74.07, region: "Bogotá, Colombia",          type: "Floriculture Extension",  priority: "MEDIUM", status: "SCHEDULED", window: "01:00–05:00 UTC", flux: "75 W/m²",  areakm2: "280"   },
  { id: "SVC-0010", customer: "Manitoba Canola Co-op",       lat:  50.00, lon: -97.00, region: "Manitoba, Canada",          type: "Agricultural Extension",  priority: "MEDIUM", status: "SCHEDULED", window: "02:00–06:00 UTC", flux: "80 W/m²",  areakm2: "4200"  },
  { id: "SVC-0011", customer: "UN Emergency Relief",         lat:   4.30, lon:  42.10, region: "Horn of Africa",            type: "Emergency Lighting",      priority: "CRIT",   status: "SCHEDULED", window: "18:00–06:00 UTC", flux: "60 W/m²",  areakm2: "1200"  },
  { id: "SVC-0012", customer: "Cape Winelands Co-op",        lat: -33.93, lon:  18.86, region: "Cape Town, S. Africa",      type: "Viticulture Extension",   priority: "MEDIUM", status: "SCHEDULED", window: "19:00–23:00 UTC", flux: "85 W/m²",  areakm2: "1800"  },
  { id: "SVC-0013", customer: "Serengeti Anti-Poaching",     lat:  -2.33, lon:  34.83, region: "Serengeti, Tanzania",       type: "Wildlife Security",       priority: "HIGH",   status: "SCHEDULED", window: "20:00–02:00 UTC", flux: "50 W/m²",  areakm2: "14750" },
  { id: "SVC-0014", customer: "Nairobi City Council",        lat:  -1.28, lon:  36.82, region: "Nairobi, Kenya",            type: "Urban Illumination",      priority: "HIGH",   status: "SCHEDULED", window: "18:00–22:00 UTC", flux: "90 W/m²",  areakm2: "700"   },
  { id: "SVC-0015", customer: "Ghana Cacao Authority",       lat:   7.94, lon:  -1.02, region: "Ashanti, Ghana",            type: "Crop Extension",          priority: "MEDIUM", status: "SCHEDULED", window: "19:00–23:00 UTC", flux: "70 W/m²",  areakm2: "2200"  },
  { id: "SVC-0016", customer: "NEOM Smart City",             lat:  28.00, lon:  35.50, region: "NEOM, Saudi Arabia",        type: "Urban Infrastructure",    priority: "HIGH",   status: "SCHEDULED", window: "19:00–23:00 UTC", flux: "180 W/m²", areakm2: "500"   },
  { id: "SVC-0017", customer: "Mumbai Port Authority",       lat:  18.93, lon:  72.84, region: "Mumbai, India",             type: "Port Night Operations",   priority: "HIGH",   status: "SCHEDULED", window: "19:00–23:00 UTC", flux: "115 W/m²", areakm2: "300"   },
  { id: "SVC-0018", customer: "Maldives Tourism Board",      lat:   4.17, lon:  73.51, region: "Malé, Maldives",            type: "Resort Illumination",     priority: "LOW",    status: "SCHEDULED", window: "19:00–22:00 UTC", flux: "55 W/m²",  areakm2: "40"    },
  { id: "SVC-0019", customer: "Pilbara Iron Ore Mining",     lat: -23.36, lon: 119.77, region: "Pilbara, W. Australia",     type: "Mining Operations",       priority: "HIGH",   status: "SCHEDULED", window: "15:00–21:00 UTC", flux: "150 W/m²", areakm2: "600"   },
  { id: "SVC-0020", customer: "Canterbury AgriScience",      lat: -43.53, lon: 172.64, region: "Canterbury, New Zealand",   type: "Precision Agriculture",   priority: "LOW",    status: "SCHEDULED", window: "08:00–12:00 UTC", flux: "70 W/m²",  areakm2: "5200"  },
  { id: "SVC-0021", customer: "Buenos Aires Port",           lat: -34.61, lon: -58.37, region: "Buenos Aires, Argentina",   type: "Port Night Operations",   priority: "MEDIUM", status: "SCHEDULED", window: "00:00–04:00 UTC", flux: "100 W/m²", areakm2: "180"   },
  { id: "SVC-0022", customer: "Patagonia Wind Farms",        lat: -48.00, lon: -69.00, region: "Patagonia, Argentina",      type: "Solar Charging Ext.",     priority: "MEDIUM", status: "SCHEDULED", window: "23:00–05:00 UTC", flux: "85 W/m²",  areakm2: "8000"  },
  { id: "SVC-0023", customer: "Dakar Urban Grid",            lat:  14.72, lon: -17.47, region: "Dakar, Senegal",            type: "Urban Illumination",      priority: "HIGH",   status: "SCHEDULED", window: "19:00–23:00 UTC", flux: "95 W/m²",  areakm2: "550"   },
  { id: "SVC-0024", customer: "Faroe Islands Grid",          lat:  62.00, lon:  -6.79, region: "Faroe Islands",             type: "Solar Charging Ext.",     priority: "LOW",    status: "SCHEDULED", window: "21:00–03:00 UTC", flux: "55 W/m²",  areakm2: "90"    },
  { id: "SVC-0025", customer: "Maputo City Council",         lat: -25.96, lon:  32.58, region: "Maputo, Mozambique",        type: "Urban Illumination",      priority: "HIGH",   status: "SCHEDULED", window: "18:00–22:00 UTC", flux: "100 W/m²", areakm2: "350"   },
];

// Shuffle helper
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DISPLAY_COUNT = 10; // how many customers to show at once


// ─── UI helpers ───────────────────────────────────────────────────────────────

function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-xs tracking-widest uppercase text-muted-foreground ${className}`}>{children}</span>;
}

function Value({ children, className = "", color }: { children: ReactNode; className?: string; color?: string }) {
  return <span className={`font-mono tabular-nums ${className}`} style={{ color: color ?? "var(--foreground)" }}>{children}</span>;
}

// ─── Braun BC21-style clock — 150 px tall ────────────────────────────────────

const SEG_FONT = "'DSEG7-Classic', monospace";

function BraunClock({ label, digits, color = "#FFFFFF", glowColor }: {
  label: string; digits: string; color?: string; glowColor?: string;
}) {
  const ghost = digits.replace(/[0-9]/g, "8");
  const gc = glowColor ?? color;
  return (
    <div className="flex flex-col items-center gap-5">
      {/* Large bright label */}
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: "1.35rem", fontWeight: 500,
        letterSpacing: "0.3em", textTransform: "uppercase",
        color: "rgba(225,238,248,0.92)",
      }}>{label}</span>

      <div style={{ borderRadius: 10, overflow: "hidden", width: "auto", minWidth: 560,
        boxShadow: `0 16px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06), 0 0 40px ${gc}1A` }}>

        {/* Matte black body */}
        <div className="relative flex items-center justify-center"
          style={{ padding: "70px 60px", height: "auto",
            background: "linear-gradient(180deg, #141416 0%, #0B0B0D 55%, #080809 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.7)" }}>
          {/* Ghost inactive segments */}
          <span className="absolute select-none pointer-events-none"
            style={{ fontFamily: SEG_FONT, fontSize: "6rem", color: "rgba(255,255,255,0.055)",
              letterSpacing: "0.04em", lineHeight: 1 }}>
            {ghost}
          </span>
          {/* Live digits */}
          <span className="relative"
            style={{ fontFamily: SEG_FONT, fontSize: "6rem", color,
              letterSpacing: "0.04em", lineHeight: 1,
              textShadow: `0 0 10px ${gc}80, 0 0 30px ${gc}40, 0 0 60px ${gc}18` }}>
            {digits}
          </span>
        </div>

        {/* Glass / acrylic base */}
        <div className="relative"
          style={{ height: 40,
            background: "linear-gradient(180deg, rgba(244,66,0,0.36) 0%, rgba(210,55,0,0.50) 40%, rgba(230,60,0,0.44) 65%, rgba(195,48,0,0.48) 100%)",
            boxShadow: "inset 0 2px 0 rgba(255,160,120,0.8), inset 0 -1px 0 rgba(120,30,0,0.45), 0 8px 28px rgba(244,66,0,0.55)" }}>
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(90deg, transparent 5%, rgba(255,120,60,0.1) 35%, rgba(255,100,40,0.18) 55%, transparent 95%)" }} />
        </div>
      </div>
    </div>
  );
}

const LAUNCH_TARGET = new Date("2026-08-31T00:00:00Z");

function GmtClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return <BraunClock label="GMT" digits={t.toISOString().slice(11, 19)} color="#00D4FF" />;
}

function LocalClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const str = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ") ?? "Local";
  return <BraunClock label={tz} digits={str} color="#E8EDF2" />;
}

function LaunchCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((LAUNCH_TARGET.getTime() - now) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  const digits = `${Math.floor(s / 86400)}:${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return <BraunClock label="T− Mission Launch" digits={digits} color="#FF2B4A" glowColor="#FF2B4A" />;
}

// ─── Orbital Map ──────────────────────────────────────────────────────────────

function OrbitalMap({ onPositions, requests }: { onPositions: (p: { id: string; lat: number; lon: number }[]) => void; requests: ServiceRequest[] }) {
  const [prog, setProg] = useState({ t1: SAT_CONFIG[0].initT, t2: SAT_CONFIG[1].initT });

  useEffect(() => {
    const id = setInterval(() => {
      // No % 1 — let t accumulate so Earth rotation compounds across orbits
      setProg(p => ({ t1: p.t1 + 0.00000875, t2: p.t2 + 0.00000875 }));
    }, 50);
    return () => clearInterval(id);
  }, []);

  const pos1 = trackPoint(prog.t1, E1_RAAN, E1_INCL);
  const pos2 = trackPoint(prog.t2, E2_RAAN, E2_INCL);
  const track1 = computeTrackSegments(E1_RAAN, prog.t1, E1_INCL);
  const track2 = computeTrackSegments(E2_RAAN, prog.t2, E2_INCL);
  const positions = [{ id: "001", ...pos1 }, { id: "002", ...pos2 }];
  useEffect(() => { onPositions(positions); }, [pos1.lat, pos1.lon, pos2.lat, pos2.lon]);

  const xy1 = project(pos1.lat, pos1.lon);
  const xy2 = project(pos2.lat, pos2.lon);

  const stationStates = GROUND_STATIONS.map(gs => {
    const r1 = gs.active && gcDist(gs.lat, gs.lon, pos1.lat, pos1.lon) < MAX_RANGE_KM;
    const r2 = gs.active && gcDist(gs.lat, gs.lon, pos2.lat, pos2.lon) < MAX_RANGE_KM;
    return { ...gs, r1, r2, inRange: r1 || r2, litColor: r1 ? SAT_CONFIG[0].color : r2 ? SAT_CONFIG[1].color : null };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <filter id="glow-cyan" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-amber" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-gs" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <image href={mapImg} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
      <rect x={0} y={0} width={W} height={H} fill="rgba(4,10,16,0.45)" />

      {[-60,-30,0,30,60].map(lat => {
        const y = ((90 - lat) / 180) * H;
        return <line key={`lat${lat}`} x1={0} y1={y} x2={W} y2={y}
          stroke="rgba(0,212,255,0.07)" strokeWidth="1" strokeDasharray={lat === 0 ? "none" : "3 7"} />;
      })}
      {[-150,-120,-90,-60,-30,0,30,60,90,120,150].map(lon => {
        const x = ((lon + 180) / 360) * W;
        return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={H}
          stroke="rgba(0,212,255,0.05)" strokeWidth="1" strokeDasharray="3 7" />;
      })}
      <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="rgba(0,212,255,0.15)" strokeWidth="1" />

      {[60,30,0,-30,-60].map(lat => (
        <text key={`lbl${lat}`} x={4} y={((90-lat)/180)*H+4} fill="rgba(0,212,255,0.35)" fontSize="8" fontFamily="JetBrains Mono">{lat}</text>
      ))}

      {track1.map((pts, i) => (
        <polyline key={`t1-${i}`} points={pts} fill="none" stroke="#00D4FF" strokeWidth="0.7" strokeDasharray="3 5" opacity="0.25" />
      ))}
      {track2.map((pts, i) => (
        <polyline key={`t2-${i}`} points={pts} fill="none" stroke="#FF6B1A" strokeWidth="0.7" strokeDasharray="3 5" opacity="0.25" />
      ))}

      {/* Service location dots — blink when scheduled, off when actively served */}
      {requests.filter(c => !isRestricted(c.lat, c.lon)).map(c => {
        const [cx, cy] = project(c.lat, c.lon);
        const served = [pos1, pos2].some(p => gcDist(p.lat, p.lon, c.lat, c.lon) < ILLUMINATION_KM && !isRestricted(p.lat, p.lon));
        if (served) return null; // dot off while being served
        return (
          <circle key={c.id} cx={cx} cy={cy} r={2} fill="#F44200">
            <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
          </circle>
        );
      })}

      {stationStates.map(gs => (
        <g key={gs.id}>
          {gs.circles.map((pts, i) => (
            <polyline key={i} points={pts} fill="none"
              stroke={gs.inRange ? gs.litColor! : "rgba(0,212,255,0.18)"}
              strokeWidth={gs.inRange ? 1 : 0.7}
              strokeDasharray="4 6"
              opacity={gs.inRange ? 0.7 : 0.5} />
          ))}
        </g>
      ))}


      {[{ sat: SAT_CONFIG[0], xy: xy1 }, { sat: SAT_CONFIG[1], xy: xy2 }].map(({ sat, xy }) => (
        <g key={sat.id} filter={`url(#glow-${sat.label})`}>
          <circle cx={xy[0]} cy={xy[1]} r={5} fill={sat.color} />
          <circle cx={xy[0]} cy={xy[1]} r={9} fill="none" stroke={sat.color} strokeWidth="0.8" opacity="0.45" />
          <text x={xy[0]+11} y={xy[1]-7} fill={sat.color} fontSize="8" fontFamily="JetBrains Mono" fontWeight="500" letterSpacing="0.08em">{sat.name}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Left sidebar: both sat panels ────────────────────────────────────────────

function SatSidebar({ livePositions }: { livePositions: { id: string; lat: number; lon: number }[] }) {
  return (
    <aside className="border-r border-border flex flex-col overflow-hidden" style={{ paddingTop: "clamp(60px, 12vw, 220px)" }}>
      {SAT_CONFIG.map((s, idx) => {
        const pos = livePositions.find(p => p.id === s.id);
        return (
          <div key={s.id} className={`flex-1 flex flex-col overflow-hidden ${idx === 0 ? "border-b border-border" : ""}`}
            style={{ background: `${s.color}05` }}>

            {/* Header */}
            <div className="flex-none flex items-center justify-between border-b"
              style={{ padding: "clamp(6px,1.2vh,14px) clamp(8px,1.2vw,20px)", borderLeft: `3px solid ${s.color}`, borderColor: `${s.color}30` }}>
              <div className="flex items-center gap-2">
                <span className="rounded-full animate-pulse flex-none"
                  style={{ width: "clamp(8px,1vw,14px)", height: "clamp(8px,1vw,14px)", backgroundColor: s.color }} />
                <span className="font-semibold tracking-wider truncate"
                  style={{ color: s.color, fontSize: "clamp(0.9rem,1.6vw,1.6rem)" }}>{s.name}</span>
              </div>
              <span className="font-mono border tracking-widest flex-none"
                style={{ color: s.color, borderColor: `${s.color}40`, fontSize: "clamp(0.55rem,0.7vw,0.8rem)", padding: "2px clamp(4px,0.5vw,10px)" }}>
                NOMINAL
              </span>
            </div>

            {/* Live position */}
            <div className="flex-none border-b grid grid-cols-2"
              style={{ padding: "clamp(6px,1vh,14px) clamp(8px,1.2vw,20px)", gap: "clamp(6px,1vw,16px)", borderColor: "rgba(0,212,255,0.1)" }}>
              {[["Latitude", pos ? `${pos.lat.toFixed(2)}°` : "—"], ["Longitude", pos ? `${pos.lon.toFixed(2)}°` : "—"]].map(([label, val]) => (
                <div key={label}>
                  <span className="block text-muted-foreground font-mono uppercase tracking-widest"
                    style={{ fontSize: "clamp(0.5rem,0.7vw,0.75rem)", marginBottom: "clamp(2px,0.3vh,6px)" }}>{label}</span>
                  <span className="font-mono leading-none"
                    style={{ color: s.color, fontSize: "clamp(1rem,2.2vw,2.4rem)" }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Orbital metrics */}
            <div className="flex-1 grid grid-cols-2 content-start"
              style={{ padding: "clamp(6px,1vh,14px) clamp(8px,1.2vw,20px)", gap: "clamp(6px,1.2vh,20px) clamp(6px,1vw,16px)" }}>
              {(s.id === "001" ? [
                { l: "Altitude",    v: "530",    u: "km"   },
                { l: "Inclination", v: "97.516", u: "°"    },
                { l: "Period",      v: "95.25",  u: "min"  },
                { l: "RAAN",        v: "272.18", u: "°"    },
                { l: "Velocity",    v: "7.661",  u: "km/s" },
              ] : [
                { l: "Altitude",    v: "500",   u: "km"   },
                { l: "Inclination", v: "88.0",  u: "°"    },
                { l: "Period",      v: "94.5",  u: "min"  },
                { l: "RAAN",        v: "92.0",  u: "°"    },
                { l: "Velocity",    v: "7.613", u: "km/s" },
              ]).map(({ l, v, u }) => (
                <div key={l}>
                  <span className="block text-muted-foreground font-mono uppercase tracking-widest"
                    style={{ fontSize: "clamp(0.5rem,0.7vw,0.75rem)", marginBottom: "clamp(2px,0.3vh,6px)" }}>{l}</span>
                  <div className="flex items-baseline" style={{ gap: "clamp(2px,0.3vw,6px)" }}>
                    <span className="font-mono leading-none"
                      style={{ color: s.color, fontSize: "clamp(1rem,2.2vw,2.4rem)" }}>{v}</span>
                    {u && <span className="text-muted-foreground font-mono uppercase tracking-widest"
                      style={{ fontSize: "clamp(0.5rem,0.6vw,0.7rem)" }}>{u}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}


// ─── Right panel: customer ground service requests ─────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:     "#00D4FF",
  SCHEDULED:  "#FF6B1A",
  PENDING:    "#5A7A96",
  RESTRICTED: "#FF2B4A",
};
const PRIORITY_COLOR: Record<string, string> = {
  CRIT:   "#FF2B4A",
  HIGH:   "#FF6B1A",
  MEDIUM: "#00D4FF",
  LOW:    "#5A7A96",
};

function CustomerPanel({ livePositions, requests }: { livePositions: { id: string; lat: number; lon: number }[]; requests: ServiceRequest[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const req = requests.find(r => r.id === selected) ?? requests[0];

  // Dynamically set ACTIVE if either satellite is within range of the service location
  function liveStatus(c: ServiceRequest): string {
    if (isRestricted(c.lat, c.lon)) return "RESTRICTED";
    const inRange = livePositions.some(p =>
      gcDist(p.lat, p.lon, c.lat, c.lon) < ILLUMINATION_KM && !isRestricted(p.lat, p.lon)
    );
    return inRange ? "ACTIVE" : c.status;
  }

  const fs = { label: "clamp(0.5rem,0.7vw,0.8rem)", value: "clamp(0.85rem,1.5vw,1.5rem)", large: "clamp(1rem,1.8vw,2rem)" };
  const pad = { x: "clamp(8px,1.2vw,20px)", y: "clamp(6px,1vh,14px)" };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-none border-b border-border flex items-center justify-between"
        style={{ padding: `${pad.y} ${pad.x}` }}>
        <span className="font-mono uppercase tracking-widest text-muted-foreground" style={{ fontSize: fs.label }}>Illumination Service Requests</span>
        <span className="font-mono text-primary" style={{ fontSize: fs.label }}>{requests.filter(r => liveStatus(r) === "ACTIVE").length} ACTIVE</span>
      </div>

      {/* Request list */}
      <div className="flex-none overflow-y-auto border-b border-border" style={{ scrollbarWidth: "none", maxHeight: "55%" }}>
        {requests.map(r => {
          const status = liveStatus(r);
          return (
          <button key={r.id} onClick={() => setSelected(r.id)}
            className="w-full text-left transition-all"
            style={{
              padding: `clamp(12px,2vh,32px) ${pad.x}`,
              background: selected === r.id ? `${STATUS_COLOR[status]}0A` : "transparent",
              borderLeft: selected === r.id ? `3px solid ${STATUS_COLOR[status]}` : "3px solid transparent",
              borderBottom: "1px solid rgba(0,212,255,0.1)",
            }}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-semibold tracking-wide leading-snug" style={{ fontSize: fs.large }}>{r.customer}</span>
              <span className="font-mono flex-none inline-flex items-center border"
                style={{ fontSize: fs.label, color: STATUS_COLOR[status], borderColor: `${STATUS_COLOR[status]}40`, padding: "2px 6px" }}>
                {status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono uppercase tracking-widest text-muted-foreground" style={{ fontSize: fs.label }}>{r.id} · {r.type}</span>
              <span className="font-mono" style={{ fontSize: fs.label, color: PRIORITY_COLOR[r.priority] }}>{r.priority}</span>
            </div>
          </button>
          );
        })}
      </div>

      {/* Selected request detail */}
      {req && (
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none", padding: `${pad.y} ${pad.x}` }}>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold tracking-wide" style={{ fontSize: fs.large }}>{req.customer}</span>
              <span className="font-mono border" style={{ fontSize: fs.label, color: STATUS_COLOR[liveStatus(req)], borderColor: `${STATUS_COLOR[liveStatus(req)]}40`, padding: "2px 8px" }}>
                {liveStatus(req)}
              </span>
            </div>
            <span className="font-mono uppercase tracking-widest text-muted-foreground" style={{ fontSize: fs.label }}>{req.id}</span>
          </div>

          {/* Coordinates */}
          <div className="mb-3 border border-border/50" style={{ background: "rgba(0,212,255,0.04)", padding: `${pad.y} ${pad.x}` }}>
            <span className="font-mono uppercase tracking-widest text-muted-foreground block mb-2" style={{ fontSize: fs.label }}>Target Illumination Coordinates</span>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <span className="font-mono uppercase tracking-widest text-muted-foreground block" style={{ fontSize: fs.label }}>Latitude</span>
                <span className="font-mono text-primary" style={{ fontSize: fs.value }}>{req.lat.toFixed(1)}°{req.lat >= 0 ? "N" : "S"}</span>
              </div>
              <div>
                <span className="font-mono uppercase tracking-widest text-muted-foreground block" style={{ fontSize: fs.label }}>Longitude</span>
                <span className="font-mono text-primary" style={{ fontSize: fs.value }}>{Math.abs(req.lon).toFixed(1)}°{req.lon >= 0 ? "E" : "W"}</span>
              </div>
            </div>
            <span className="font-mono uppercase tracking-widest text-muted-foreground block" style={{ fontSize: fs.label }}>Region</span>
            <span className="font-semibold tracking-wide" style={{ fontSize: fs.value }}>{req.region}</span>
          </div>

          {/* Service details */}
          <div>
            {[
              { l: "Mission Type",       v: req.type                     },
              { l: "Priority",           v: req.priority, color: PRIORITY_COLOR[req.priority] },
              { l: "Illumination Window",v: req.window                   },
              { l: "Target Irradiance",  v: (req as any).flux            },
              { l: "Coverage Area",      v: `${(req as any).areakm2} km²`},
            ].map(({ l, v, color }) => (
              <div key={l} className="flex items-center justify-between border-b border-border/30" style={{ padding: `clamp(6px,1vh,12px) 0` }}>
                <span className="font-mono uppercase tracking-widest text-muted-foreground" style={{ fontSize: fs.label }}>{l}</span>
                <span className="font-mono tracking-wide" style={{ fontSize: fs.value, color: color ?? "var(--foreground)" }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Next pass */}
          <div className="mt-3 border border-border/50" style={{ padding: `${pad.y} ${pad.x}` }}>
            <span className="font-mono uppercase tracking-widest text-muted-foreground block mb-2" style={{ fontSize: fs.label }}>Next Satellite Pass</span>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["AOS",   `+${(Math.abs(req.lat) / 10 + 4).toFixed(0)}m 12s`,  "var(--color-primary)"],
                ["LOS",   `+${(Math.abs(req.lat) / 10 + 12).toFixed(0)}m 48s`, "var(--color-primary)"],
                ["Max El",`${(20 + Math.abs(req.lat) % 55).toFixed(1)}°`,       "var(--color-primary)"],
                ["Sat",   "Earendil 1",                                           "#00D4FF"],
              ].map(([label, val, col]) => (
                <div key={label}>
                  <span className="font-mono uppercase tracking-widest text-muted-foreground block" style={{ fontSize: fs.label }}>{label}</span>
                  <span className="font-mono" style={{ fontSize: fs.value, color: col }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────


export default function App() {
  const [livePositions, setLivePositions] = useState<{ id: string; lat: number; lon: number }[]>([]);
  const [activeRequests, setActiveRequests] = useState<ServiceRequest[]>(() => shuffle(CUSTOMER_POOL).slice(0, DISPLAY_COUNT));
  const pendingRef = useRef(new Set<string>());

  // Replace a customer only after they've been served (satellite passes within 2.5km)
  useEffect(() => {
    const p1 = livePositions.find(p => p.id === "001");
    const p2 = livePositions.find(p => p.id === "002");
    if (!p1 && !p2) return;

    activeRequests.forEach(c => {
      if (pendingRef.current.has(c.id) || isRestricted(c.lat, c.lon)) return;
      const served = [p1, p2].some(p => p && gcDist(p.lat, p.lon, c.lat, c.lon) < ILLUMINATION_KM && !isRestricted(p.lat, p.lon));
      if (served) {
        pendingRef.current.add(c.id);
        setTimeout(() => {
          setActiveRequests(cur => {
            const ids = new Set(cur.map(r => r.id));
            const candidates = CUSTOMER_POOL.filter(r => !ids.has(r.id) && !isRestricted(r.lat, r.lon));
            const fresh = candidates[Math.floor(Math.random() * candidates.length)];
            pendingRef.current.delete(c.id);
            return fresh ? cur.map(r => r.id === c.id ? fresh : r) : cur;
          });
        }, 3000);
      }
    });
  }, [livePositions]);

  const pos1 = livePositions.find(p => p.id === "001");
  const pos2 = livePositions.find(p => p.id === "002");
  const gsStatus = GROUND_STATIONS.map(gs => {
    const r1 = pos1 ? gcDist(gs.lat, gs.lon, pos1.lat, pos1.lon) < MAX_RANGE_KM : false;
    const r2 = pos2 ? gcDist(gs.lat, gs.lon, pos2.lat, pos2.lon) < MAX_RANGE_KM : false;
    return { ...gs, r1, r2, lit: gs.active && (r1 || r2) };
  });
  const activeLinks = gsStatus.filter(g => g.lit).length;

  return (
    <div className="w-screen h-screen bg-background text-foreground overflow-hidden flex flex-col"
      style={{ fontFamily: "'Barlow Condensed', sans-serif", paddingLeft: "clamp(8px, 4vw, 240px)", paddingRight: "clamp(8px, 4vw, 240px)" }}>

      {/* Header — 300px, full width, logo fills it */}
      <header className="flex-none w-full flex items-center justify-center relative"
        style={{ height: "clamp(80px, 14vw, 240px)", marginBottom: "clamp(-60px, -10vw, -180px)", zIndex: 10, background: "rgba(5,7,10,0)" }}>
        <img src={logoSvg} alt="Reflect Orbital" style={{ height: "clamp(40px, 10vw, 200px)", width: "auto", maxWidth: "80vw", display: "block" }} />
      </header>

      {/* Main grid */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: "clamp(140px, 18vw, 380px) 1fr clamp(140px, 18vw, 380px)", paddingBottom: "clamp(100px, 20vh, 380px)" }}>

        {/* Left: both sat panels */}
        <SatSidebar livePositions={livePositions} />

        {/* Center: map */}
        <main className="flex flex-col overflow-hidden">
          <div className="flex-1 relative overflow-hidden">
            <OrbitalMap onPositions={setLivePositions} requests={activeRequests} />

            <div className="absolute bottom-2 right-2 flex items-center gap-4 pointer-events-none">
              {SAT_CONFIG.map(s => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <Label className="text-[9px]">{s.name}</Label>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Right: customer service requests */}
        <aside className="border-l border-border flex flex-col overflow-hidden" style={{ paddingTop: "clamp(60px, 12vw, 220px)" }}>
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <CustomerPanel livePositions={livePositions} requests={activeRequests} />
          </div>
        </aside>
      </div>

      {/* Footer — three large clocks */}
      <footer className="border-t border-border flex items-center justify-center gap-20"
        style={{ position: "fixed", bottom: 0, left: "clamp(8px, 4vw, 240px)", right: "clamp(8px, 4vw, 240px)", zIndex: 20, background: "rgba(6,10,14,0.98)", minHeight: "clamp(100px, 20vh, 380px)" }}>
        <LocalClock />
        <GmtClock />
        <LaunchCountdown />
      </footer>
    </div>
  );
}
