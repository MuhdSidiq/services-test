// src/services/geo.service.ts
/**
 * Geographic utility service for distance calculations and coordinate handling
 * Uses Haversine formula for calculating distances between coordinates
 */

/**
 * Calculates the distance between two points on Earth using the Haversine formula
 *
 * @param lat1 - Latitude of first point in degrees
 * @param lon1 - Longitude of first point in degrees
 * @param lat2 - Latitude of second point in degrees
 * @param lon2 - Longitude of second point in degrees
 * @returns Distance in kilometers
 */
export function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    // Radius of the Earth in kilometers
    const R = 6371;

    // Convert degrees to radians
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);

    // Haversine formula
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

/**
 * Converts degrees to radians
 *
 * @param deg - Degrees to convert
 * @returns Value in radians
 */
function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Parses a location string into latitude and longitude
 *
 * @param locationString - String in format "latitude,longitude"
 * @returns Object with lat and lng properties, or null if invalid
 */
export function parseLocationString(locationString: string): { lat: number, lng: number } | null {
    if (!locationString) return null;

    const [latStr, lngStr] = locationString.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng)) {
        return null;
    }

    return { lat, lng };
}

/**
 * Formats latitude and longitude as a location string
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Location string in format "latitude,longitude"
 */
export function formatLocation(lat: number, lng: number): string {
    return `${lat},${lng}`;
}

/**
 * Finds the closest location from a list of locations to a target location
 *
 * @param targetLocation - Target location string in "lat,lng" format
 * @param locations - Array of location strings in "lat,lng" format
 * @returns Object with closest location and distance, or null if no valid locations
 */
export function findClosestLocation(
    targetLocation: string,
    locations: string[]
): { location: string; distance: number } | null {
    const targetCoords = parseLocationString(targetLocation);
    if (!targetCoords) return null;

    let closestLocation: string | null = null;
    let minDistance = Infinity;

    for (const location of locations) {
        const coords = parseLocationString(location);
        if (!coords) continue;

        const distance = calculateDistance(
            targetCoords.lat,
            targetCoords.lng,
            coords.lat,
            coords.lng
        );

        if (distance < minDistance) {
            minDistance = distance;
            closestLocation = location;
        }
    }

    return closestLocation ? { location: closestLocation, distance: minDistance } : null;
}

/**
 * Validates if a location string is in the correct format
 *
 * @param locationString - Location string to validate
 * @returns True if valid, false otherwise
 */
export function isValidLocationString(locationString: string): boolean {
    if (!locationString) return false;

    const coords = parseLocationString(locationString);
    if (!coords) return false;

    // Check if coordinates are within valid ranges
    return coords.lat >= -90 && coords.lat <= 90 &&
        coords.lng >= -180 && coords.lng <= 180;
}

/**
 * Converts a JSON location object to a location string
 *
 * @param locationObj - Location object with lat/lng or latitude/longitude properties
 * @returns Location string in "lat,lng" format or null if invalid
 */
export function locationObjectToString(locationObj: any): string | null {
    if (!locationObj || typeof locationObj !== 'object') return null;

    let lat: number | undefined;
    let lng: number | undefined;

    if (locationObj.lat !== undefined && locationObj.lng !== undefined) {
        lat = locationObj.lat;
        lng = locationObj.lng;
    } else if (locationObj.latitude !== undefined && locationObj.longitude !== undefined) {
        lat = locationObj.latitude;
        lng = locationObj.longitude;
    }

    if (typeof lat === 'number' && typeof lng === 'number') {
        return formatLocation(lat, lng);
    }

    return null;
}
