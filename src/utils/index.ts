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
