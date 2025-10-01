import { Badge, Box, Center, Group, Stack, Stepper, Text, Title } from '@mantine/core';
import { IconAdjustments, IconCheck, IconLock, IconRocket, IconServer } from '@tabler/icons-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch, persistAuthSession } from '../../utils/auth';
import AdminStep from './steps/AdminStep';
import CompletionStep from './steps/CompletionStep';
import ServicesStep from './steps/ServicesStep';
import SettingsStep from './steps/SettingsStep';
import WelcomeStep from './steps/WelcomeStep';

export type SetupStage = 'WELCOME' | 'ADMIN' | 'SETTINGS' | 'SERVICES' | 'DONE';

export interface SetupStatus {
  needsInitialAdmin: boolean;
  hasAnyUsers: boolean;
  setupComplete: boolean;
  lastCompletedStage: SetupStage;
  nextStage: SetupStage;
}

interface GetStartedProps {
  status: SetupStatus;
  refreshStatus: () => Promise<SetupStatus>;
  onComplete: (status: SetupStatus) => void;
}

interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

interface ServiceSummary {
  id: string;
  name: string;
  url: string;
  status?: string | null;
}

interface HmacKeyInfo {
  keyId: string;
  secretKey: string;
  instructions: string;
}

const stepOrder: SetupStage[] = ['WELCOME', 'ADMIN', 'SETTINGS', 'SERVICES', 'DONE'];

async function graphQLRequest<T>(query: string, variables?: Record<string, unknown>, opts?: { authenticated?: boolean }) {
  const body = JSON.stringify({ query, variables });
  const requestInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body
  };
  const response = opts?.authenticated
    ? await authenticatedFetch('/graphql', requestInit)
    : await fetch('/graphql', requestInit);
  const json: GraphQLResponse<T> = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'GraphQL request failed');
  }
  return json.data;
}

const INITIAL_ADMIN_MUTATION = `
  mutation InitializeAdmin($input: InitializeAdminInput!) {
    initializeAdminAccount(input: $input) {
      user { id email permissions }
      tokens { accessToken refreshToken expiresIn tokenType }
      sessionId
    }
  }
`;

const UPDATE_STAGE_MUTATION = `
  mutation UpdateInitialSetupStage($stage: InitialSetupStage!) {
    updateInitialSetupStage(stage: $stage) {
      needsInitialAdmin
      hasAnyUsers
      setupComplete
      lastCompletedStage
      nextStage
    }
  }
`;

const LOAD_SETTINGS_QUERY = `
  query InitialSettingsWizard {
    settings {
      enforceDownstreamAuth
      graphqlPlaygroundEnabled
      graphqlVoyagerEnabled
      latencyTrackingEnabled
      responseCacheEnabled
      responseCacheTtlMs
    }
    aiDocsConfig {
      provider
      baseUrl
      model
      apiKeySet
    }
  }
`;

const MUTATIONS = {
  setEnforceDownstreamAuth: `mutation($enabled:Boolean!){ setEnforceDownstreamAuth(enabled:$enabled) }`,
  setGraphqlPlayground: `mutation($enabled:Boolean!){ setGraphQLPlaygroundEnabled(enabled:$enabled) }`,
  setGraphqlVoyager: `mutation($enabled:Boolean!){ setGraphQLVoyagerEnabled(enabled:$enabled) }`,
  setLatencyTracking: `mutation($enabled:Boolean!){ setLatencyTrackingEnabled(enabled:$enabled) }`,
  setResponseCacheEnabled: `mutation($enabled:Boolean!){ setResponseCacheEnabled(enabled:$enabled) }`,
  setResponseCacheTtl: `mutation($ttlMs:Int!){ setResponseCacheTtlMs(ttlMs:$ttlMs) }`,
  setAIDocs: `mutation($input:SetAIDocsConfigInput!){ setAIDocsConfig(input:$input) }`
};

