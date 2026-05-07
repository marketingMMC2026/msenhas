export const ROLE_CAPABILITIES = {
  admin: {
    viewSecrets: true,
    createSecrets: true,
    editSecrets: true,
    archiveSecrets: true,
    importSecrets: true,
    manageGroups: true,
    inviteUsers: true,
    manageUsers: true,
    viewLogs: true,
    manageSettings: true,
    managePermissions: true,
  },
  manager: {
    viewSecrets: true,
    createSecrets: true,
    editSecrets: true,
    archiveSecrets: true,
    importSecrets: false,
    manageGroups: true,
    inviteUsers: true,
    manageUsers: true,
    viewLogs: true,
    manageSettings: false,
    managePermissions: true,
  },
  editor: {
    viewSecrets: true,
    createSecrets: true,
    editSecrets: true,
    archiveSecrets: false,
    importSecrets: false,
    manageGroups: false,
    inviteUsers: false,
    manageUsers: false,
    viewLogs: false,
    manageSettings: false,
    managePermissions: false,
  },
  viewer: {
    viewSecrets: true,
    createSecrets: false,
    editSecrets: false,
    archiveSecrets: false,
    importSecrets: false,
    manageGroups: false,
    inviteUsers: false,
    manageUsers: false,
    viewLogs: false,
    manageSettings: false,
    managePermissions: false,
  },
};

export const getUserRole = (profile) => {
  if (!profile) return 'viewer';
  if (profile.is_admin === true || profile.role === 'admin') return 'admin';
  return profile.role || 'viewer';
};

export const getCapabilities = (profile) => {
  const role = getUserRole(profile);
  return ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.viewer;
};

export const hasCapability = (profile, capability) => Boolean(getCapabilities(profile)[capability]);
