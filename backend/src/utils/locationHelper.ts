import mongoose from "mongoose";
import Seller from "../models/Seller";

/**
 * Helper function to calculate distance between two coordinates (Haversine formula)
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find sellers whose service radius covers the user's location
 * @param userLat User's latitude
 * @param userLng User's longitude
 * @returns Array of seller IDs within range
 */
export async function findSellersWithinRange(
  userLat: number,
  userLng: number
): Promise<mongoose.Types.ObjectId[]> {
  if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
    return [];
  }

  // Validate coordinates
  if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
    return [];
  }

  try {
    // Only approved, open shops are sellable from.
    //
    // The status filter was commented out "to allow testing with new/pending
    // sellers", which meant Pending and Rejected sellers' products were listed
    // and purchasable across all 14 call sites of this helper. (#H-14)
    //
    // A $geoWithin prefilter narrows the candidate set at the database instead
    // of loading every seller and filtering in JS. `serviceRadiusKm` is
    // per-seller, so the precise test still runs below; this only bounds the
    // rows fetched, using the widest radius any seller could have. (#H-34)
    const MAX_SERVICE_RADIUS_KM = 100;
    const EARTH_RADIUS_KM = 6378.1;

    const query: Record<string, unknown> = { status: "Approved" };

    const sellers = await Seller.find({
      ...query,
      $or: [
        {
          location: {
            $geoWithin: {
              $centerSphere: [[userLng, userLat], MAX_SERVICE_RADIUS_KM / EARTH_RADIUS_KM],
            },
          },
        },
        // Sellers whose position only exists in the legacy string fields are
        // not indexed geospatially, so they still need the JS pass.
        { location: { $exists: false } },
        { "location.coordinates": { $size: 0 } },
      ],
    }).select("_id location serviceRadiusKm latitude longitude status");

    // Filter sellers where user is within their service radius
    const nearbySellerIds: mongoose.Types.ObjectId[] = [];

    for (const seller of sellers) {
      let sellerLat: number | null = null;
      let sellerLng: number | null = null;

      // Try GeoJSON first
      if (seller.location && seller.location.coordinates && seller.location.coordinates.length === 2) {
        sellerLng = seller.location.coordinates[0];
        sellerLat = seller.location.coordinates[1];
      }
      // Fallback to string fields if GeoJSON missing
      else if (seller.latitude && seller.longitude) {
         sellerLat = parseFloat(seller.latitude);
         sellerLng = parseFloat(seller.longitude);
      }

      if (sellerLat !== null && sellerLng !== null && !isNaN(sellerLat) && !isNaN(sellerLng)) {
        const distance = calculateDistance(
          userLat,
          userLng,
          sellerLat,
          sellerLng
        );
        const serviceRadius = seller.serviceRadiusKm || 10; // Default to 10km if not set

        if (distance <= serviceRadius) {
          nearbySellerIds.push(seller._id as mongoose.Types.ObjectId);
        }
      }
      // Sellers with no location data are excluded — location is mandatory
    }

    return nearbySellerIds;
  } catch (error) {
    console.error("Error finding nearby sellers:", error);
    return [];
  }
}
