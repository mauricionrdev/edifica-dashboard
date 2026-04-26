import { api } from './client.js';

export function getOnboarding(clientId) {
  return api.get(`/clients/${encodeURIComponent(clientId)}/onboarding`);
}

export function saveOnboarding(clientId, sections) {
  return api.put(`/clients/${encodeURIComponent(clientId)}/onboarding`, {
    sections,
  });
}

export function listMyOnboardingTasks() {
  return api.get('/clients/onboarding/my-tasks');
}

export function updateOnboardingTaskStatus(clientId, { sectionIndex, taskIndex, done, status }) {
  return api.patch(`/clients/${encodeURIComponent(clientId)}/onboarding/task-status`, { sectionIndex, taskIndex, done, status });
}
