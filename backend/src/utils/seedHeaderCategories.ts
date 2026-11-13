import HeaderCategory from '../models/HeaderCategory';

const DEFAULT_CATEGORIES = [
    {
        name: 'Wedding',
        iconLibrary: 'Custom', // Using 'Custom' to indicate it maps to internal SVGs
        iconName: 'wedding',
        slug: 'wedding',
        status: 'Published',
        order: 1
    },
    {
        name: 'Winter',
        iconLibrary: 'Custom',
        iconName: 'winter',
        slug: 'winter',
        status: 'Published',
        order: 2
    },
    {
        name: 'Electronics',
        iconLibrary: 'Custom',
        iconName: 'electronics',
        slug: 'electronics',
        status: 'Published',
        order: 3
    },
    {
        name: 'Beauty',
        iconLibrary: 'Custom',
        iconName: 'beauty',
        slug: 'beauty',
        status: 'Published',
        order: 4
    },
    {
        name: 'Grocery',
        iconLibrary: 'Custom',
        iconName: 'grocery',
        slug: 'grocery',
        status: 'Published',
        order: 5
    },
    {
        name: 'Fashion',
        iconLibrary: 'Custom',
        iconName: 'fashion',
        slug: 'fashion',
        status: 'Published',
        order: 6
    },
    {
        name: 'Sports',
        iconLibrary: 'Custom',
        iconName: 'sports',
        slug: 'sports',
        status: 'Published',
        order: 7
    },
    {
        name: 'Medical',
        iconLibrary: 'Custom',
        iconName: 'medical',
        slug: 'medical',
        status: 'Published',
        order: 8
    },
    {
        name: 'Hardware',
        iconLibrary: 'Custom',
        iconName: 'hardware',
        slug: 'hardware',
        status: 'Published',
        order: 9
    },
    {
        name: 'Stationery',
        iconLibrary: 'Custom',
        iconName: 'stationery',
        slug: 'stationery',
        status: 'Published',
        order: 10
    }
];

export async function seedHeaderCategories() {
    try {
        const count = await HeaderCategory.countDocuments();
        if (count > 0) {
            console.log('Header categories already exist. Skipping seed.');
            return;
        }

        await HeaderCategory.insertMany(DEFAULT_CATEGORIES);
        console.log('Default header categories seeded successfully.');
    } catch (error) {
        console.error('Error seeding header categories:', error);
    }
}

/**
 * Manual, one-off top-up (NOT run on server start): adds any default header
 * category that is missing by slug or name, e.g. Medical / Hardware / Stationery
 * on an existing database. Existing headers are never modified.
 * Run with: npm run seed:missing-header-categories
 */
export async function seedMissingHeaderCategories(): Promise<string[]> {
    const added: string[] = [];
    for (const cat of DEFAULT_CATEGORIES) {
        const exists = await HeaderCategory.findOne({
            $or: [{ slug: cat.slug }, { name: { $regex: new RegExp(`^${cat.name}$`, 'i') } }],
        });
        if (!exists) {
            await HeaderCategory.create(cat);
            added.push(cat.name);
        }
    }
    return added;
}
