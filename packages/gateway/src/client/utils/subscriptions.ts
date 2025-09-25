// GraphQL Subscription utilities using SSE (Server-Sent Events)
import React from 'react';

export interface SubscriptionOptions {
  query: string;
  variables?: Record<string, any>;
  onNext?: (data: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export interface Subscription {
  unsubscribe: () => void;
}

// Create a GraphQL subscription using SSE
export const createSubscription = (
  options: SubscriptionOptions
): Subscription => {
  const { query, variables = {}, onNext, onError, onComplete } = options;

  let isActive = true;
  let eventSource: EventSource | null = null;

  const start = async () => {
    try {
      // Get access token for authentication
      const token = localStorage.getItem('accessToken');

      // For GraphQL SSE, we use POST to /graphql with Accept: text/event-stream
      // This will establish the SSE connection with proper authentication
      const body = JSON.stringify({ query, variables });

      // Since EventSource doesn't support POST or custom headers,
      // we need to use the fetch API to establish the connection
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if we got a text/event-stream response
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/event-stream')) {
        throw new Error('Server did not return text/event-stream response');
      }

      // Create a readable stream from the response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body stream available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        while (isActive) {
          const { done, value } = await reader.read();

          if (done) {
            onComplete?.();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the incomplete line in buffer

          for (const line of lines) {
            if (!isActive) break;

            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));

                if (data.errors) {
                  onError?.(
                    new Error(data.errors[0]?.message || 'GraphQL error')
                  );
                  return;
                }

                if (data.data) {
                  onNext?.(data.data);
                }
              } catch (error) {
                console.warn('Failed to parse SSE data:', line, error);
              }
            }
          }
        }
      };

      processStream().catch(onError);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  // Start the subscription
  start();

  return {
    unsubscribe: () => {
      isActive = false;
      onComplete?.();
    },
  };
};

// Hook for using GraphQL subscriptions in React components
export const useSubscription = (
  query: string,
  variables?: Record<string, any>
): {
  data: any;
  error: Error | null;
  loading: boolean;
  subscribe: (callbacks: {
    onNext?: (data: any) => void;
    onError?: (error: Error) => void;
  }) => Subscription;
} => {
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);

  const subscribe = React.useCallback(
    (callbacks: {
      onNext?: (data: any) => void;
      onError?: (error: Error) => void;
    }) => {
      setLoading(true);
      setError(null);

      return createSubscription({
        query,
        variables,
        onNext: (newData) => {
          setData(newData);
          setLoading(false);
          callbacks.onNext?.(newData);
        },
        onError: (err) => {
          setError(err);
          setLoading(false);
          callbacks.onError?.(err);
        },
        onComplete: () => {
          setLoading(false);
        },
      });
    },
    [query, variables]
  );

  return { data, error, loading, subscribe };
};

// Document generation specific subscription hook
export const useDocumentGenerationSubscription = () => {
  const [generationState, setGenerationState] = React.useState<{
    inProgress: boolean;
    progress: number;
    currentService: string | null;
    completedServices: string[];
    totalServices: number;
    error: string | null;
    result: any | null;
  }>({
    inProgress: false,
    progress: 0,
    currentService: null,
    completedServices: [],
    totalServices: 0,
    error: null,
    result: null,
  });

  const subscribe = React.useCallback(() => {
    const subscription = createSubscription({
      query: `
        subscription WatchDocumentGeneration($filter: GatewayMessageFilter!) {
          gatewayMessageChannel(filter: $filter) {
            id
            topic
            type
            severity
            timestamp
            payload
          }
        }
      `,
      variables: {
        filter: { topic: 'system/docs-generation' },
      },
      onNext: (data) => {
        const message = data.gatewayMessageChannel;
        const payload = message?.payload || {};

        switch (message?.type) {
          case 'generation_started':
            setGenerationState((prev) => ({
              ...prev,
              inProgress: true,
              progress: 0,
              currentService: null,
              completedServices: [],
              totalServices:
                payload.totalServices || payload.summary?.totalServices || 0,
              error: null,
              result: null,
            }));
            break;

          case 'service_processing':
            setGenerationState((prev) => ({
              ...prev,
              currentService: payload.serviceName,
              // Prefer percentage if provided
              progress:
                (payload.progress &&
                  (payload.progress.percentage || payload.progress)) ||
                Math.min(
                  99,
                  prev.totalServices > 0
                    ? Math.round(
                        (prev.completedServices.length / prev.totalServices) *
                          100
                      )
                    : prev.progress || 0
                ),
            }));
            break;

          case 'service_completed':
            setGenerationState((prev) => ({
              ...prev,
              completedServices: [
                ...prev.completedServices,
                payload.serviceName,
              ],
              progress:
                (payload.progress &&
                  (payload.progress.percentage || payload.progress)) ||
                (prev.totalServices > 0
                  ? Math.round(
                      ((prev.completedServices.length + 1) /
                        prev.totalServices) *
                        100
                    )
                  : prev.progress || 0),
            }));
            break;

          case 'generation_completed':
            setGenerationState((prev) => ({
              ...prev,
              inProgress: false,
              progress: 100,
              currentService: null,
              // Normalize result for UI expectations
              result: (() => {
                const summary = payload.summary || {};
                const created = summary.created ?? payload.created ?? 0;
                const updated = summary.updated ?? payload.updated ?? 0;
                const totalProcessed =
                  summary.totalProcessed ?? created + updated;
                const totalServices =
                  summary.totalServices ?? payload.totalServices ?? 0;
                const durationStr =
                  payload.duration || summary.duration || '0ms';
                const duration =
                  parseInt(String(durationStr).replace(/[^0-9]/g, '')) || 0;
                return {
                  totalDocuments: totalProcessed,
                  totalServices,
                  duration,
                  raw: payload,
                };
              })(),
            }));
            break;

          case 'generation_failed':
            setGenerationState((prev) => ({
              ...prev,
              inProgress: false,
              error: payload.error || 'Generation failed',
            }));
            break;
        }
      },
      onError: (error) => {
        setGenerationState((prev) => ({
          ...prev,
          inProgress: false,
          error: error.message,
        }));
      },
    });

    return subscription;
  }, []);

  return {
    ...generationState,
    subscribe,
  };
};
