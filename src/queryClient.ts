import { QueryClient } from "@tanstack/react-query";

declare global { interface Window { __queryClient?: QueryClient } }

// один экземпляр на всё приложение/все React-роуты
export const queryClient =
    window.__queryClient ?? (window.__queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                refetchOnWindowFocus: true,
                refetchOnReconnect: true,
                retry: 1,
            },
        },
    }));
