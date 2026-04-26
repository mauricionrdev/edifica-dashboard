import { api } from './client.js';

export function listProjects() {
  return api.get('/projects');
}

export function getProject(id) {
  return api.get(`/projects/${encodeURIComponent(id)}`);
}

export function deleteProject(id) {
  return api.del(`/projects/${encodeURIComponent(id)}`);
}

export function createProjectSection(id, body) {
  return api.post(`/projects/${encodeURIComponent(id)}/sections`, body);
}

export function updateProjectSection(id, sectionId, body) {
  return api.patch(`/projects/${encodeURIComponent(id)}/sections/${encodeURIComponent(sectionId)}`, body);
}

export function deleteProjectSection(id, sectionId) {
  return api.delete(`/projects/${encodeURIComponent(id)}/sections/${encodeURIComponent(sectionId)}`);
}

export function reorderProjectSections(id, sectionIds) {
  return api.patch(`/projects/${encodeURIComponent(id)}/sections/order`, { sectionIds });
}

export function reorderProjectTasks(id, groups) {
  return api.patch(`/projects/${encodeURIComponent(id)}/tasks/order`, { groups });
}

export function addProjectMember(id, body) {
  return api.post(`/projects/${encodeURIComponent(id)}/members`, body);
}

export function removeProjectMember(id, userId) {
  return api.delete(`/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`);
}

export function getClientProject(clientId) {
  return api.get(`/projects/client/${encodeURIComponent(clientId)}`);
}

export function createClientProject(clientId, body = {}) {
  return api.post(`/projects/client/${encodeURIComponent(clientId)}`, body);
}

export function createTask(body) {
  return api.post('/projects/tasks', body);
}

export function updateTask(id, body) {
  return api.patch(`/projects/tasks/${encodeURIComponent(id)}`, body);
}

export function deleteTask(id) {
  return api.delete(`/projects/tasks/${encodeURIComponent(id)}`);
}

export function listTaskComments(id) {
  return api.get(`/projects/tasks/${encodeURIComponent(id)}/comments`);
}

export function createTaskComment(id, body) {
  return api.post(`/projects/tasks/${encodeURIComponent(id)}/comments`, body);
}

export function listTaskCollaborators(id) {
  return api.get(`/projects/tasks/${encodeURIComponent(id)}/collaborators`);
}

export function addTaskCollaborator(id, body) {
  return api.post(`/projects/tasks/${encodeURIComponent(id)}/collaborators`, body);
}

export function removeTaskCollaborator(id, userId) {
  return api.delete(`/projects/tasks/${encodeURIComponent(id)}/collaborators/${encodeURIComponent(userId)}`);
}

export function listMyProjectTasks() {
  return api.get('/projects/tasks/my/list');
}

export function listUserProjectTasks(userId) {
  return api.get(`/projects/users/${encodeURIComponent(userId)}/tasks`);
}

export function listUserProjects(userId) {
  return api.get(`/projects/users/${encodeURIComponent(userId)}/projects`);
}
