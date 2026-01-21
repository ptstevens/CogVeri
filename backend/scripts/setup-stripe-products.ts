#!/usr/bin/env npx ts-node
/**
 * Stripe Products & Prices Setup Script
 *
 * Creates the required products and prices in Stripe for CogVeri billing.
 * Run this script once per environment (test/production).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx npx ts-node scripts/setup-stripe-products.ts
 *   STRIPE_SECRET_KEY=sk_live_xxx npx ts-node scripts/setup-stripe-products.ts
 *
 * Output: Prints environment variables to add to .env
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ Error: STRIPE_SECRET_KEY environment variable is required');
  console.error('');
  console.error('Usage:');
  console.error('  STRIPE_SECRET_KEY=sk_test_xxx npx ts-node scripts/setup-stripe-products.ts');
  console.error('  STRIPE_SECRET_KEY=sk_live_xxx npx ts-node scripts/setup-stripe-products.ts');
  process.exit(1);
}

const isTestMode = STRIPE_SECRET_KEY.startsWith('sk_test_');
console.log(`\n🔧 Stripe Setup Script - ${isTestMode ? 'TEST MODE' : '⚠️  PRODUCTION MODE'}\n`);

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
});

interface TierConfig {
  name: string;
  description: string;
  monthlyPrice: number; // in cents
  yearlyPrice: number; // in cents
  features: string[];
}

const TIERS: Record<string, TierConfig> = {
  pro: {
    name: 'Pro',
    description: 'For individual creators and small teams getting started',
    monthlyPrice: 1500, // $15
    yearlyPrice: 14400, // $144 ($12/mo)
    features: [
      'Up to 1 team member',
      '50GB storage',
      '100 tasks/month',
      '50 recordings/month',
      'HD recording (1080p)',
      'Email support',
    ],
  },
  team: {
    name: 'Team',
    description: 'For growing teams that need collaboration features',
    monthlyPrice: 2200, // $22
    yearlyPrice: 21100, // $211 ($17.60/mo)
    features: [
      'Up to 50 team members',
      '500GB storage',
      'Unlimited tasks',
      '500 recordings/month',
      '4K recording',
      'Advanced analytics',
      'API access',
      'Priority support',
    ],
  },
  business: {
    name: 'Business',
    description: 'For organizations that need advanced features and control',
    monthlyPrice: 3500, // $35
    yearlyPrice: 33600, // $336 ($28/mo)
    features: [
      'Up to 200 team members',
      '2TB storage',
      'Unlimited tasks & recordings',
      'Custom branding',
      'Advanced permissions',
      'Audit logging',
      'Dedicated support',
    ],
  },
};

async function createProductsAndPrices(): Promise<void> {
  const results: Record<string, { productId: string; monthlyPriceId: string; yearlyPriceId: string }> = {};

  for (const [tierKey, config] of Object.entries(TIERS)) {
    console.log(`\n📦 Creating ${config.name} tier...`);

    // Check if product already exists
    const existingProducts = await stripe.products.search({
      query: `metadata['tier']:'${tierKey}'`,
    });

    let product: Stripe.Product;

    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      console.log(`   ✓ Product already exists: ${product.id}`);
    } else {
      // Create product
      product = await stripe.products.create({
        name: `CogVeri ${config.name}`,
        description: config.description,
        metadata: {
          tier: tierKey,
          app: 'cogveri',
        },
        // Note: Features are displayed in Stripe Dashboard but set via marketing_features API
      });
      console.log(`   ✓ Created product: ${product.id}`);
    }

    // Check for existing prices
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
    });

    let monthlyPrice = existingPrices.data.find(
      (p) => p.recurring?.interval === 'month' && p.unit_amount === config.monthlyPrice
    );
    let yearlyPrice = existingPrices.data.find(
      (p) => p.recurring?.interval === 'year' && p.unit_amount === config.yearlyPrice
    );

    // Create monthly price if not exists
    if (!monthlyPrice) {
      monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: config.monthlyPrice,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
        metadata: {
          tier: tierKey,
          interval: 'monthly',
        },
      });
      console.log(`   ✓ Created monthly price: ${monthlyPrice.id} ($${config.monthlyPrice / 100}/mo)`);
    } else {
      console.log(`   ✓ Monthly price exists: ${monthlyPrice.id}`);
    }

    // Create yearly price if not exists
    if (!yearlyPrice) {
      yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: config.yearlyPrice,
        currency: 'usd',
        recurring: {
          interval: 'year',
        },
        metadata: {
          tier: tierKey,
          interval: 'yearly',
        },
      });
      console.log(`   ✓ Created yearly price: ${yearlyPrice.id} ($${config.yearlyPrice / 100}/yr)`);
    } else {
      console.log(`   ✓ Yearly price exists: ${yearlyPrice.id}`);
    }

    results[tierKey] = {
      productId: product.id,
      monthlyPriceId: monthlyPrice.id,
      yearlyPriceId: yearlyPrice.id,
    };
  }

  // Output environment variables
  console.log('\n' + '='.repeat(60));
  console.log('📋 Add these to your environment variables:');
  console.log('='.repeat(60) + '\n');

  console.log('# Stripe Price IDs');
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${results.pro.monthlyPriceId}`);
  console.log(`STRIPE_PRICE_PRO_YEARLY=${results.pro.yearlyPriceId}`);
  console.log(`STRIPE_PRICE_TEAM_MONTHLY=${results.team.monthlyPriceId}`);
  console.log(`STRIPE_PRICE_TEAM_YEARLY=${results.team.yearlyPriceId}`);
  console.log(`STRIPE_PRICE_BUSINESS_MONTHLY=${results.business.monthlyPriceId}`);
  console.log(`STRIPE_PRICE_BUSINESS_YEARLY=${results.business.yearlyPriceId}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Stripe products and prices setup complete!');
  console.log('='.repeat(60) + '\n');

  // Webhook reminder
  console.log('📌 Next steps:');
  console.log('   1. Set up webhook endpoint in Stripe Dashboard:');
  console.log('      https://dashboard.stripe.com/webhooks');
  console.log('');
  console.log('   2. Webhook URL (production):');
  console.log('      https://api.cogveri.com/api/webhooks/stripe');
  console.log('');
  console.log('   3. Select these webhook events:');
  console.log('      • checkout.session.completed');
  console.log('      • customer.subscription.created');
  console.log('      • customer.subscription.updated');
  console.log('      • customer.subscription.deleted');
  console.log('      • invoice.payment_succeeded');
  console.log('      • invoice.payment_failed');
  console.log('      • invoice.payment_action_required');
  console.log('      • customer.updated');
  console.log('');
  console.log('   4. Copy the webhook signing secret (whsec_...) to:');
  console.log('      STRIPE_WEBHOOK_SECRET=whsec_xxx');
  console.log('');
}

// Run the setup
createProductsAndPrices().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
