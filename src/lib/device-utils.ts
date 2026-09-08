export interface DeviceInfo {
  warehouse_name?: string;
  location_name?: string;
}

export type DeviceLocationMap = Record<string, string | DeviceInfo>;

const FALLBACK_DEVICE_NAMES: Record<string, string> = {
  "AGFW26010": "Morgan Stanley",
  "CFSO13": "Morgan Stanley 2",
};

export function getDeviceLocationMap(): DeviceLocationMap {
  if (typeof window === "undefined") {
    const fallback: DeviceLocationMap = Object.create(null);
    Object.assign(fallback, FALLBACK_DEVICE_NAMES);
    return fallback;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const deviceMapParam = searchParams.get("device_map");
  let parsedMap: DeviceLocationMap = {};

  if (deviceMapParam) {
    try {
      const parsed = JSON.parse(deviceMapParam);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsedMap = parsed;
      }
    } catch {
      try {
        const parsed = JSON.parse(decodeURIComponent(deviceMapParam));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedMap = parsed;
        }
      } catch {
        parsedMap = {};
      }
    }
  }

  const result: DeviceLocationMap = Object.create(null);
  Object.assign(result, FALLBACK_DEVICE_NAMES, parsedMap);
  return result;
}

export function getDeviceDetails(deviceId: string, deviceMap: DeviceLocationMap): {
  warehouseName: string;
  locationName: string;
  label: string;
  tooltip?: string;
} {
  const entry = deviceMap[deviceId];
  let warehouseName = "";
  let locationName = "";

  if (typeof entry === "string") {
    warehouseName = entry;
  } else if (entry && typeof entry === "object") {
    warehouseName = entry.warehouse_name || "";
    locationName = entry.location_name || "";
  }

  const displayName = warehouseName || locationName;
  const label = displayName && displayName !== deviceId ? `${displayName} (${deviceId})` : deviceId;

  let tooltip: string | undefined = undefined;
  if (warehouseName && locationName && locationName !== warehouseName) {
    tooltip = `${label} (${locationName})`;
  }

  return {
    warehouseName,
    locationName,
    label,
    tooltip,
  };
}

export function getDeviceLabel(deviceId: string, deviceMap: DeviceLocationMap): string {
  return getDeviceDetails(deviceId, deviceMap).label;
}

export function getDeviceTooltip(deviceId: string, deviceMap: DeviceLocationMap): string | undefined {
  return getDeviceDetails(deviceId, deviceMap).tooltip;
}

export function getInitialDevices(existingMap?: DeviceLocationMap): string[] {
  if (typeof window === "undefined") return ["AGFW26010", "CFSO13"];
  const searchParams = new URLSearchParams(window.location.search);
  const urlDevice = searchParams.get("device") || searchParams.get("devices");
  if (!urlDevice) return ["AGFW26010", "CFSO13"];

  const deviceMap = existingMap || getDeviceLocationMap();
  const nameToSerial: Record<string, string> = Object.create(null);
  Object.entries(deviceMap).forEach(([serial, info]) => {
    if (typeof info === "string") {
      nameToSerial[info] = serial;
    } else if (info && typeof info === "object") {
      if (info.warehouse_name) nameToSerial[info.warehouse_name] = serial;
      if (info.location_name) nameToSerial[info.location_name] = serial;
    }
  });

  return urlDevice.split(",").map((d) => {
    const trimmed = d.trim();
    if (nameToSerial[trimmed]) return nameToSerial[trimmed];
    if (trimmed === "CFS013") return "CFSO13";
    return trimmed;
  });
}