const LOAD_SERVICES_QUERY = `
  query WizardServices {
    services {
      id
      name
      url
      status
    }
  }
`;

const REGISTER_SERVICE_MUTATION = `
  mutation WizardRegisterService($input: RegisterServiceInput!) {
    registerService(input: $input) {
      success
      service {
        id
        name
        url
        status
      }
      hmacKey {
        keyId
        secretKey
        instructions
      }
    }
  }
`;

const INTROSPECT_SERVICE_QUERY = `
  query IntrospectService($url: String!) {
    introspectService(url: $url) {
      url
      isHealthy
      error
      schemaSDL
      types
      queries
      mutations
      subscriptions
    }
  }
`;

export const GetStarted: React.FC<GetStartedProps> = ({ status, refreshStatus, onComplete }) => {
  const navigate = useNavigate();
  const [currentStage, setCurrentStage] = useState<SetupStage>(status.setupComplete ? 'DONE' : status.nextStage);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [enforceDownstreamAuth, setEnforceDownstreamAuth] = useState(true);
  const [enforceDownstreamAuthInitial, setEnforceDownstreamAuthInitial] = useState(true);
  const [responseCacheEnabled, setResponseCacheEnabled] = useState(false);
  const [responseCacheEnabledInitial, setResponseCacheEnabledInitial] = useState(false);
  const [responseCacheTtlMs, setResponseCacheTtlMs] = useState<number>(30000);
  const [responseCacheTtlMsInitial, setResponseCacheTtlMsInitial] = useState<number>(30000);
  const [graphqlPlaygroundEnabled, setGraphqlPlaygroundEnabled] = useState(false);
  const [graphqlPlaygroundInitial, setGraphqlPlaygroundInitial] = useState(false);
  const [graphqlVoyagerEnabled, setGraphqlVoyagerEnabled] = useState(false);
  const [graphqlVoyagerInitial, setGraphqlVoyagerInitial] = useState(false);
  const [latencyTrackingEnabled, setLatencyTrackingEnabled] = useState(true);
  const [latencyTrackingInitial, setLatencyTrackingInitial] = useState(true);
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiBaseUrlInitial, setAiBaseUrlInitial] = useState('');
  const [aiModel, setAiModel] = useState('gpt-5-mini');
  const [aiModelInitial, setAiModelInitial] = useState('gpt-5-mini');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiKeyStored, setAiKeyStored] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceSuccess, setServiceSuccess] = useState<string | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [serviceName, setServiceName] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceEnableHmac, setServiceEnableHmac] = useState(true);
  const [serviceEnableBatching, setServiceEnableBatching] = useState(true);
  const [serviceTimeout, setServiceTimeout] = useState<number>(5000);
  const [serviceUseMsgPack, setServiceUseMsgPack] = useState(false);
  const [serviceEnableTypePrefix, setServiceEnableTypePrefix] = useState(false);
  const [serviceTypePrefix, setServiceTypePrefix] = useState('');
  const [hmacKeyInfo, setHmacKeyInfo] = useState<HmacKeyInfo | null>(null);

  // Introspection state
  const [introspectionLoading, setIntrospectionLoading] = useState(false);
  const [introspectionResult, setIntrospectionResult] = useState<any | null>(null);
  const [introspectionError, setIntrospectionError] = useState<string | null>(null);

  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [shouldCelebrate, setShouldCelebrate] = useState(false);
  const [celebrationSeed, setCelebrationSeed] = useState(0);
  const settingsLoadInFlight = useRef(false);
  const servicesLoadInFlight = useRef(false);
  const manualStageRef = useRef<SetupStage | null>(null);

  const moveToStage = useCallback((stage: SetupStage, manual = false) => {
    if (manual) {
      manualStageRef.current = stage;
    } else {
      manualStageRef.current = null;
    }
    setCurrentStage(stage);
  }, []);

  const activeStep = useMemo(() => stepOrder.indexOf(currentStage), [currentStage]);

  useEffect(() => {
    if (status.setupComplete) {
      manualStageRef.current = null;
      if (currentStage !== 'DONE') {
        moveToStage('DONE');
      }
      return;
    }

    const desired = status.nextStage;
    const desiredIndex = stepOrder.indexOf(desired);
    if (desiredIndex === -1) {
      return;
    }

    if (currentStage === desired) {
      manualStageRef.current = null;
      return;
    }

    if (manualStageRef.current) {
      const manualIndex = stepOrder.indexOf(manualStageRef.current);
      // If we manually moved forward beyond the backend's desired stage, stay there
      if (manualIndex !== -1 && manualIndex >= desiredIndex) {
        return;
      }
      // Only clear manual stage if backend has moved ahead of our manual position
      if (manualIndex !== -1 && desiredIndex > manualIndex) {
        manualStageRef.current = null;
      } else {
        return;
      }
    }

    const currentIndex = stepOrder.indexOf(currentStage);
    if (currentIndex === -1 || currentIndex < desiredIndex || currentIndex > desiredIndex) {
      moveToStage(desired);
    }
  }, [currentStage, moveToStage, status]);

  const handleAdminSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAdminError(null);
      setAdminSuccess(null);

      if (!adminEmail.trim() || !adminPassword.trim()) {
        setAdminError('Email and password are required.');
        return;
      }
      if (adminPassword !== adminPasswordConfirm) {
        setAdminError('Passwords do not match.');
        return;
      }
      if (adminPassword.length < 12) {
        setAdminError('Password must be at least 12 characters long.');
        return;
      }

      setAdminLoading(true);
      try {
        const data = await graphQLRequest<{
          initializeAdminAccount: {
            user: { id: string; email: string; permissions: string[] };
            tokens: { accessToken: string; refreshToken: string; expiresIn: number; tokenType: string };
            sessionId: string;
          };
        }>(INITIAL_ADMIN_MUTATION, {
          input: { email: adminEmail.trim(), password: adminPassword }
        });

        persistAuthSession(data.initializeAdminAccount);
        setAdminSuccess('Admin account created! You are now signed in.');
        setAdminPassword('');
        setAdminPasswordConfirm('');

        await refreshStatus();
        moveToStage('SETTINGS', true);
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : 'Failed to create admin user.');
      } finally {
        setAdminLoading(false);
      }
    },
    [adminEmail, adminPassword, adminPasswordConfirm, moveToStage, refreshStatus]
  );

  const updateStage = useCallback(
    async (stage: SetupStage) => {
      if (stage === 'WELCOME' || stage === 'ADMIN') {
        return refreshStatus();
      }

      const result = await graphQLRequest<{ updateInitialSetupStage: SetupStatus }>(
        UPDATE_STAGE_MUTATION,
        { stage },
        { authenticated: true }
      );
      const updated = await refreshStatus();
      return result.updateInitialSetupStage ?? updated;
    },
    [refreshStatus]
  );

  useEffect(() => {
    if (currentStage !== 'SETTINGS' || settingsLoaded || settingsLoadInFlight.current) {
      return;
    }

    settingsLoadInFlight.current = true;
    let cancelled = false;

    (async () => {
      setSettingsLoading(true);
      setSettingsError(null);
      try {
        const data = await graphQLRequest<{
          settings: {
            enforceDownstreamAuth: boolean;
            graphqlPlaygroundEnabled: boolean;
            graphqlVoyagerEnabled: boolean;
            latencyTrackingEnabled: boolean;
            responseCacheEnabled: boolean;
            responseCacheTtlMs: number;
          };
          aiDocsConfig: {
            baseUrl?: string;
            model?: string;
            apiKeySet: boolean;
          };
        }>(LOAD_SETTINGS_QUERY, undefined, { authenticated: true });

        if (cancelled) return;

        const settings = data.settings;
        setEnforceDownstreamAuth(settings.enforceDownstreamAuth);
        setEnforceDownstreamAuthInitial(settings.enforceDownstreamAuth);
        setGraphqlPlaygroundEnabled(settings.graphqlPlaygroundEnabled);
        setGraphqlPlaygroundInitial(settings.graphqlPlaygroundEnabled);
        setGraphqlVoyagerEnabled(settings.graphqlVoyagerEnabled);
        setGraphqlVoyagerInitial(settings.graphqlVoyagerEnabled);
        setLatencyTrackingEnabled(settings.latencyTrackingEnabled);
        setLatencyTrackingInitial(settings.latencyTrackingEnabled);
        setResponseCacheEnabled(settings.responseCacheEnabled);
        setResponseCacheEnabledInitial(settings.responseCacheEnabled);
        setResponseCacheTtlMs(settings.responseCacheTtlMs ?? 30000);
        setResponseCacheTtlMsInitial(settings.responseCacheTtlMs ?? 30000);

        const ai = data.aiDocsConfig;
        setAiBaseUrl(ai.baseUrl || '');
        setAiBaseUrlInitial(ai.baseUrl || '');
        setAiModel(ai.model || 'gpt-5-mini');
        setAiModelInitial(ai.model || 'gpt-5-mini');
        setAiKeyStored(Boolean(ai.apiKeySet));
        setAiApiKey('');

        setSettingsLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setSettingsError(error instanceof Error ? error.message : 'Failed to load settings.');
        }
      } finally {
        if (!cancelled) {
          settingsLoadInFlight.current = false;
          setSettingsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      settingsLoadInFlight.current = false;
    };
  }, [currentStage, settingsLoaded, updateStage]);

  useEffect(() => {
    if (currentStage !== 'SETTINGS') {
      setSettingsLoading(false);
    }
  }, [currentStage]);

  useEffect(() => {
    if (currentStage !== 'SERVICES' || servicesLoaded || servicesLoadInFlight.current) {
      console.log('Services effect skipped:', { currentStage, servicesLoaded, inFlight: servicesLoadInFlight.current });
      return;
    }

    console.log('Services effect starting load');
    servicesLoadInFlight.current = true;
    let cancelled = false;

    (async () => {
      setServicesLoading(true);
      setServicesError(null);
      try {
        const data = await graphQLRequest<{ services: ServiceSummary[] }>(LOAD_SERVICES_QUERY, undefined, {
          authenticated: true
        });

        if (cancelled) {
          console.log('Services load cancelled');
          return;
        }

        console.log('Services loaded:', data.services?.length);
        setServices(data.services ?? []);
        setServicesLoaded(true);
        await updateStage('SERVICES');
      } catch (error) {
        console.error('Services load error:', error);
        if (!cancelled) {
          setServicesError(error instanceof Error ? error.message : 'Failed to load services.');
        }
      } finally {
        console.log('Services load finally block, cancelled:', cancelled);
        // Always reset loading state and in-flight flag, even if cancelled
        servicesLoadInFlight.current = false;
        setServicesLoading(false);
      }
    })();

    return () => {
      console.log('Services effect cleanup');
      cancelled = true;
      servicesLoadInFlight.current = false;
      setServicesLoading(false);
    };
  }, [currentStage, servicesLoaded, updateStage]);

  useEffect(() => {
    if (currentStage !== 'SERVICES') {
      setServicesLoading(false);
    }
  }, [currentStage]);

  const handleSaveSettings = useCallback(async () => {
    setSettingsError(null);
    setSettingsSuccess(null);
    setCompletionError(null);
    setSavingSettings(true);

    try {
      const operations: Promise<unknown>[] = [];

      if (enforceDownstreamAuth !== enforceDownstreamAuthInitial) {
        operations.push(
          graphQLRequest(MUTATIONS.setEnforceDownstreamAuth, { enabled: enforceDownstreamAuth }, { authenticated: true })
        );
      }
      if (graphqlPlaygroundEnabled !== graphqlPlaygroundInitial) {
        operations.push(
          graphQLRequest(MUTATIONS.setGraphqlPlayground, { enabled: graphqlPlaygroundEnabled }, { authenticated: true })
        );
      }
      if (graphqlVoyagerEnabled !== graphqlVoyagerInitial) {
        operations.push(
          graphQLRequest(MUTATIONS.setGraphqlVoyager, { enabled: graphqlVoyagerEnabled }, { authenticated: true })
        );
      }
      if (latencyTrackingEnabled !== latencyTrackingInitial) {
        operations.push(
          graphQLRequest(MUTATIONS.setLatencyTracking, { enabled: latencyTrackingEnabled }, { authenticated: true })
        );
      }
      if (responseCacheEnabled !== responseCacheEnabledInitial) {
        operations.push(
          graphQLRequest(MUTATIONS.setResponseCacheEnabled, { enabled: responseCacheEnabled }, { authenticated: true })
        );
      }
      if (responseCacheTtlMs !== responseCacheTtlMsInitial) {
        operations.push(graphQLRequest(MUTATIONS.setResponseCacheTtl, { ttlMs: responseCacheTtlMs }, { authenticated: true }));
      }
      if (aiBaseUrl !== aiBaseUrlInitial || aiModel !== aiModelInitial || aiApiKey.trim()) {
        operations.push(
          graphQLRequest(
            MUTATIONS.setAIDocs,
            {
              input: {
                provider: 'OPENAI',
                baseUrl: aiBaseUrl || null,
                model: aiModel || null,
                apiKey: aiApiKey.trim() || null
              }
            },
            { authenticated: true }
          )
        );
      }

      if (operations.length) {
        await Promise.all(operations);
      }

      setEnforceDownstreamAuthInitial(enforceDownstreamAuth);
      setGraphqlPlaygroundInitial(graphqlPlaygroundEnabled);
      setGraphqlVoyagerInitial(graphqlVoyagerEnabled);
      setLatencyTrackingInitial(latencyTrackingEnabled);
      setResponseCacheEnabledInitial(responseCacheEnabled);
      setResponseCacheTtlMsInitial(responseCacheTtlMs);
      setAiBaseUrlInitial(aiBaseUrl);
      setAiModelInitial(aiModel);
      if (aiApiKey.trim()) {
        setAiKeyStored(true);
        setAiApiKey('');
      }

      setServicesLoaded(false);
      servicesLoadInFlight.current = false;
      const updatedStatus = await updateStage('SERVICES');
      setServiceSuccess('Gateway configuration saved. Register your first service to finish onboarding.');
      setServicesError(null);
      setHmacKeyInfo(null);
      if (updatedStatus.setupComplete) {
        moveToStage('DONE', true);
      } else {
        moveToStage('SERVICES', true);
      }
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  }, [
    aiApiKey,
    aiBaseUrl,
    aiBaseUrlInitial,
    aiModel,
    aiModelInitial,
    enforceDownstreamAuth,
    enforceDownstreamAuthInitial,
    graphqlPlaygroundEnabled,
    graphqlPlaygroundInitial,
    graphqlVoyagerEnabled,
    graphqlVoyagerInitial,
    latencyTrackingEnabled,
    latencyTrackingInitial,
    responseCacheEnabled,
    responseCacheEnabledInitial,
    responseCacheTtlMs,
    responseCacheTtlMsInitial,
    moveToStage,
    updateStage
  ]);

  const handleSkipSettings = useCallback(async () => {
    setSettingsError(null);
    setCompletionError(null);
    setSettingsSuccess(null);
    setSavingSettings(true);

    try {
      setServicesLoaded(false);
      servicesLoadInFlight.current = false;
      setServiceSuccess('You can refine these defaults later. Add a service to wrap up onboarding.');
      setServicesError(null);
      setHmacKeyInfo(null);
      const updatedStatus = await updateStage('SERVICES');
      if (updatedStatus.setupComplete) {
        moveToStage('DONE', true);
      } else {
        moveToStage('SERVICES', true);
      }
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Failed to complete setup.');
    } finally {
      setSavingSettings(false);
    }
  }, [moveToStage, updateStage]);

  const handleIntrospectService = useCallback(async (url: string) => {
    if (!url.trim()) {
      setIntrospectionResult(null);
      setIntrospectionError(null);
      return;
    }

    setIntrospectionLoading(true);
    setIntrospectionError(null);
    setIntrospectionResult(null);

    try {
      const data = await graphQLRequest<{
        introspectService: {
          url: string;
          isHealthy: boolean;
          error?: string;
          schemaSDL?: string;
          types?: string[];
          queries?: string[];
          mutations?: string[];
          subscriptions?: string[];
        };
      }>(INTROSPECT_SERVICE_QUERY, { url: url.trim() }, { authenticated: true });

      if (data.introspectService) {
        setIntrospectionResult(data.introspectService);
        if (!data.introspectService.isHealthy && data.introspectService.error) {
          setIntrospectionError(data.introspectService.error);
        }
      }
    } catch (error) {
      console.error('Introspection failed:', error);
      setIntrospectionError(error instanceof Error ? error.message : 'Failed to introspect service');
    } finally {
      setIntrospectionLoading(false);
    }
  }, []);

  // Auto-introspect when service URL changes (with debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (serviceUrl.trim()) {
        handleIntrospectService(serviceUrl);
      } else {
        setIntrospectionResult(null);
        setIntrospectionError(null);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [serviceUrl, handleIntrospectService]);

  const deriveTypePrefix = useCallback((name: string) => {
    const tokens = (name || '').split(/[^a-zA-Z0-9]+/).filter(Boolean);
    let candidate = tokens
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
      .join('');
    if (!candidate) candidate = 'Service';
    if (!/^[A-Za-z_]/.test(candidate)) {
      candidate = `Svc${candidate}`;
    }
    if (!candidate.endsWith('_')) {
      candidate = `${candidate}_`;
    }
    return candidate.slice(0, 64);
  }, []);

  useEffect(() => {
    if (serviceEnableTypePrefix) {
      const trimmed = serviceTypePrefix.trim();
      if (!trimmed) {
        setServiceTypePrefix(deriveTypePrefix(serviceName));
      }
    }
  }, [serviceEnableTypePrefix, serviceTypePrefix, serviceName, deriveTypePrefix]);

  const handleRegisterService = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setServicesError(null);
      setServiceSuccess(null);
      setHmacKeyInfo(null);

      const trimmedName = serviceName.trim();
      const trimmedUrl = serviceUrl.trim();

      if (!trimmedName || !trimmedUrl) {
        setServicesError('Service name and endpoint URL are required.');
        return;
      }

      const payloadTimeout = Number.isFinite(serviceTimeout) ? Math.max(0, Number(serviceTimeout)) : 5000;

      setCreatingService(true);
      try {
        const data = await graphQLRequest<{
          registerService: {
            success: boolean;
            service: ServiceSummary;
            hmacKey?: HmacKeyInfo | null;
          };
        }>(
          REGISTER_SERVICE_MUTATION,
          {
            input: {
              name: trimmedName,
              url: trimmedUrl,
              description: serviceDescription.trim() || null,
              enableHMAC: serviceEnableHmac,
              enableBatching: serviceEnableBatching,
              timeout: payloadTimeout,
              useMsgPack: serviceUseMsgPack,
              enableTypePrefix: serviceEnableTypePrefix,
              typePrefix: serviceEnableTypePrefix ? serviceTypePrefix.trim() || null : null
            }
          },
          { authenticated: true }
        );

        const result = data.registerService;
        if (!result.success) {
          setServicesError('Failed to register service.');
          return;
        }

        setServices((prev) => {
          const exists = prev.some((svc) => svc.id === result.service.id);
          return exists ? prev.map((svc) => (svc.id === result.service.id ? result.service : svc)) : [...prev, result.service];
        });
        setServiceSuccess(`Registered ${result.service.name}. You can add more services or finish onboarding.`);
        setHmacKeyInfo(result.hmacKey ?? null);
        setServiceName('');
        setServiceUrl('');
        setServiceDescription('');
        setServiceEnableHmac(true);
        setServiceEnableBatching(true);
        setServiceTimeout(5000);
        setServiceUseMsgPack(false);
  setServiceEnableTypePrefix(false);
  setServiceTypePrefix('');

        // Ensure loading states are reset
        setServicesLoading(false);
        setIntrospectionLoading(false);
        setIntrospectionResult(null);
        setIntrospectionError(null);

        await refreshStatus();
      } catch (error) {
        setServicesError(error instanceof Error ? error.message : 'Failed to register service.');
      } finally {
        setCreatingService(false);
      }
    },
    [
      refreshStatus,
      serviceDescription,
      serviceEnableBatching,
      serviceEnableHmac,
      serviceEnableTypePrefix,
      serviceName,
      serviceTimeout,
      serviceUrl,
      serviceUseMsgPack,
      serviceTypePrefix
    ]
  );

  const handleCompleteServices = useCallback(async () => {
    setServicesError(null);
    setServiceSuccess(null);
    setHmacKeyInfo(null);

    try {
      // Just move to the DONE stage locally, don't mark setup complete yet
      // Services are optional, so we can proceed regardless
      moveToStage('DONE', true);
    } catch (error) {
      setServicesError(error instanceof Error ? error.message : 'Failed to finalize onboarding.');
    }
  }, [moveToStage]);

  useEffect(() => {
    if (currentStage === 'DONE') {
      setShouldCelebrate(true);
      setCelebrationSeed((seed) => seed + 1);
    } else {
      setShouldCelebrate(false);
    }
  }, [currentStage]);

  const completeAndNavigate = useCallback(
    async (path: string) => {
      setCompletionError(null);
      setCompleting(true);
      try {
        // Now actually mark setup as complete
        const latest = await updateStage('DONE');
        onComplete(latest);
        navigate(path);
      } catch (error) {
        setCompletionError(error instanceof Error ? error.message : 'Failed to open the admin experience.');
      } finally {
        setCompleting(false);
      }
    },
    [navigate, onComplete, updateStage]
  );

  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fbff 0%, #eef2ff 100%)' }}>
      <Center sx={{ padding: '4rem 1.5rem' }}>
        <Stack spacing="xl" sx={{ width: 'min(1100px, 100%)' }}>
          <div>
            <Group spacing="xs" position="apart">
              <Stack spacing={4}>
                <Title order={1}>Gateway onboarding</Title>
                <Text color="dimmed">A guided setup that takes under five minutes.</Text>
              </Stack>
              <Badge variant="light" color="blue">
                Guided flow
              </Badge>
            </Group>
          </div>

          <Stepper active={activeStep} radius="md" size="sm" breakpoint="sm">
            <Stepper.Step label="Welcome" description="Overview" icon={<IconRocket size={16} />} />
            <Stepper.Step label="Admin" description="Create account" icon={<IconLock size={16} />} />
            <Stepper.Step label="Settings" description="Configure" icon={<IconAdjustments size={16} />} />
            <Stepper.Step label="Services" description="Register" icon={<IconServer size={16} />} />
            <Stepper.Step label="Finish" description="Launch" icon={<IconCheck size={16} />} />
          </Stepper>

          {currentStage === 'WELCOME' && <WelcomeStep onContinue={() => moveToStage('ADMIN', true)} />}
          {currentStage === 'ADMIN' && (
            <AdminStep
              email={adminEmail}
              password={adminPassword}
              confirmPassword={adminPasswordConfirm}
              loading={adminLoading}
              error={adminError}
              success={adminSuccess}
              onEmailChange={setAdminEmail}
              onPasswordChange={setAdminPassword}
              onConfirmPasswordChange={setAdminPasswordConfirm}
              onSubmit={handleAdminSubmit}
              onBack={() => moveToStage('WELCOME', true)}
            />
          )}
          {currentStage === 'SETTINGS' && (
            <SettingsStep
              loading={settingsLoading}
              loaded={settingsLoaded}
              error={settingsError}
              success={settingsSuccess}
              enforceDownstreamAuth={enforceDownstreamAuth}
              onEnforceDownstreamAuthChange={setEnforceDownstreamAuth}
              graphqlPlaygroundEnabled={graphqlPlaygroundEnabled}
              onGraphqlPlaygroundChange={setGraphqlPlaygroundEnabled}
              graphqlVoyagerEnabled={graphqlVoyagerEnabled}
              onGraphqlVoyagerChange={setGraphqlVoyagerEnabled}
              responseCacheEnabled={responseCacheEnabled}
              onResponseCacheEnabledChange={setResponseCacheEnabled}
              responseCacheTtlMs={responseCacheTtlMs}
              onResponseCacheTtlChange={setResponseCacheTtlMs}
              latencyTrackingEnabled={latencyTrackingEnabled}
              onLatencyTrackingChange={setLatencyTrackingEnabled}
              aiBaseUrl={aiBaseUrl}
              onAiBaseUrlChange={setAiBaseUrl}
              aiModel={aiModel}
              onAiModelChange={setAiModel}
              aiApiKey={aiApiKey}
              onAiApiKeyChange={setAiApiKey}
              aiKeyStored={aiKeyStored}
              saving={savingSettings}
              onBack={() => moveToStage('ADMIN', true)}
              onSkip={handleSkipSettings}
              onSave={handleSaveSettings}
            />
          )}
          {currentStage === 'SERVICES' && (
            <ServicesStep
              loading={servicesLoading}
              loaded={servicesLoaded}
              services={services}
              error={servicesError}
              success={serviceSuccess}
              hmacKeyInfo={hmacKeyInfo}
              creatingService={creatingService}
              serviceName={serviceName}
              onServiceNameChange={setServiceName}
              serviceUrl={serviceUrl}
              onServiceUrlChange={setServiceUrl}
              serviceDescription={serviceDescription}
              onServiceDescriptionChange={setServiceDescription}
              enableHmac={serviceEnableHmac}
              onEnableHmacChange={setServiceEnableHmac}
              enableBatching={serviceEnableBatching}
              onEnableBatchingChange={setServiceEnableBatching}
              enableTypePrefix={serviceEnableTypePrefix}
              onEnableTypePrefixChange={setServiceEnableTypePrefix}
              typePrefix={serviceTypePrefix}
              onTypePrefixChange={setServiceTypePrefix}
              timeoutMs={serviceTimeout}
              onTimeoutChange={setServiceTimeout}
              useMsgPack={serviceUseMsgPack}
              onUseMsgPackChange={setServiceUseMsgPack}
              onSubmit={handleRegisterService}
              onBack={() => moveToStage('SETTINGS', true)}
              onFinish={handleCompleteServices}
              onSkip={handleCompleteServices}
              canFinish={true}
              introspectionLoading={introspectionLoading}
              introspectionResult={introspectionResult}
              introspectionError={introspectionError}
            />
          )}
          {currentStage === 'DONE' && (
            <CompletionStep
              shouldCelebrate={shouldCelebrate}
              celebrationSeed={celebrationSeed}
              completionError={completionError}
              completing={completing}
              onNavigateToSettings={() => completeAndNavigate('/settings')}
              onNavigateHome={() => completeAndNavigate('/')}
            />
          )}
        </Stack>
      </Center>
    </Box>
  );
};

export default GetStarted;
