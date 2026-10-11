import { orgContext } from './enhanced-auth.middleware';

/**
 * Get the current organization context from AsyncLocalStorage
 * Returns the orgId and orgSlug from the current async context
 */
export const getAsyncContext = () => {
  const context = orgContext?.getStore?.();
  if (!context) {
    return null;
  }

  return {
    organization_id: context.orgId,
    org_slug: context.orgSlug,
  };
};

export default { getAsyncContext };
