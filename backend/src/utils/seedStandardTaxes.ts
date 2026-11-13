import Tax from "../models/Tax";

export const STANDARD_GST_SLABS = [
  { name: "GST 0%", percentage: 0 },
  { name: "GST 5%", percentage: 5 },
  { name: "GST 12%", percentage: 12 },
  { name: "GST 18%", percentage: 18 },
  { name: "GST 28%", percentage: 28 },
];

/**
 * Ensures standard Indian statutory GST tax slabs exist in the database.
 * If a slab is missing, it is created with status "Active".
 * Existing tax slabs (active or inactive) are preserved without overwriting admin settings.
 */
export async function seedStandardTaxes(): Promise<void> {
  try {
    for (const slab of STANDARD_GST_SLABS) {
      const existing = await Tax.findOne({
        $or: [
          { percentage: slab.percentage },
          { name: slab.name },
        ],
      });

      if (!existing) {
        await Tax.create({
          name: slab.name,
          percentage: slab.percentage,
          status: "Active",
        });
        console.log(`[Taxes] Created standard slab: ${slab.name}`);
      }
    }
  } catch (error) {
    console.error("[Taxes] Error verifying standard GST slabs:", error);
  }
}

export default seedStandardTaxes;
