import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { storageService } from '../services/storage.service';
import { authService } from '../services/auth.service';
import api from '../services/api';
import toast from 'react-hot-toast';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  tier: 'free' | 'enterprise' | string; // string allows custom tiers added via admin
  ownerId?: string;
  owner_email?: string;
  members_count?: number;
  created_at: string;
}

export interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  isSwitching: boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
  fetchOrganizations: () => Promise<void>;
  createOrganization: (name: string, slug?: string) => Promise<Organization>;
  updateOrganization: (id: string, data: Partial<Organization>) => Promise<void>;
  deleteOrganization: (id: string) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

interface OrganizationProviderProps {
  children: React.ReactNode;
}

export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  // Track if we've already fetched to prevent duplicate calls
  const [hasFetched, setHasFetched] = useState(false);

  // Fetch organizations for current user
  const fetchOrganizations = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setIsLoading(true);
      const response = await api.get('/organizations/user');
      const data = response.data;
      setOrganizations(data);

      // Check for saved org in storage, or use first one
      const savedOrgId = storageService.getCurrentOrgId();
      if (data.length > 0) {
        const savedOrg = savedOrgId ? data.find((org: Organization) => org.id === savedOrgId) : null;
        const orgToSet = savedOrg || data[0];
        setCurrentOrganization(orgToSet);
        storageService.setCurrentOrgId(orgToSet.id);
      }
    } catch (error: unknown) {
      toast.error('Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Initialize organizations on auth - only once
  useEffect(() => {
    if (isAuthenticated && user && !hasFetched) {
      setHasFetched(true);
      fetchOrganizations();
    }
    // Reset hasFetched when user logs out
    if (!isAuthenticated) {
      setHasFetched(false);
      setOrganizations([]);
      setCurrentOrganization(null);
    }
  }, [isAuthenticated, user, hasFetched, fetchOrganizations]);

  const switchOrganization = useCallback(async (organizationId: string) => {
    try {
      const org = organizations.find(o => o.id === organizationId);
      if (!org) throw new Error('Organization not found');

      // Don't switch if already on this org
      if (currentOrganization?.id === organizationId) return;

      setIsSwitching(true);

      // Call backend to get new token with the target org context
      const response = await authService.switchOrganization(organizationId);

      // Store the new access token
      storageService.setAuthToken(response.accessToken);
      storageService.setCurrentOrgId(organizationId);

      // Update local state
      setCurrentOrganization(org);

      // Invalidate all queries to refetch with new org context
      await queryClient.invalidateQueries();

      toast.success(`Switched to ${org.name}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to switch organization';
      toast.error(message);
      throw error;
    } finally {
      setIsSwitching(false);
    }
  }, [organizations, currentOrganization?.id, queryClient]);

  const createOrganization = useCallback(async (name: string, slug?: string): Promise<Organization> => {
    try {
      setIsLoading(true);
      const response = await api.post('/organizations', { name, slug });
      const org: Organization = response.data;

      setOrganizations(prev => [...prev, org]);
      setCurrentOrganization(org);
      storageService.setCurrentOrgId(org.id);

      return org;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create organization';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateOrganization = useCallback(async (id: string, data: Partial<Organization>) => {
    try {
      setIsLoading(true);
      const response = await api.patch(`/organizations/${id}`, data);
      const updated: Organization = response.data;

      setOrganizations(prev => prev.map(org => org.id === id ? updated : org));
      if (currentOrganization?.id === id) {
        setCurrentOrganization(updated);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update organization';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization]);

  const deleteOrganization = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      await api.delete(`/organizations/${id}`);

      // Use functional state update to avoid race condition
      // We need to calculate remaining orgs based on the current state,
      // not the closure value which may be stale
      setOrganizations(prevOrgs => {
        const remaining = prevOrgs.filter(org => org.id !== id);

        // If we're deleting the current org, schedule the switch
        // Use setTimeout(0) to ensure this runs after state updates
        if (currentOrganization?.id === id) {
          setTimeout(() => {
            if (remaining.length > 0) {
              setCurrentOrganization(remaining[0]);
              storageService.setCurrentOrgId(remaining[0].id);
            } else {
              setCurrentOrganization(null);
              storageService.remove('CURRENT_ORG_ID');
            }
          }, 0);
        }

        return remaining;
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete organization';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(
    () => ({
      organizations,
      currentOrganization,
      isLoading,
      isSwitching,
      switchOrganization,
      fetchOrganizations,
      createOrganization,
      updateOrganization,
      deleteOrganization,
    }),
    [
      organizations,
      currentOrganization,
      isLoading,
      isSwitching,
      switchOrganization,
      fetchOrganizations,
      createOrganization,
      updateOrganization,
      deleteOrganization,
    ]
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};
