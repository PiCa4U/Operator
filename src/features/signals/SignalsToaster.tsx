// src/features/signals/SignalsToaster.tsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SignalItem } from "./api";
import { useManagerSignals } from "./useManagerSignals";
import { appendHistory } from "./local";
import {formatOperator, formatOperatorLine, useOperatorsDirectory} from "./useOperatorsDirectory";

const icon: Record<string,string> = { info:"ℹ️", warning:"⚠️", error:"⛔", success:"✅" };

export const SignalsToaster: React.FC<{ managerLogin?: string }> = ({ managerLogin }) => {
    const { newForUi, markOneAsRead } = useManagerSignals(managerLogin);
    const { data: opDir } = useOperatorsDirectory();           // ← добавили
    const [stack, setStack] = useState<SignalItem[]>([]);

    useEffect(() => {
        if (!newForUi.length || !managerLogin) return;
        setStack(prev => {
            const ids = new Set(prev.map(p=>p.id));
            const add = newForUi.filter(n=>!ids.has(n.id));
            if (add.length) appendHistory(managerLogin, add);
            return [...add, ...prev].slice(0, 6);
        });
    }, [newForUi, managerLogin]);

    const close = (id:number, read:boolean) => {
        setStack(prev => prev.filter(x=>x.id!==id));
        if (read) markOneAsRead(id);
    };

    return createPortal(
        <div style={{position:"fixed",right:16,bottom:16,zIndex:9999,display:"flex",flexDirection:"column-reverse",gap:12}}>
            {stack.map(n=>(
                <div key={n.id}
                     onClick={()=>close(n.id,true)}
                     style={{width:360,background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,boxShadow:"0 8px 20px rgba(0,0,0,.12)",padding:"12px 14px",cursor:"pointer"}}
                >
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontSize:18}}>{icon[n.signal_type] ?? "🔔"}</span>
                        <strong style={{fontSize:14}}>{n.title}</strong>
                    </div>
                    <div style={{fontSize:13,color:"#374151",whiteSpace:"pre-wrap"}}>{n.message}</div>

                    {/* Новая строка: имя оператора по логину */}
                    <div style={{fontSize:12,color:"#6b7280",marginTop:6}}>
                        Оператор: {formatOperatorLine(n.login, opDir, n.department, /*showLogin*/ true)}
                    </div>


                    <div className="text-end mt-2">
                        <button className="btn btn-link btn-sm" onClick={(e)=>{e.stopPropagation(); close(n.id,false);}}>Скрыть</button>
                    </div>
                </div>
            ))}
        </div>,
        document.body
    );
};
