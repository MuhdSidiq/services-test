// src/services/gantifier-discovery.service.ts
import { PrismaClient } from '../../app/generated/prisma';
import { calculateDistance, parseLocationString } from './geo.service';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Load Malaysian geo data
const geoDataPath = path.join(__dirname, '../lib/my-geo-data.json');
let geoData: any[] = [];
let cityCoordinatesMap: Map<string, { lat: string; lng: string }> = new Map();

try {
    const geoDataRaw = fs.readFileSync(geoDataPath, 'utf-8');
    geoData = JSON.parse(geoDataRaw);

    // Build city ID to coordinates map
    geoData.forEach(state => {
        state.cities.forEach((city: any) => {
            if (city.latitude && city.longitude) {
                cityCoordinatesMap.set(city.id, {
                    lat: city.latitude,
                    lng: city.longitude
                });
            }
        });
    });

    console.log(`[GANTIFIER-DISCOVERY] ✅ Loaded ${cityCoordinatesMap.size} city coordinates from geo data`);
} catch (error) {
    console.error('[GANTIFIER-DISCOVERY] ❌ Failed to load geo data:', error);
}

/**
 * Finds gantifiers within a specified radius of the center location
 *
 * @param centerLocation - Center location string in "lat,lng" format
 * @param scheduledDate - Scheduled date for the job
 * @param maxDistanceKm - Maximum distance in kilometers (default: 20km)
 * @returns Array of gantifiers within the radius, ranked by priority
 */
