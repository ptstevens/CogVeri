/**
 * One-time script to provision default templates for existing organizations
 * Run with: npx ts-node scripts/provision-existing-org-templates.ts
 */

import { db } from '../src/config/database';
import taskTemplateService from '../src/services/task-template.service';
import { logger } from '../src/utils/logger';

async function provisionExistingOrgTemplates() {
  console.log('Starting template provisioning for existing organizations...\n');

  try {
    // Get all organizations
    const organizations = await db('organizations').select('id', 'name');
    console.log(`Found ${organizations.length} organizations\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const org of organizations) {
      try {
        // Check if org already has templates
        const existingTemplates = await db('task_templates')
          .where('organization_id', org.id)
          .count('* as count')
          .first();

        const templateCount = parseInt(existingTemplates?.count as string) || 0;

        if (templateCount > 0) {
          console.log(`⏭️  Skipping ${org.name} (${org.id}) - already has ${templateCount} templates`);
          skipCount++;
          continue;
        }

        // Get system admin user ID for created_by (fallback to first user in org)
        let createdByUserId: string;

        const systemAdmin = await db('users')
          .where('is_system_admin', true)
          .first();

        if (systemAdmin) {
          createdByUserId = systemAdmin.id;
        } else {
          // Fallback: try to find owner of this org
          const orgOwner = await db('users')
            .where('organization_id', org.id)
            .where('org_role', 'owner')
            .first();

          if (orgOwner) {
            createdByUserId = orgOwner.id;
          } else {
            // Last fallback: first user in org
            const firstUser = await db('users')
              .where('organization_id', org.id)
              .first();

            if (!firstUser) {
              console.log(`⚠️  Skipping ${org.name} (${org.id}) - no users found`);
              skipCount++;
              continue;
            }
            createdByUserId = firstUser.id;
          }
        }

        // Provision templates
        const templates = await taskTemplateService.provisionDefaultTemplates(org.id, createdByUserId);
        console.log(`✅ Provisioned ${templates.length} templates for ${org.name} (${org.id})`);
        successCount++;
      } catch (error) {
        console.error(`❌ Error provisioning templates for ${org.name} (${org.id}):`, error);
        errorCount++;
      }
    }

    console.log('\n========================================');
    console.log('Template provisioning complete!');
    console.log(`✅ Success: ${successCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Fatal error during provisioning:', error);
    process.exit(1);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

// Run the script
provisionExistingOrgTemplates();
