import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Invitation } from 'sip.js';
import { useSipUA, SipUA } from '../hooks/useSipUA';

type SipProviderProps = React.PropsWithChildren<{
    userId: string;
    ha1: string;
    wsServer: string;
    turnCreds?: any;
}>;

interface SipContextValue extends SipUA {
    incoming: Invitation | null;
    clearIncoming(): void;
}

const SipContext = createContext<SipContextValue | null>(null);

export const SipProvider: React.FC<SipProviderProps> = ({
                                                            userId,
                                                            ha1,
                                                            wsServer,
                                                            turnCreds,
                                                            children
                                                        }) => {
    const ua = useSipUA({ userId, ha1, wsServer, turnCreds });
    const [incoming, setIncoming] = useState<Invitation | null>(null);

    // Обновляем локальный incoming, когда у ua появляется новый звонок
    useEffect(() => {
        if (ua.incoming) {
            setIncoming(ua.incoming);
        }
    }, [ua.incoming]);

    const clearIncoming = () => {
        ua.incoming?.dispose?.();
        setIncoming(null);
    };

    return (
        <SipContext.Provider value={{ ...ua, incoming, clearIncoming }}>
            {children}
        </SipContext.Provider>
    );
};

export function useSip(): SipContextValue {
    const ctx = useContext(SipContext);
    if (!ctx) {
        throw new Error('useSip must be used within a <SipProvider>');
    }
    return ctx;
}