export async function findNearbyGantifiers(
    centerLocation: string,
    scheduledDate: string,
    maxDistanceKm: number = 20
) {
    try {
        console.log(`[GANTIFIER-DISCOVERY] Starting search for gantifiers within ${maxDistanceKm}km of ${centerLocation}`);

        // Get all users with GANTIFIER role
        const usersWithGantifierRole = await prisma.users.findMany({
            where: {
                roles: {
                    name: 'GANTIFIER'
                }
            },
            include: {
                gantifiers: {
                    select: {
                        id: true,
                        full_name: true,
                        status: true,
                        average_rating: true,
                        completion_rate: true,
                        total_jobs_completed: true,
                        address: true,
                        current_address: true,
                        preferred_location: true,
                        created_at: true,
                        updated_at: true,
                        last_updated: true
                    }
                }
            }
        });

        if (usersWithGantifierRole.length === 0) {
            console.log('[GANTIFIER-DISCOVERY] No users with GANTIFIER role found');
            return [];
        }

        console.log(`[GANTIFIER-DISCOVERY] Found ${usersWithGantifierRole.length} users with GANTIFIER role`);

        // Filter out users without gantifier profiles and map to gantifier objects
        const gantifiersWithProfiles = usersWithGantifierRole
            .filter(user => user.gantifiers !== null)
            .map(user => ({
                ...user.gantifiers!,
                userId: user.id,
                userName: user.name
            }));

        if (gantifiersWithProfiles.length === 0) {
            console.log('[GANTIFIER-DISCOVERY] No gantifier profiles found');
            return [];
        }

        console.log(`[GANTIFIER-DISCOVERY] Found ${gantifiersWithProfiles.length} gantifier profiles`);

        // Parse center coordinates
        const centerCoords = parseLocationString(centerLocation);
        const gantifiersWithinRadius = [];

        if (centerCoords) {
            console.log(`[GANTIFIER-DISCOVERY] Center coordinates: ${centerCoords.lat}, ${centerCoords.lng}`);

            for (const gantifier of gantifiersWithProfiles) {
                // Get gantifier locations (preferred locations or fallback to address)
                const gantifierLocations = getGantifierLocations(gantifier);

                if (gantifierLocations.length === 0) {
                    console.log(`[GANTIFIER-DISCOVERY] ⚠️ Gantifier ${gantifier.full_name} has no valid locations - skipping`);
                    continue;
                }

                // Calculate minimum distance to any of the gantifier's locations
                let minDistance = Infinity;
                let closestLocation = null;

                for (const location of gantifierLocations) {
                    const gantifierCoords = parseLocationString(location);

                    if (!gantifierCoords) {
                        console.log(`[GANTIFIER-DISCOVERY] ⚠️ Gantifier ${gantifier.full_name} location "${location}" is not in coordinate format - skipping`);
                        continue;
                    }

                    // Calculate distance
                    const distance = calculateDistance(
                        centerCoords.lat,
                        centerCoords.lng,
                        gantifierCoords.lat,
                        gantifierCoords.lng
                    );

                    if (distance < minDistance) {
                        minDistance = distance;
                        closestLocation = location;
                    }
                }

                console.log(`[GANTIFIER-DISCOVERY] Gantifier ${gantifier.full_name} - Closest Distance: ${minDistance.toFixed(2)}km (from ${closestLocation})`);

                // Add to results if within radius
                if (minDistance <= maxDistanceKm) {
                    gantifiersWithinRadius.push({
                        ...gantifier,
                        distance: minDistance
                    });
                    console.log(`[GANTIFIER-DISCOVERY] ✅ ${gantifier.full_name} is within ${maxDistanceKm}km radius`);
                } else {
                    console.log(`[GANTIFIER-DISCOVERY] ❌ ${gantifier.full_name} is outside ${maxDistanceKm}km radius (${minDistance.toFixed(2)}km)`);
                }
            }
        } else {
            console.log(`[GANTIFIER-DISCOVERY] ⚠️ Center location "${centerLocation}" is not in coordinate format - returning all gantifiers`);
            gantifiersWithinRadius.push(...gantifiersWithProfiles);
        }

        console.log(`[GANTIFIER-DISCOVERY] Found ${gantifiersWithinRadius.length} gantifiers within ${maxDistanceKm}km radius`);

        // Log each gantifier for debugging
        gantifiersWithinRadius.forEach((gantifier, index) => {
            const distanceInfo = (gantifier as any).distance ? (gantifier as any).distance.toFixed(2) + 'km' : 'N/A';
            console.log(`[GANTIFIER-DISCOVERY] Gantifier ${index + 1}: ${gantifier.full_name} - Status: ${gantifier.status} - User: ${gantifier.userName} - Distance: ${distanceInfo}`);
        });

        // Filter by status (active gantifiers only)
        const activeGantifiers = gantifiersWithinRadius.filter(gantifier =>
            gantifier.status === 'ACTIVE' || gantifier.status === 'INACTIVE' // Include both for testing
        );

        console.log(`[GANTIFIER-DISCOVERY] ${activeGantifiers.length} gantifiers are available (ACTIVE/INACTIVE status)`);

        // Return ranked gantifiers
        const rankedGantifiers = await rankGantifiersByPriority(activeGantifiers);

        console.log(`[GANTIFIER-DISCOVERY] After ranking: ${rankedGantifiers.length} gantifiers`);
        console.log(`[GANTIFIER-DISCOVERY] ✅ Will send offers to ${rankedGantifiers.length} gantifiers`);

        return rankedGantifiers;
    } catch (error) {
        console.error('[GANTIFIER-DISCOVERY] ❌ Error in findNearbyGantifiers:', error);
        return [];
    }
}

/**
 * Extracts all valid location coordinates from a gantifier's selected cities
 * Maps city IDs to coordinates using my-geo-data.json
 *
 * @param gantifier - The gantifier object
 * @returns Array of location strings in "lat,lng" format
 */
