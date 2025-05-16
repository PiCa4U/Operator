// utils/cookies.js
export const getCookies = (name: string) => {
    const cookieString = document.cookie;
    const cookies = cookieString.split(';').map(cookie => cookie.trim());
    for (let cookie of cookies) {
        if (cookie.startsWith(name + '=')) {
            return cookie.substring(name.length + 1);
        }
    }
    return null;
}

export const makeId = (length: number) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
};

interface Project {
    project_name: string;
    glagol_name: string;
    // Другие поля проекта, если нужно
}

interface CallcenterEntry {
    agent_name: string;
    project_name: string;
    // Другие поля, если нужно
}

interface User {
    login: string;
    // Другие поля пользователя
}

interface MonitorData {
    projects: Project[];
    callcenter: CallcenterEntry[];
    users: User[];
}

// Функция для разбора данных мониторинга
export function parseMonitorData(data: MonitorData) {
    // Формируем объект monitorUsers: ключ – login, значение – объект пользователя
    const monitorUsers = data.users.reduce((acc, user) => {
        acc[user.login] = user;
        return acc;
    }, {} as Record<string, User>);

    // Формируем объект monitorProjects: ключ – project_name, значение – glagol_name
    const monitorProjects = data.projects.reduce((acc, project) => {
        acc[project.project_name] = project.glagol_name;
        return acc;
    }, {} as Record<string, string>);

    // Формируем объект allProjects: ключ – project_name, значение – объект проекта целиком
    const allProjects = data.projects.reduce((acc, project) => {
        acc[project.project_name] = project;
        return acc;
    }, {} as Record<string, Project>);

    // Формируем объект monitorCallcenter: ключ – agent_name, значение – массив project_name
    const monitorCallcenter = data.callcenter.reduce((acc, entry) => {
        if (acc[entry.agent_name]) {
            // Если проект ещё не добавлен для этого агента – добавляем
            if (!acc[entry.agent_name].includes(entry.project_name)) {
                acc[entry.agent_name].push(entry.project_name);
            }
        } else {
            acc[entry.agent_name] = [entry.project_name];
        }
        return acc;
    }, {} as Record<string, string[]>);

    return { monitorUsers, monitorProjects, allProjects, monitorCallcenter };
}

// src/utils/statusPresentation.ts
export interface FsStatus {
    status?: string;
    state?: string;
    sofia_status?: string;
}

export interface UserStatus {
    status?: string;
    ping_status?: string;
    state?: string;
    sofia_status?: string;
}

// Маппинги для header
const fsStatusMapping: Record<string, { text: string; color: string }> = {
    'Available':              { text: 'На линии',            color: '#0BB918' },
    'Available (On Demand)':  { text: 'На линии',            color: '#0BB918' },
    'Logged Out':             { text: 'Выключен',            color: '#f33333' },
    'On Break':               { text: 'Перерыв',             color: '#cba200' },
    'Post':                   { text: 'Постобработка',       color: '#cba200' },
};

const sofiaStatusMapping: Record<'Registered' | 'Unregistered', { text: string; color: string }> = {
    Registered:   { text: 'Авторизован',        color: '#0BB918' },
    Unregistered: { text: 'Выключен',           color: '#f33333' },
};

/**
 * Для шапки:
 * - если activeCall=true — пишем "Активный вызов (mm:ss)", цвет Post
 * - иначе берём маппинг из fsStatusMapping
 */
export function getHeaderStatusPresentation(
    fs: FsStatus,
    hasActiveCall: boolean,
    callTimer: string
): { label: string; color: string } {
    const isPost = fs.status === 'Available (On Demand)' && fs.state === 'Idle';
    const postColor = fsStatusMapping.Post.color;

    if (hasActiveCall) {
        return { label: `Активный вызов (${callTimer})`, color: postColor };
    }

    if (isPost) {
        return { label: fsStatusMapping.Post.text, color: postColor };
    }

    const mapped = fs.status && fsStatusMapping[fs.status]
        ? fsStatusMapping[fs.status]
        : { text: fs.status || 'Обновляется', color: '#cba200' };

    return { label: mapped.text, color: mapped.color };
}

/**
 * Для карточек коллег:
 *  - Logged Out            → "оффлайн", text-muted
 *  - status === 'On Call'  → "активный звонок", text-primary
 *  - иначе, если есть ping → `${ping_status}, ${state}`, text-warning|text-success
 *  - иначе                  → state || sofia_status, text-warning|text-success
 */
// export function getColleagueStatusPresentation(
//     usr: UserStatus,
//     isSelfOnCall: boolean  // true, если это ваш собственный sip-login и активный звонок
// ): { label: string; className: string } {
//     if (usr.status === 'Logged Out') {
//         return { label: 'оффлайн',     className: 'text-muted' };
//     }
//
//     if (isSelfOnCall || usr.status === 'On Call') {
//         return { label: 'активный звонок', className: 'text-primary' };
//     }
//
//     // online, но не на звонке
//     let label = '';
//     if (usr.ping_status) {
//         label = usr.state
//             ? `${usr.ping_status}, ${usr.state}`
//             : usr.ping_status;
//     } else {
//         label = usr.state || usr.sofia_status || 'онлайн';
//     }
//
//     const warningStates = new Set(['Waiting']);
//     const className = warningStates.has(usr.state || '')
//         ? 'text-warning'
//         : 'text-success';
//
//     return { label, className };
// }

export function getSofiaStatusPresentation(sofiaStatus: string = '') {
    if (sofiaStatus.includes('Unregistered'))
        return { text: 'Выключен', color: '#f33333' };
    if (sofiaStatus.includes('Registered'))
        return { text: 'Авторизован', color: '#0BB918' };
    return { text: 'Обновляется', color: '#cba200' };
}

export function getFsStatusPresentation(status: string = '', state: string = '') {
    if (status === 'Logged Out')
        return { text: 'Выключен', color: '#f33333' };
    if (status === 'On Call')
        return { text: 'На звонке', color: '#0d6efd' };
    if (status.includes('Available')) {
        if (state === 'Idle') return { text: 'Постобработка', color: '#cba200' };
        return { text: 'На линии', color: '#0BB918' };
    }
    return { text: status || '?', color: '#6c757d' };
}

export function getColleagueStatusPresentation(
    usr: { status?: string; ping_status?: string; state?: string; sofia_status?: string },
    isSelfOnCall: boolean
) {
    if (usr.status === 'Logged Out')
        return { label: 'оффлайн', className: 'text-muted' };
    if (isSelfOnCall || usr.status === 'On Call')
        return { label: 'активный звонок', className: 'text-primary' };

    let label = usr.ping_status
        ? `${usr.ping_status}${usr.state ? `, ${usr.state}` : ''}`
        : usr.state || usr.sofia_status || 'онлайн';

    const warn = usr.state === 'Waiting';
    return { label, className: warn ? 'text-warning' : 'text-success' };
}
