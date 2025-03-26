import React, { useState, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setRoomId } from './redux/roomSlice';
import HeaderPanel from './components/headerPanel';
import CallControlPanel, { CallData } from './components/callControlPanel';
import CallsDashboard from './components/callsDashboard';
import ScriptPanel from './components/scriptPanel';
import { socket } from "./socket";
import { getCookies, makeId } from "./utils";
import { setFsStatus } from './redux/operatorSlice';

const App: React.FC = () => {
    const [selectedCall, setSelectedCall] = useState<CallData | null>(null);
    const [showScriptPanel, setShowScriptPanel] = useState(false);
    const dispatch = useDispatch();

    const roomId = useMemo(() => makeId(40), []);

    useEffect(() => {
        socket.on('fs_status', (msg: any) => {
            dispatch(setFsStatus(msg));
        });
    }, [dispatch]);

    useEffect(() => {
        dispatch(setRoomId(roomId));
    }, [dispatch, roomId]);

    return (
        <div className="row col-12 pr-0" style={{ marginLeft: 0 }}>
            <HeaderPanel onScriptToggle={() => setShowScriptPanel(!showScriptPanel)} />
            {showScriptPanel && (
                <ScriptPanel
                    projectName={selectedCall ? selectedCall.project_name || '' : ''}
                    onClose={() => setShowScriptPanel(false)}
                />
            )}
            <div className="row col-12 pr-0 py-2" style={{ marginLeft: 0 }}>
                <div id="report_place" className="row col-7 pl-0 pr-3 mr-2 py-1" style={{ marginLeft: 0, justifyContent: 'start' }}>
                    <CallsDashboard setSelectedCall={setSelectedCall} selectedCall={selectedCall} />
                </div>
                <div className="col ml-2 pr-0 mr-0">
                    <div className="card col ml-0">
                        {selectedCall && (
                            <CallControlPanel call={selectedCall} onClose={() => setSelectedCall(null)} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