function getGantifierLocations(gantifier: any): string[] {
    const locations: string[] = [];

    console.log(`[GANTIFIER-DISCOVERY] Processing gantifier: ${gantifier.full_name}`);

    // Priority 1: Use selected_cities (mapped to coordinates)
    if (gantifier.selected_cities && Array.isArray(gantifier.selected_cities)) {
        console.log(`[GANTIFIER-DISCOVERY] Gantifier has ${gantifier.selected_cities.length} selected cities:`, gantifier.selected_cities);

        gantifier.selected_cities.forEach((cityId: string) => {
            const cityCoords = cityCoordinatesMap.get(cityId);
            if (cityCoords) {
                const coordString = `${cityCoords.lat},${cityCoords.lng}`;
                locations.push(coordString);
                console.log(`[GANTIFIER-DISCOVERY] ✅ Mapped city "${cityId}" → ${coordString}`);
            } else {
                console.log(`[GANTIFIER-DISCOVERY] ⚠️ City "${cityId}" not found in geo data`);
            }
        });
    }

    // Priority 2: Handle preferred locations (JSON format) - backward compatibility
    if (locations.length === 0 && gantifier.preferred_location) {
        console.log(`[GANTIFIER-DISCOVERY] No selected_cities, trying preferred_location`);

        if (Array.isArray(gantifier.preferred_location)) {
            // If it's an array of strings (coordinate format)
            if (typeof gantifier.preferred_location[0] === 'string') {
                locations.push(...gantifier.preferred_location);
            }
            // If it's an array of objects with lat/lng
            else if (gantifier.preferred_location[0] && typeof gantifier.preferred_location[0] === 'object') {
                const coordStrings = gantifier.preferred_location.map((loc: any) => {
                    if (loc.lat && loc.lng) {
                        return `${loc.lat},${loc.lng}`;
                    } else if (loc.latitude && loc.longitude) {
                        return `${loc.latitude},${loc.longitude}`;
                    }
                    return null;
                }).filter((loc: string | null): loc is string => loc !== null);
                locations.push(...coordStrings);
            }
        }
        // Handle legacy string format
        else if (typeof gantifier.preferred_location === 'string') {
            locations.push(gantifier.preferred_location);
        }
    }

    // Priority 3: Try to parse address as coordinates (legacy)
    if (locations.length === 0) {
        console.log(`[GANTIFIER-DISCOVERY] No cities/preferred_location, trying addresses (likely won't work)`);

        if (gantifier.current_address) {
            // Only add if it looks like coordinates (has comma and numbers)
            if (/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(gantifier.current_address.trim())) {
                locations.push(gantifier.current_address);
                console.log(`[GANTIFIER-DISCOVERY] Using current_address as coordinates: ${gantifier.current_address}`);
            }
        }
        if (gantifier.address) {
            // Only add if it looks like coordinates
            if (/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(gantifier.address.trim())) {
                locations.push(gantifier.address);
                console.log(`[GANTIFIER-DISCOVERY] Using address as coordinates: ${gantifier.address}`);
            }
        }
    }

    console.log(`[GANTIFIER-DISCOVERY] Gantifier ${gantifier.full_name}: Found ${locations.length} location(s)`);
    return locations;
}

/**
 * Ranks gantifiers by priority score based on various factors
 *
 * @param gantifiers - Array of gantifiers to rank
 * @returns Ranked array of gantifiers
 */
async function rankGantifiersByPriority(gantifiers: any[]) {
    try {
        console.log(`[GANTIFIER-DISCOVERY] Ranking ${gantifiers.length} gantifiers by priority`);

        if (!gantifiers || gantifiers.length === 0) {
            console.log('[GANTIFIER-DISCOVERY] ❌ No gantifiers to rank');
            return [];
        }

        // Calculate priority scores for each gantifier
        // Factors considered:
        // - Completion rate (higher is better)
        // - Average rating (higher is better)
        // - Distance to job (closer is better)
        // - Total jobs completed (more experience is better)

        const rankedGantifiers = gantifiers.sort((a, b) => {
            // Primary sort: Completion rate
            const rateA = a.completion_rate || 0;
            const rateB = b.completion_rate || 0;

            if (rateA !== rateB) {
                return rateB - rateA;
            }

            // Secondary sort: Average rating
            const ratingA = a.average_rating || 0;
            const ratingB = b.average_rating || 0;

            if (ratingA !== ratingB) {
                return ratingB - ratingA;
            }

            // Tertiary sort: Distance (if available)
            const distanceA = a.distance || Infinity;
            const distanceB = b.distance || Infinity;

            if (distanceA !== distanceB) {
                return distanceA - distanceB;
            }

            // Final sort: Total jobs completed
            const jobsA = a.total_jobs_completed || 0;
            const jobsB = b.total_jobs_completed || 0;

            return jobsB - jobsA;
        });

        console.log(`[GANTIFIER-DISCOVERY] ✅ Successfully ranked ${rankedGantifiers.length} gantifiers`);
        return rankedGantifiers;
    } catch (error) {
        console.error('[GANTIFIER-DISCOVERY] ❌ Error in rankGantifiersByPriority:', error);
        // Return original array if ranking fails
        return gantifiers;
    }
}
