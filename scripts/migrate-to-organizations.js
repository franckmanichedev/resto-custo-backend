#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { db } = require('../src/infrastructure/firebase/firebaseAdmin');
const logger = require('../src/shared/utils/logger');
const {
    MigrationService,
    BUSINESS_COLLECTIONS,
    DEFAULT_RESTAURANT_IDS
} = require('../src/services/migrationService');

const args = process.argv.slice(2);

const hasFlag = (flag) => args.includes(flag);
const getOptionValues = (name) => {
    const prefix = `${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) {
        return inline.slice(prefix.length).split(',').map((item) => item.trim()).filter(Boolean);
    }

    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) {
        return args[index + 1].split(',').map((item) => item.trim()).filter(Boolean);
    }

    return [];
};

const printUsage = () => {
    console.log(`
Migration progressive vers organizations/branches.

Usage:
  node scripts/migrate-to-organizations.js [--dry-run]

Options:
  --dry-run                      Simule la migration sans ecrire dans Firestore
  --restaurants=a,b              Limite la migration a certains ids restaurants
  --collections=categories,users Limite les collections metier a traiter
  --help                         Affiche cette aide

Restaurants par defaut:
  ${DEFAULT_RESTAURANT_IDS.join(', ')}

Collections par defaut:
  ${BUSINESS_COLLECTIONS.join(', ')}
`);
};

if (hasFlag('--help')) {
    printUsage();
    process.exit(0);
}

if (!db) {
    console.error('Firestore DB not configured. Aborting.');
    process.exit(1);
}

const dryRun = hasFlag('--dry-run');
const restaurantIds = getOptionValues('--restaurants');
const collections = getOptionValues('--collections');

const migrationService = new MigrationService({ db, logger, dryRun });

migrationService.run({ restaurantIds, collections })
    .then((report) => {
        console.log('\nRapport final migration SaaS');
        console.log(JSON.stringify(report, null, 2));
        process.exit(report.errors.length > 0 ? 2 : 0);
    })
    .catch((error) => {
        logger.error('Migration SaaS echouee', { error: error.message, stack: error.stack });
        process.exit(2);
    });
