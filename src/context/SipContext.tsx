import React, {createContext, createRef, useContext} from 'react';
import type { RefObject } from 'react';
import type { Invitation } from 'sip.js';
import { useSipUA, SipUA } from '../hooks/useSipUA';
import type { TurnCredentials } from '../redux/operatorSlice';

export interface SipContextValue extends SipUA {
    enabled: boolean;
    clearIncoming(): void;
}

const noop = () => {};
const dummyRemoteRef = ({ current: null } as unknown) as React.RefObject<HTMLAudioElement>;
const dummyLocalRef  = ({ current: null } as unknown) as React.RefObject<HTMLAudioElement>;

const defaultValue: SipContextValue = {
    enabled: false,

    session: null,
    consultSession: null,

    makeCall: async () => {},
    answerCall: async () => {},
    hangUp: () => {},
    holdCall: async () => {},
    unholdCall: async () => {},
    muteLocal: () => {},

    incoming: null,
    status: null,
    consultStatus: null,
    consultTarget: null,

    remoteAudioRef: dummyRemoteRef,
    localAudioRef: dummyLocalRef,
    userAgent: null,

    clearIncoming: () => {},

    blindTransfer: async () => {},
    startConsultCall: async () => {},
    completeAttendedTransfer: async () => {},
    cancelConsultCall: async () => {},
};

const SipContext = createContext<SipContextValue>(defaultValue);

export function SipProvider({
                                enabled,
                                userId,
                                ha1,
                                wsServer,
                                turnCreds,
                                children,
                            }: React.PropsWithChildren<{
    enabled: boolean;
    userId: string;
    ha1: string;
    wsServer: string;
    turnCreds: TurnCredentials;
}>) {
    const ua = useSipUA({ enabled, userId, ha1, wsServer, turnCreds });

    return (
        <SipContext.Provider
            value={{
                enabled,
                ...ua,
                clearIncoming: () => ua.incoming?.dispose?.(),
            }}
        >
            {children}
        </SipContext.Provider>
    );
}

export function useSip() {
    return useContext(SipContext);
}
