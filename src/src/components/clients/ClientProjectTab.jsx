import ProjectWorkspace from './ProjectWorkspace.jsx';

export default function ClientProjectTab({ client, users = [], canCreateProject = false }) {
  return (
    <ProjectWorkspace
      client={client}
      users={users}
      canCreateProject={canCreateProject}
    />
  );
}
