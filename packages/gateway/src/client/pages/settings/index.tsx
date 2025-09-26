import { Alert, Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconClock, IconDatabase, IconInfoCircle, IconSettings, IconShield } from '@tabler/icons-react';
import React, { useCallback, useEffect, useState } from 'react';
import {
  authenticatedFetch,
  getTokenTimeToExpiry,
  isAutoRefreshEnabled,
  refreshAuthToken,
  setAutoRefreshEnabled
} from '../../utils/auth';
import { AIDocsCard } from './components/AIDocsCard';
import { AuditRetentionCard } from './components/AuditRetentionCard';
import { FeatureToggleCardProps } from './components/FeatureToggleCard';
import { FeatureTogglesSection } from './components/FeatureTogglesSection';
import { HowItWorksCard } from './components/HowItWorksCard';
import { DocumentationMode, PublicDocsModeCard } from './components/PublicDocsModeCard';
import { ResponseCacheCard } from './components/ResponseCacheCard';
import { SessionRefreshCard } from './components/SessionRefreshCard';
import { SessionStatusCard } from './components/SessionStatusCard';

export const SessionSettings: React.FC = () => {
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(true);
  const [timeToExpiry, setTimeToExpiry] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [auditRetention, setAuditRetention] = useState<number | null>(null);
  const [auditInitial, setAuditInitial] = useState<number | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [docsMode, setDocsMode] = useState<DocumentationMode | null>(null);
  const [docsModeInitial, setDocsModeInitial] = useState<DocumentationMode | null>(null);
  const [docsModeError, setDocsModeError] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<'OPENAI'>('OPENAI');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
  const [aiModel, setAiModel] = useState<string>('');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [aiBaseUrlInitial, setAiBaseUrlInitial] = useState<string>('');
  const [aiModelInitial, setAiModelInitial] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiKeySet, setAiKeySet] = useState<boolean>(false);
  const [genBusy, setGenBusy] = useState<boolean>(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [enforceDownstream, setEnforceDownstream] = useState<boolean | null>(null);
  const [enforceDownstreamInitial, setEnforceDownstreamInitial] = useState<boolean | null>(null);
  const [enforceSaving, setEnforceSaving] = useState<boolean>(false);
  const [enforceError, setEnforceError] = useState<string | null>(null);
  const [graphqlVoyagerEnabled, setGraphqlVoyagerEnabled] = useState<boolean | null>(null);
  const [graphqlVoyagerInitial, setGraphqlVoyagerInitial] = useState<boolean | null>(null);
  const [voyagerSaving, setVoyagerSaving] = useState<boolean>(false);
  const [voyagerError, setVoyagerError] = useState<string | null>(null);
  const [graphqlPlaygroundEnabled, setGraphqlPlaygroundEnabled] = useState<boolean | null>(null);
  const [graphqlPlaygroundInitial, setGraphqlPlaygroundInitial] = useState<boolean | null>(null);
  const [playgroundSaving, setPlaygroundSaving] = useState<boolean>(false);
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);
  const [latencyTrackingEnabled, setLatencyTrackingEnabled] = useState<boolean | null>(null);
  const [latencyTrackingInitial, setLatencyTrackingInitial] = useState<boolean | null>(null);
  const [latencySaving, setLatencySaving] = useState<boolean>(false);
  const [latencyError, setLatencyError] = useState<string | null>(null);
  const [rcLoading, setRcLoading] = useState<boolean>(true);
  const [rcError, setRcError] = useState<string | null>(null);
  const [rcEnabled, setRcEnabled] = useState<boolean | null>(null);
  const [rcEnabledInitial, setRcEnabledInitial] = useState<boolean | null>(null);
  const [rcTtlMs, setRcTtlMs] = useState<number | null>(null);
  const [rcTtlInitial, setRcTtlInitial] = useState<number | null>(null);
  const [rcIncludeExt, setRcIncludeExt] = useState<boolean | null>(null);
  const [rcIncludeExtInitial, setRcIncludeExtInitial] = useState<boolean | null>(null);
  const [rcScope, setRcScope] = useState<'global' | 'per-session' | null>(null);
  const [rcScopeInitial, setRcScopeInitial] = useState<'global' | 'per-session' | null>(null);
  const [rcClearing, setRcClearing] = useState<boolean>(false);
  const [rcClearMsg, setRcClearMsg] = useState<string | null>(null);
  const [rcTtlPerType, setRcTtlPerType] = useState<Record<string, number>>({});
  const [rcTtlPerTypeInitial, setRcTtlPerTypeInitial] = useState<Record<string, number>>({});
  const [rcTtlPerCoord, setRcTtlPerCoord] = useState<Record<string, number>>({});
  const [rcTtlPerCoordInitial, setRcTtlPerCoordInitial] = useState<Record<string, number>>({});
  const [rcTtlErr, setRcTtlErr] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load current settings
    setAutoRefreshEnabledState(isAutoRefreshEnabled());
    setTimeToExpiry(getTokenTimeToExpiry());

    // Update time every 30 seconds
    const interval = setInterval(() => {
      setTimeToExpiry(getTokenTimeToExpiry());
    }, 30 * 1000);

    // Fetch settings (admin only route - if unauthorized we silently ignore)
    (async () => {
      try {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query Settings {
              settings {
                auditLogRetentionDays
                publicDocumentationMode
                enforceDownstreamAuth
                graphqlVoyagerEnabled
                graphqlPlaygroundEnabled
                latencyTrackingEnabled
                responseCacheEnabled
                responseCacheTtlMs
                responseCacheIncludeExtensions
                responseCacheScope
                responseCacheTtlPerType
                responseCacheTtlPerSchemaCoordinate
              }
            }`
          })
        });
        const data = await res.json();
        if (data?.data?.settings) {
          const settings = data.data.settings;
          setAuditRetention(settings.auditLogRetentionDays);
          setAuditInitial(settings.auditLogRetentionDays);

          if (settings.publicDocumentationMode) {
            const mode = settings.publicDocumentationMode as DocumentationMode;
            setDocsMode(mode);
            setDocsModeInitial(mode);
          }

          if (typeof settings.enforceDownstreamAuth === 'boolean') {
            setEnforceDownstream(settings.enforceDownstreamAuth);
            setEnforceDownstreamInitial(settings.enforceDownstreamAuth);
          }

          if (typeof settings.graphqlVoyagerEnabled === 'boolean') {
            setGraphqlVoyagerEnabled(settings.graphqlVoyagerEnabled);
            setGraphqlVoyagerInitial(settings.graphqlVoyagerEnabled);
          }

          if (typeof settings.graphqlPlaygroundEnabled === 'boolean') {
            setGraphqlPlaygroundEnabled(settings.graphqlPlaygroundEnabled);
            setGraphqlPlaygroundInitial(settings.graphqlPlaygroundEnabled);
          }

          if (typeof settings.latencyTrackingEnabled === 'boolean') {
            setLatencyTrackingEnabled(settings.latencyTrackingEnabled);
            setLatencyTrackingInitial(settings.latencyTrackingEnabled);
          }

          if (typeof settings.responseCacheEnabled === 'boolean') {
            setRcEnabled(settings.responseCacheEnabled);
            setRcEnabledInitial(settings.responseCacheEnabled);
          }
          if (typeof settings.responseCacheTtlMs === 'number') {
            setRcTtlMs(settings.responseCacheTtlMs);
            setRcTtlInitial(settings.responseCacheTtlMs);
          }
          if (typeof settings.responseCacheIncludeExtensions === 'boolean') {
            setRcIncludeExt(settings.responseCacheIncludeExtensions);
            setRcIncludeExtInitial(settings.responseCacheIncludeExtensions);
          }
          if (typeof settings.responseCacheScope === 'string') {
            const scope = (settings.responseCacheScope as 'global' | 'per-session') || 'global';
            setRcScope(scope);
            setRcScopeInitial(scope);
          }
          if (settings.responseCacheTtlPerType && typeof settings.responseCacheTtlPerType === 'object') {
            setRcTtlPerType(settings.responseCacheTtlPerType);
            setRcTtlPerTypeInitial(settings.responseCacheTtlPerType);
          }
          if (
            settings.responseCacheTtlPerSchemaCoordinate &&
            typeof settings.responseCacheTtlPerSchemaCoordinate === 'object'
          ) {
            setRcTtlPerCoord(settings.responseCacheTtlPerSchemaCoordinate);
            setRcTtlPerCoordInitial(settings.responseCacheTtlPerSchemaCoordinate);
          }
        }
      } catch (e: any) {
        setAuditError(e?.message || 'Failed to load settings');
        setRcError(e?.message || 'Failed to load settings');
      } finally {
        setAuditLoading(false);
        setRcLoading(false);
      }
    })();

    // Load AI docs config (best-effort; ignore errors in non-admin contexts)
    (async () => {
      try {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { aiDocsConfig { provider baseUrl model apiKeySet } }`
          })
        });
        const json = await res.json();
        if (json?.data?.aiDocsConfig) {
          const baseUrl = json.data.aiDocsConfig.baseUrl || '';
          const model = json.data.aiDocsConfig.model || 'gpt-5-mini';
          setAiProvider('OPENAI');
          setAiBaseUrl(baseUrl);
          setAiModel(model);
          setAiBaseUrlInitial(baseUrl);
          setAiModelInitial(model);
          setAiKeySet(!!json.data.aiDocsConfig.apiKeySet);
        } else {
          setAiBaseUrlInitial('');
          setAiModelInitial('gpt-5-mini');
        }
      } catch (error) {
        // ignore silently for non-admin users
      } finally {
        setAiLoading(false);
      }
    })();

    return () => clearInterval(interval);
  }, []);

  const handleAutoRefreshToggle = (enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
    setAutoRefreshEnabledState(enabled);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshAuthToken();
      setTimeToExpiry(getTokenTimeToExpiry());
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
    setIsRefreshing(false);
  };

  const hasResponseCacheChanges =
    rcEnabled !== rcEnabledInitial ||
    rcTtlMs !== rcTtlInitial ||
    rcIncludeExt !== rcIncludeExtInitial ||
    rcScope !== rcScopeInitial ||
    JSON.stringify(rcTtlPerType) !== JSON.stringify(rcTtlPerTypeInitial) ||
    JSON.stringify(rcTtlPerCoord) !== JSON.stringify(rcTtlPerCoordInitial);

  const handleResponseCacheSave = useCallback(async (): Promise<boolean> => {
    if (!hasResponseCacheChanges) {
      return true;
    }
    setRcError(null);
    try {
      const ops: Promise<any>[] = [];
      if (rcEnabled !== rcEnabledInitial && rcEnabled !== null) {
        ops.push(
          authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation Set($enabled:Boolean!){ setResponseCacheEnabled(enabled:$enabled) }`,
              variables: { enabled: rcEnabled }
            })
          }).then((r) => r.json())
        );
      }
      if (rcTtlMs !== rcTtlInitial && rcTtlMs !== null) {
        ops.push(
          authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation Set($ttlMs:Int!){ setResponseCacheTtlMs(ttlMs:$ttlMs) }`,
              variables: { ttlMs: rcTtlMs }
            })
          }).then((r) => r.json())
        );
      }
      if (rcIncludeExt !== rcIncludeExtInitial && rcIncludeExt !== null) {
        ops.push(
          authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation Set($enabled:Boolean!){ setResponseCacheIncludeExtensions(enabled:$enabled) }`,
              variables: { enabled: rcIncludeExt }
            })
          }).then((r) => r.json())
        );
      }
      if (rcScope !== rcScopeInitial && rcScope) {
        ops.push(
          authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation Set($scope:String!){ setResponseCacheScope(scope:$scope) }`,
              variables: { scope: rcScope }
            })
          }).then((r) => r.json())
        );
      }
      if (JSON.stringify(rcTtlPerType) !== JSON.stringify(rcTtlPerTypeInitial)) {
        ops.push(
          authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation Set($map: JSON!){ setResponseCacheTtlPerType(map:$map) }`,
              variables: { map: rcTtlPerType }
            })
          }).then((r) => r.json())
        );
      }
      if (JSON.stringify(rcTtlPerCoord) !== JSON.stringify(rcTtlPerCoordInitial)) {
        ops.push(
          authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation Set($map: JSON!){ setResponseCacheTtlPerSchemaCoordinate(map:$map) }`,
              variables: { map: rcTtlPerCoord }
            })
          }).then((r) => r.json())
        );
      }
      const results = await Promise.all(ops);
      const err = results.find((j) => j?.errors?.length);
      if (err) throw new Error(err.errors[0]?.message || 'Failed to save');

      setRcEnabledInitial(rcEnabled);
      setRcTtlInitial(rcTtlMs);
      setRcIncludeExtInitial(rcIncludeExt);
      setRcScopeInitial(rcScope);
      setRcTtlPerTypeInitial(rcTtlPerType);
      setRcTtlPerCoordInitial(rcTtlPerCoord);
      return true;
    } catch (e: any) {
      setRcError(e?.message || 'Failed to save');
      return false;
    }
  }, [
    rcEnabled,
    rcEnabledInitial,
    rcTtlMs,
    rcTtlInitial,
    rcIncludeExt,
    rcIncludeExtInitial,
    rcScope,
    rcScopeInitial,
    rcTtlPerType,
    rcTtlPerTypeInitial,
    rcTtlPerCoord,
    rcTtlPerCoordInitial,
    hasResponseCacheChanges
  ]);

  const handleResponseCacheReset = useCallback(() => {
    setRcEnabled(rcEnabledInitial);
    setRcTtlMs(rcTtlInitial);
    setRcIncludeExt(rcIncludeExtInitial);
    setRcScope(rcScopeInitial);
    setRcTtlPerType(rcTtlPerTypeInitial);
    setRcTtlPerCoord(rcTtlPerCoordInitial);
    setRcTtlErr(null);
  }, [rcEnabledInitial, rcTtlInitial, rcIncludeExtInitial, rcScopeInitial, rcTtlPerTypeInitial, rcTtlPerCoordInitial]);

  const handleClearResponseCache = useCallback(async () => {
    setRcClearing(true);
    setRcClearMsg(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { clearResponseCache }`
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to clear');
      setRcClearMsg('Cache cleared');
    } catch (e: any) {
      setRcClearMsg(e?.message || 'Failed to clear');
    } finally {
      setRcClearing(false);
    }
  }, []);

  const handleAIDocsSave = useCallback(async (): Promise<boolean> => {
    if (aiBaseUrl === aiBaseUrlInitial && aiModel === aiModelInitial && !aiApiKey) {
      return true;
    }
    setAiError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Set($input:SetAIDocsConfigInput!) { setAIDocsConfig(input:$input) }`,
          variables: {
            input: {
              provider: 'OPENAI',
              baseUrl: aiBaseUrl || null,
              model: aiModel || null,
              apiKey: aiApiKey || null
            }
          }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to save');
      setAiApiKey('');
      setAiKeySet(true);
      setAiBaseUrlInitial(aiBaseUrl || '');
      setAiModelInitial(aiModel || '');
      return true;
    } catch (e: any) {
      setAiError(e?.message || 'Failed to save');
      return false;
    }
  }, [aiApiKey, aiBaseUrl, aiModel, aiBaseUrlInitial, aiModelInitial]);

  const handleGenerateDocs = useCallback(async () => {
    setGenBusy(true);
    setGenMsg(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { generateDocsFromSDL(options: { publish: true }) { created updated } }`
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Generation failed');
      setGenMsg(
        `Generated: ${json.data.generateDocsFromSDL.created} created, ${json.data.generateDocsFromSDL.updated} updated`
      );
    } catch (e: any) {
      setGenMsg(e?.message || 'Failed to generate');
    } finally {
      setGenBusy(false);
    }
  }, []);

  const handleGenerationComplete = useCallback((result: { totalDocuments: number; totalServices: number }) => {
    setGenMsg(`Generated: ${result.totalDocuments} documents for ${result.totalServices} services`);
  }, []);

  const handleGenerationError = useCallback((message: string) => {
    setGenMsg(message);
  }, []);

  const handleAuditSave = useCallback(async (): Promise<boolean> => {
    if (auditRetention === null || auditRetention === auditInitial) {
      return true;
    }
    setAuditError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation UpdateRetention($days: Int!) { updateAuditLogRetentionDays(days: $days) }`,
          variables: { days: auditRetention }
        })
      });
      const json = await res.json();
      if (json.errors) {
        throw new Error(json.errors[0]?.message || 'Update failed');
      }
      setAuditInitial(auditRetention);
      return true;
    } catch (e: any) {
      setAuditError(e?.message || 'Failed to update retention');
      return false;
    }
  }, [auditRetention, auditInitial]);

  const handleDocsModeSave = useCallback(async (): Promise<boolean> => {
    if (docsMode === null || docsMode === docsModeInitial) {
      return true;
    }
    setDocsModeError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation SetDocsMode($mode: PublicDocumentationMode!) { setPublicDocumentationMode(mode: $mode) }`,
          variables: { mode: docsMode }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Update failed');
      setDocsModeInitial(docsMode);
      return true;
    } catch (e: any) {
      setDocsModeError(e?.message || 'Failed to update mode');
      return false;
    }
  }, [docsMode, docsModeInitial]);

  const handleEnforceSave = useCallback(async (): Promise<boolean> => {
    if (enforceDownstream === null || enforceDownstream === enforceDownstreamInitial) {
      return true;
    }
    setEnforceSaving(true);
    setEnforceError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Set($enabled:Boolean!){ setEnforceDownstreamAuth(enabled:$enabled) }`,
          variables: { enabled: enforceDownstream }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to save');
      setEnforceDownstreamInitial(enforceDownstream);
      return true;
    } catch (e: any) {
      setEnforceError(e?.message || 'Failed to save');
      return false;
    } finally {
      setEnforceSaving(false);
    }
  }, [enforceDownstream, enforceDownstreamInitial]);

  const handleVoyagerSave = useCallback(async (): Promise<boolean> => {
    if (graphqlVoyagerEnabled === null || graphqlVoyagerEnabled === graphqlVoyagerInitial) {
      return true;
    }
    setVoyagerSaving(true);
    setVoyagerError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Set($enabled:Boolean!){ setGraphQLVoyagerEnabled(enabled:$enabled) }`,
          variables: { enabled: graphqlVoyagerEnabled }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to save');
      setGraphqlVoyagerInitial(graphqlVoyagerEnabled);
      return true;
    } catch (e: any) {
      setVoyagerError(e?.message || 'Failed to save');
      return false;
    } finally {
      setVoyagerSaving(false);
    }
  }, [graphqlVoyagerEnabled, graphqlVoyagerInitial]);

  const handlePlaygroundSave = useCallback(async (): Promise<boolean> => {
    if (graphqlPlaygroundEnabled === null || graphqlPlaygroundEnabled === graphqlPlaygroundInitial) {
      return true;
    }
    setPlaygroundSaving(true);
    setPlaygroundError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Set($enabled:Boolean!){ setGraphQLPlaygroundEnabled(enabled:$enabled) }`,
          variables: { enabled: graphqlPlaygroundEnabled }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to save');
      setGraphqlPlaygroundInitial(graphqlPlaygroundEnabled);
      return true;
    } catch (e: any) {
      setPlaygroundError(e?.message || 'Failed to save');
      return false;
    } finally {
      setPlaygroundSaving(false);
    }
  }, [graphqlPlaygroundEnabled, graphqlPlaygroundInitial]);

  const handleLatencySave = useCallback(async (): Promise<boolean> => {
    if (latencyTrackingEnabled === null || latencyTrackingEnabled === latencyTrackingInitial) {
      return true;
    }
    setLatencySaving(true);
    setLatencyError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Set($enabled:Boolean!){ setLatencyTrackingEnabled(enabled:$enabled) }`,
          variables: { enabled: latencyTrackingEnabled }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to save');
      setLatencyTrackingInitial(latencyTrackingEnabled);
      return true;
    } catch (e: any) {
      setLatencyError(e?.message || 'Failed to save');
      return false;
    } finally {
      setLatencySaving(false);
    }
  }, [latencyTrackingEnabled, latencyTrackingInitial]);

  const resetEnforceDownstream = useCallback(() => {
    if (enforceDownstreamInitial !== null) {
      setEnforceDownstream(enforceDownstreamInitial);
    }
  }, [enforceDownstreamInitial]);

  const resetVoyager = useCallback(() => {
    if (graphqlVoyagerInitial !== null) {
      setGraphqlVoyagerEnabled(graphqlVoyagerInitial);
    }
  }, [graphqlVoyagerInitial]);

  const resetPlayground = useCallback(() => {
    if (graphqlPlaygroundInitial !== null) {
      setGraphqlPlaygroundEnabled(graphqlPlaygroundInitial);
    }
  }, [graphqlPlaygroundInitial]);

  const resetLatency = useCallback(() => {
    if (latencyTrackingInitial !== null) {
      setLatencyTrackingEnabled(latencyTrackingInitial);
    }
  }, [latencyTrackingInitial]);

  const featureToggleItems: FeatureToggleCardProps[] = [
    {
      id: 'enforce-downstream-auth',
      icon: <IconShield size={20} />,
      title: 'Downstream Service Authentication',
      headline: 'Require authentication for downstream service calls',
      helperText:
        'All requests routed through the gateway must include either an Application API key or an authenticated user session before reaching downstream services.',
      value: enforceDownstream,
      loading: auditLoading,
      error: enforceError,
      onChange: (value) => setEnforceDownstream(value),
      actions:
        enforceDownstreamInitial !== null && enforceDownstream !== enforceDownstreamInitial ? (
          <Group spacing="sm">
            <Button variant="subtle" size="xs" disabled={enforceSaving} onClick={resetEnforceDownstream}>
              Reset to saved value
            </Button>
          </Group>
        ) : undefined,
      info: 'Use this enforcement to prevent anonymous traffic from reaching private services through the gateway.',
      disabled: enforceDownstream === null || enforceSaving
    },
    {
      id: 'graphql-voyager',
      icon: <IconInfoCircle size={20} />,
      title: 'GraphQL Relationship Diagram',
      headline: 'Enable GraphQL Voyager',
      helperText:
        'Serve an interactive diagram of your GraphQL schema so developers can explore type relationships at the /voyager endpoint.',
      value: graphqlVoyagerEnabled,
      loading: auditLoading && graphqlVoyagerEnabled === null,
      error: voyagerError,
      onChange: (value) => setGraphqlVoyagerEnabled(value),
      actions:
        graphqlVoyagerInitial !== null && graphqlVoyagerEnabled !== graphqlVoyagerInitial ? (
          <Group spacing="sm">
            <Button variant="subtle" size="xs" disabled={voyagerSaving} onClick={resetVoyager}>
              Reset to saved value
            </Button>
          </Group>
        ) : undefined,
      info: 'Enable when teams need to explore schemas visually and disable in locked-down environments to reduce surface area.',
      disabled: graphqlVoyagerEnabled === null || voyagerSaving
    },
    {
      id: 'graphql-playground',
      icon: <IconDatabase size={20} />,
      title: 'GraphQL Playground',
      headline: 'Enable GraphQL Playground',
      helperText:
        'Expose the in-browser GraphQL query console at the /playground endpoint for rapid debugging and exploration.',
      value: graphqlPlaygroundEnabled,
      loading: auditLoading && graphqlPlaygroundEnabled === null,
      error: playgroundError,
      onChange: (value) => setGraphqlPlaygroundEnabled(value),
      actions:
        graphqlPlaygroundInitial !== null && graphqlPlaygroundEnabled !== graphqlPlaygroundInitial ? (
          <Group spacing="sm">
            <Button variant="subtle" size="xs" disabled={playgroundSaving} onClick={resetPlayground}>
              Reset to saved value
            </Button>
          </Group>
        ) : undefined,
      info: 'Great for development and onboarding sessions. Disable it in production to keep tooling limited to authorized workflows.',
      disabled: graphqlPlaygroundEnabled === null || playgroundSaving
    },
    {
      id: 'latency-tracking',
      icon: <IconClock size={20} />,
      title: 'Request Latency Tracking',
      headline: 'Enable latency metrics collection',
      helperText:
        'Capture detailed performance timings for every GraphQL operation so you can chart trends, detect regressions, and power SLO dashboards.',
      value: latencyTrackingEnabled,
      loading: auditLoading && latencyTrackingEnabled === null,
      error: latencyError,
      onChange: (value) => setLatencyTrackingEnabled(value),
      actions:
        latencyTrackingInitial !== null && latencyTrackingEnabled !== latencyTrackingInitial ? (
          <Group spacing="sm">
            <Button variant="subtle" size="xs" disabled={latencySaving} onClick={resetLatency}>
              Reset to saved value
            </Button>
          </Group>
        ) : undefined,
      info: `Metrics retention matches your audit log policy (${auditRetention || 90} days). Disabling stops new measurements but keeps historical data for reference.`,
      disabled: latencyTrackingEnabled === null || latencySaving
    }
  ];

  const featureToggleDirty =
    (enforceDownstream !== null && enforceDownstream !== enforceDownstreamInitial) ||
    (graphqlVoyagerEnabled !== null && graphqlVoyagerEnabled !== graphqlVoyagerInitial) ||
    (graphqlPlaygroundEnabled !== null && graphqlPlaygroundEnabled !== graphqlPlaygroundInitial) ||
    (latencyTrackingEnabled !== null && latencyTrackingEnabled !== latencyTrackingInitial);

  const aiConfigDirty = aiBaseUrl !== aiBaseUrlInitial || aiModel !== aiModelInitial || !!aiApiKey;

  const docsModeDirty = docsMode !== docsModeInitial;
  const auditDirty = auditRetention !== auditInitial;

  const hasAnyChanges = featureToggleDirty || hasResponseCacheChanges || aiConfigDirty || docsModeDirty || auditDirty;

  const handleSaveAll = useCallback(async () => {
    if (!hasAnyChanges) {
      return;
    }
    setSaveError(null);
    setSaveMessage(null);
    setIsSavingAll(true);
    const results = await Promise.all([
      handleEnforceSave(),
      handleVoyagerSave(),
      handlePlaygroundSave(),
      handleLatencySave(),
      handleResponseCacheSave(),
      handleAIDocsSave(),
      handleDocsModeSave(),
      handleAuditSave()
    ]);
    const failed = results.filter((success) => !success).length;
    if (failed === 0) {
      setSaveMessage('All changes saved successfully.');
    } else if (failed === results.length) {
      setSaveError('Failed to save changes. Check the sections above for errors.');
    } else {
      setSaveError('Some settings failed to save. Check the sections above for details.');
    }
    setIsSavingAll(false);
  }, [
    auditDirty,
    hasAnyChanges,
    handleAIDocsSave,
    handleAuditSave,
    handleDocsModeSave,
    handleEnforceSave,
    handleLatencySave,
    handlePlaygroundSave,
    handleResponseCacheSave,
    handleVoyagerSave
  ]);

  const handleResetAll = useCallback(() => {
    setSaveError(null);
    setSaveMessage(null);
    resetEnforceDownstream();
    resetVoyager();
    resetPlayground();
    resetLatency();
    handleResponseCacheReset();
    setAiBaseUrl(aiBaseUrlInitial);
    setAiModel(aiModelInitial);
    setAiApiKey('');
    if (docsModeInitial !== null) {
      setDocsMode(docsModeInitial);
    }
    if (auditInitial !== null) {
      setAuditRetention(auditInitial);
    }
  }, [
    auditInitial,
    aiBaseUrlInitial,
    aiModelInitial,
    docsModeInitial,
    handleResponseCacheReset,
    resetEnforceDownstream,
    resetLatency,
    resetPlayground,
    resetVoyager
  ]);

  return (
    <Stack spacing="xl">
      <Group spacing="sm">
        <IconSettings size={24} />
        <Title order={2}>Gateway Settings</Title>
      </Group>

      <Group position="apart" align="center">
        <Text size="sm" color="dimmed">
          Make changes across sections and save them together.
        </Text>
        <Group spacing="sm">
          <Button variant="subtle" disabled={!hasAnyChanges || isSavingAll} onClick={handleResetAll}>
            Reset All
          </Button>
          <Button onClick={handleSaveAll} loading={isSavingAll} disabled={!hasAnyChanges}>
            Save All Changes
          </Button>
        </Group>
      </Group>

      {saveError && (
        <Alert color="red" icon={<IconInfoCircle size={16} />}>
          {saveError}
        </Alert>
      )}
      {!saveError && saveMessage && (
        <Alert color="green" icon={<IconInfoCircle size={16} />}>
          {saveMessage}
        </Alert>
      )}

      <FeatureTogglesSection items={featureToggleItems} />

      <ResponseCacheCard
        loading={rcLoading}
        error={rcError}
        enabled={rcEnabled}
        onEnabledChange={setRcEnabled}
        ttlMs={rcTtlMs}
        onTtlChange={setRcTtlMs}
        includeExtensions={rcIncludeExt}
        onIncludeExtensionsChange={setRcIncludeExt}
        scope={rcScope}
        onScopeChange={setRcScope}
        ttlPerType={rcTtlPerType}
        onTtlPerTypeChange={setRcTtlPerType}
        ttlPerCoordinate={rcTtlPerCoord}
        onTtlPerCoordinateChange={setRcTtlPerCoord}
        clearing={rcClearing}
        onClearCache={handleClearResponseCache}
        clearMessage={rcClearMsg}
        ttlError={rcTtlErr}
        onTtlErrorChange={setRcTtlErr}
      />

      <AIDocsCard
        loading={aiLoading}
        error={aiError}
        provider={aiProvider}
        onProviderChange={setAiProvider}
        baseUrl={aiBaseUrl}
        onBaseUrlChange={setAiBaseUrl}
        model={aiModel}
        onModelChange={setAiModel}
        apiKey={aiApiKey}
        onApiKeyChange={setAiApiKey}
        keyStored={aiKeySet}
        generating={genBusy}
        onGenerate={handleGenerateDocs}
        generationMessage={genMsg}
        onGenerationComplete={handleGenerationComplete}
        onGenerationError={handleGenerationError}
      />

      <Stack spacing="lg">
        <SessionRefreshCard autoRefreshEnabled={autoRefreshEnabled} onToggle={handleAutoRefreshToggle} />
        <SessionStatusCard
          timeToExpiry={timeToExpiry}
          autoRefreshEnabled={autoRefreshEnabled}
          isRefreshing={isRefreshing}
          onManualRefresh={handleManualRefresh}
        />
        <HowItWorksCard />
      </Stack>

      <PublicDocsModeCard
        loading={auditLoading}
        error={docsModeError}
        value={docsMode}
        onChange={setDocsMode}
        onReset={() => docsModeInitial && setDocsMode(docsModeInitial)}
        showReset={docsModeInitial !== null && docsMode !== docsModeInitial}
      />

      <AuditRetentionCard
        loading={auditLoading}
        error={auditError}
        value={auditRetention}
        onChange={setAuditRetention}
        onReset={() => auditInitial !== null && setAuditRetention(auditInitial)}
        showReset={auditInitial !== null && auditRetention !== auditInitial}
      />
    </Stack>
  );
};
