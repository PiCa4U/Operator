import React from 'react';
import styles from './ModeSwitch.module.css';

export type Mode = 'calls' | 'tasks';

interface ModeSwitchProps {
    mode: Mode;
    onChange: (mode: Mode) => void;
}

const ModeSwitch: React.FC<ModeSwitchProps> = ({ mode, onChange }) => (
    <div className={styles.modeSwitch}>
        <button
            className={`${styles.button} ${mode === 'calls' ? styles.active : ''}`}
            onClick={() => onChange('calls')}
            type="button"
        >
            Список вызовов
        </button>
        <button
            className={`${styles.button} ${mode === 'tasks' ? styles.active : ''}`}
            onClick={() => onChange('tasks')}
            type="button"
        >
            Задачи
        </button>
    </div>
);

export default ModeSwitch;
