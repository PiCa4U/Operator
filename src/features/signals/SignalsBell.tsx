import React from "react";
import { useManagerSignals } from "./useManagerSignals";

export const SignalsBell: React.FC<{ managerLogin?: string; onOpen: () => void }> = ({ managerLogin, onOpen }) => {
    const { unreadCount } = useManagerSignals(managerLogin);

    return (
        <button className="btn btn-light position-relative" onClick={onOpen} title="Уведомления">
            🔔
            {unreadCount > 0 && (
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{fontSize:12}}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
            )}
        </button>
    );
};
