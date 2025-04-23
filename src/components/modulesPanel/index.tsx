import React, { useState, useEffect } from 'react';

interface ModuleItem {
    id: number;
    name: string;
    startMode: string;
}

const ModulesPanel: React.FC = () => {
    const [modules, setModules] = useState<ModuleItem[]>([]);

    // Эффект для загрузки модулей (например, через socket или API)
    useEffect(() => {
        // Пример: эмуляция загрузки данных
        setTimeout(() => {
            setModules([
                { id: 1, name: 'Модуль А', startMode: 'manual' },
                { id: 2, name: 'Модуль Б', startMode: 'start' },
                // ...
            ]);
        }, 500);
    }, []);

    const handleModuleClick = (module: ModuleItem) => {
        // Здесь можно вызвать socket.emit('module_operations', { ... })
    };

    return (
        <div id="module_butts" className="row col-12 pb-4" style={{ marginLeft: 0 }}>
            <div className="col"></div>
            <p className="mr-2" style={{ marginTop: '11px' }}>
                <strong>Модули:</strong>
            </p>
            <div
                id="module_place"
                className="row mx-0 px-0 py-0 my-0"
                style={{ marginLeft: 0 }}
            >
                {modules.map((module) => (
                    <button
                        key={module.id}
                        className="btn btn-outline-success my-1 ml-2 py-1"
                        onClick={() => handleModuleClick(module)}
                    >
                        {module.name}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ModulesPanel;
