<script setup lang="ts">
import UserPad from "./components/UserPad.vue";
import DocumentDisplay from "./components/DocumentDisplay.vue";
import LoginDialog from "./components/LoginDialog.vue";
import {ref, onMounted, computed, watch} from "vue";
import DbPouchClient from "docpouch-client";
import ImportDatabaseDialog from "./components/ImportDatabaseDialog.vue";
import UserDisplay from "./components/UserDisplay.vue";
import StructurePad from "./components/StructurePad.vue";
import DocumentPad from "./components/DocumentPad.vue";
import StructureDisplay from "./components/StructureDisplay.vue";
import StructurePropagationDialog from "./components/StructurePropagationDialog.vue";
import {
  buildPropagationPlan,
  type FieldRenameMap,
  type IStructureDiff
} from "./components/structurePropagation/index.ts";
import docPouchLogo from '@/srv/assets/docPouch.png';
import AboutDialog from "./components/AboutDialog.vue";
import UpdateAvailableDialog from "./components/UpdateAvailableDialog.vue";
import ApiKeyManagementDialog from "./components/ApiKeyManagementDialog.vue";
import type {
  I_EventString,
  I_DocumentEntry,
  I_UserEntry,
  I_DataStructure,
  I_LoginResponse,
  I_OidcClientConfig
} from "docpouch-client";

interface I_LegacyDocumentType {
  _id?: string;
  name: string;
  type: number;
  subType: number;
  subtype?: number;
  description?: string;
  defaultStructureID?: string;
  defaultStructure?: string;
}

const serverPort = 3030;

const oidcConfig = ref<I_OidcClientConfig | null>(null);
enum DisplayComponent {
  documentViewer,
  userViewer,
  structureViewer
}

const authToken = ref<string | null>(null);
let loggedInUsername = ref<string | undefined>(undefined);
const expandedPanel = ref('documents'); // Default to users panel being open
const userArray = ref(<I_UserEntry[]>[]);
const docArray = ref(<I_DocumentEntry[]>[]);
const structureArray = ref(<I_DataStructure[]>[]);
const typeArray = ref(<I_LegacyDocumentType[]>[]);
let shownComponent = ref(DisplayComponent.documentViewer);
const apiClient = new DbPouchClient(window.location.origin, 0, handleNetworkEvent);
const isLoggedIn = computed(() => authToken.value !== null);
const showLoginDialog = ref(true)
const showOidcLogin = ref(false)
const showAboutDialog = ref(false)
const showImportDialog = ref(false)
const showApiKeyDialog = ref(false)
const realtimeUpdates = ref(false);
let loadedDocument = ref<I_DocumentEntry | undefined>(undefined);
let loadedUser = ref<I_UserEntry | undefined>(undefined);
let loadedStructure = ref<I_DataStructure | undefined>(undefined);
const snackBarMessage = ref('');
const snackBarVisible = ref(false);
const showUpdateDialog = ref(false);
const faultyDocuments = ref<I_DocumentEntry[]>([]);
const showConsistencyAlert = ref(false);
const showPropagationDialog = ref(false);
const pendingPropagation = ref<{
  newStructure: I_DataStructure;
  previousStructure: I_DataStructure | undefined;
  diff: IStructureDiff;
  affectedDocumentsCount: number;
} | null>(null);
let isAdmin = ref(localStorage.getItem('isAdmin') === 'true');

function setIsAdmin(value: boolean) {
  isAdmin.value = value;
  if (value) {
    localStorage.setItem('isAdmin', 'true');
  } else {
    localStorage.removeItem('isAdmin');
  }
}

function setToken(token: string | null) {
  console.log("Setting token:", token ? "token present" : "null");
  authToken.value = token;
  apiClient.setToken(token);

  if (token) {
    localStorage.setItem('authToken', token);
    apiClient.persistAuthMethod('jwt');
  } else {
    localStorage.removeItem('authToken');
  }
}

watch(authToken, (newToken) => {
  if (newToken !== null && realtimeUpdates.value === true) {
    fetchData();
    apiClient.setRealTimeSync(true);
    console.log("Activating realtime updates.")
  } else {
    apiClient.setRealTimeSync(false);
    console.log("De-activating realtime updates.")
  }
})

watch(realtimeUpdates, (newVal, oldVal) => {
  if (newVal && authToken.value !== null) {
    fetchData();
    apiClient.setRealTimeSync(true);
    console.log("Activating realtime updates.")
  } else {
    apiClient.setRealTimeSync(false);
    console.log("De-activating realtime updates.")
  }
})

function handleNetworkEvent(event: I_EventString, data: any) {
  switch (event) {
    case "newUser":
    case "changedUser":
    case "removedUser":
      apiClient.listUsers().then(users => {
        userArray.value = users;
      })
      break;

    case "newStructure":
    case "changedStructure":
    case "removedStructure":
      apiClient.getStructures().then(structures => {
        structureArray.value = structures;
      })
      break;

    case "newDocument":
    case "changedDocument":
    case "removedDocument":
      apiClient.listDocuments().then(documents => {
        docArray.value = documents;
        if (loadedDocument.value) {
          loadedDocument.value = documents.find(doc => doc._id === loadedDocument.value?._id);
        }
      })
      break;

    case "newType":
    case "changedType":
    case "removedType":
      fetchLegacyTypes();
      break

    case "databaseInconsistency" as any:
      faultyDocuments.value = data.faultyDocuments;
      showConsistencyAlert.value = true;
      break;

  }
}

async function handleUserSelected(userID: string) {
  console.log("User selected:", userID);
  shownComponent.value = DisplayComponent.userViewer;
  console.log("Changed shown component to:", shownComponent.value, "DisplayComponent.userViewer =", DisplayComponent.userViewer);
  loadedUser.value = userArray.value.find(user => user._id === userID);
  console.log("Loaded user:", loadedUser.value);
}

async function handleStructureSelected(structureID: string) {
  console.log("Structure selected:", structureID);
  shownComponent.value = DisplayComponent.structureViewer;

  loadedStructure.value = structureArray.value.find(structure => structure._id?.toString() === structureID);
  console.log("Loaded structure:", loadedStructure.value);
}

async function handleDocumentUpdate(document: I_DocumentEntry | undefined) {
  if (document) {
    apiClient.updateDocument(document._id, document).then(() => {
      successfullySaved();
      fetchData().then(() => {
        handleDocumentSelected(document._id);
      });
    }).catch(error => {
      console.error("Error updating document:", error);
      handleApiError(error, "updating document");
    });
  }
}

async function handleDocumentRemoved(documentID: string) {
  apiClient.removeDocument(documentID)
      .then(() => {
        if (loadedDocument.value && loadedDocument.value._id === documentID) {
          loadedDocument.value = undefined;
        }
        fetchData();
      })
      .catch(error => {
        console.error("Error removing document:", error);
        handleApiError(error, "removing document");
      });
}

async function handleDocumentSelected(documentID: string) {
  shownComponent.value = DisplayComponent.documentViewer;
  loadedDocument.value = docArray.value.find((document: I_DocumentEntry) => document._id === documentID)
}

async function handleDocumentLinkMissing(documentID: string) {
  snackBarMessage.value = `Referenced document not found: ${documentID}`;
  snackBarVisible.value = true;
}

async function handleStructureRemoved(structureID: string) {
  apiClient.removeStructure(structureID)
      .then(() => {
        if (loadedStructure.value && loadedStructure.value._id?.toString() === structureID) {
          loadedStructure.value = undefined;
          shownComponent.value = DisplayComponent.documentViewer;
        }
        fetchData();
      })
      .catch(error => {
        console.error("Error removing structure:", error);
        handleApiError(error, "removing structure");
      });
}

async function handleStructureUpdate(structure: I_DataStructure) {
  if (!structure._id) {
    return;
  }

  apiClient.updateStructure(structure._id, structure).then(() => {
    successfullySaved();
    fetchData().then(() => {
      handleStructureSelected(structure._id as string);
    });
  }).catch(error => {
    console.error("Error updating structure:", error);
    handleApiError(error, "updating structure");
  });
}

async function handleImportCompleted(_scope: 'all' | 'users' | 'documents' | 'structures' | 'types') {
  // The dialog already triggers a logout on scope=all/users import, so by
  // the time we run the user is back at the login screen. For non-user
  // scopes we still need to refresh local caches so the imported records
  // show up immediately, even when real-time updates are disabled.
  if (authToken.value !== null) {
    await fetchData();
  }
}

const affectedDocumentsForLoadedStructure = computed(() => {
  if (!loadedStructure.value) {
    return 0;
  }
  const targetType = loadedStructure.value.type;
  const targetSubType = loadedStructure.value.subType;
  return docArray.value.filter(doc =>
      doc.type === targetType && doc.subType === targetSubType
  ).length;
});

function handleStructureSaveRequested(payload: {
  newStructure: I_DataStructure;
  previousStructure: I_DataStructure | undefined;
  diff: IStructureDiff;
  affectedDocumentsCount: number;
}) {
  pendingPropagation.value = payload;
  showPropagationDialog.value = true;
}

async function handlePropagationCancel() {
  showPropagationDialog.value = false;
  pendingPropagation.value = null;
  if (loadedStructure.value) {
    handleStructureSelected(loadedStructure.value._id as string);
  }
}

async function handlePropagationSaveStructureOnly() {
  const pending = pendingPropagation.value;
  showPropagationDialog.value = false;
  pendingPropagation.value = null;
  if (!pending) {
    return;
  }
  await handleStructureUpdate(pending.newStructure);
}

async function handlePropagationSaveAndPropagate(renameMap: FieldRenameMap) {
  const pending = pendingPropagation.value;
  showPropagationDialog.value = false;
  pendingPropagation.value = null;
  if (!pending || !pending.newStructure._id) {
    return;
  }

  const structureID = pending.newStructure._id;
  const structureType = pending.newStructure.type;
  const structureSubType = pending.newStructure.subType;

  apiClient.updateStructure(structureID, pending.newStructure).then(async () => {
    successfullySaved();
    const affectedDocs = docArray.value.filter(doc =>
        doc.type === structureType && doc.subType === structureSubType
    );
    let successCount = 0;
    let failureCount = 0;
    for (const doc of affectedDocs) {
      const plan = buildPropagationPlan(
          pending.previousStructure,
          pending.newStructure,
          doc.content,
          renameMap
      );
      try {
        await apiClient.updateDocument(doc._id, {...doc, content: plan.newContent});
        successCount += 1;
      } catch (error) {
        failureCount += 1;
        console.error(`Error propagating structure to document ${doc._id}:`, error);
      }
    }
    if (failureCount === 0) {
      snackBarMessage.value = `Structure updated. Propagated to ${successCount} document${successCount === 1 ? "" : "s"}.`;
    } else {
      snackBarMessage.value = `Structure updated. Propagated to ${successCount} document${successCount === 1 ? "" : "s"}; ${failureCount} failed.`;
    }
    snackBarVisible.value = true;
    await fetchData();
    handleStructureSelected(structureID);
  }).catch(error => {
    console.error("Error updating structure:", error);
    handleApiError(error, "updating structure");
  });
}

async function fetchLegacyTypes() {
  const token = authToken.value;
  if (!token) {
    typeArray.value = [];
    return;
  }

  try {
    const response = await fetch('/types/list', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      typeArray.value = [];
      return;
    }

    typeArray.value = await response.json();
  } catch (error) {
    console.debug("Legacy document type list unavailable; skipping legacy type migration.", error);
    typeArray.value = [];
  }
}

async function fetchData() {
  if (authToken.value === null) {
    console.log("Token is null, not fetching data.")
    showLoginDialog.value = true;
    return
  }
  showLoginDialog.value = false;

  // Fetch users
  try {
    userArray.value = await apiClient.listUsers();
  } catch (error) {
    handleApiError(error, "fetching users");
  }

  // Fetch document list
  console.debug("Fetching documents");
  try {
    console.log("Listing documents")
    docArray.value = await apiClient.listDocuments();
  } catch (error) {
    handleApiError(error, "fetching documents");
    docArray.value = [];
  }

  // Fetch structures
  console.debug("Fetching structures");
  try {
    structureArray.value = await apiClient.getStructures();
  } catch (error) {
    handleApiError(error, "fetching structures");
    structureArray.value = [];
  }

  // Fetch legacy document types for pre-2.0.0 migration only.
  await fetchLegacyTypes();

  await migrateDatabase();
}

function handleLoginSuccess(loginInformation: I_LoginResponse | null) {
  if (loginInformation !== null) {
    console.log("Login success, setting token");
    if (loginInformation.isAdmin !== undefined) {
      setIsAdmin(loginInformation.isAdmin);
    }
    setToken(loginInformation.token ?? null);
    loggedInUsername.value = loginInformation.userName;
    fetchData();
  } else {
    console.log("Login failed, token not set");
    setToken(null);
  }
}

async function checkForUpdates() {
  try {
    const response = await fetch('/version/check');
    if (response.ok) {
      const data = await response.json();
      if (data.hasUpdate) {
        showUpdateDialog.value = true;
      }
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
  }
}

async function syncOidcUserInfo() {
  try {
    const me = await apiClient.getCurrentUser();
    if (me) {
      loggedInUsername.value = me.name;
      setIsAdmin(me.isAdmin);
      return true;
    }
  } catch {
  }
  return false;
}

onMounted(async () => {
  // Fetch OIDC config for later use
  try {
    const config = await apiClient.fetchOidcClientConfig();
    if (config) {
      oidcConfig.value = config;
      showOidcLogin.value = true;
      apiClient.setOidcConfig(config);
    }
  } catch {
  }

  // Use initAuth() to handle all session restoration
  const authState = await apiClient.initAuth();
  if (authState.method !== 'none' && authState.token) {
    authToken.value = authState.token;
    showLoginDialog.value = false;
    if (authState.method === 'oidc') {
      await syncOidcUserInfo();
    }
    await fetchData();
    await checkForUpdates();
  }
});

async function startOidcLogin() {
  try {
    if (!oidcConfig.value) {
      const config = await apiClient.fetchOidcClientConfig();
      if (config) {
        oidcConfig.value = config;
      }
    }
    if (oidcConfig.value) {
      await apiClient.loginWithOidc(oidcConfig.value);
    }
  } catch (e) {
    console.error("OIDC login failed:", e);
  }
}

function handleDialogUpdate(isUnknown: boolean) {
  showLoginDialog.value = isUnknown;
  if (isUnknown) {
    // Clean all data from client
    userArray.value = [];
    docArray.value = [];
    structureArray.value = [];
    typeArray.value = [];
    loadedDocument.value = undefined;
    loadedUser.value = undefined;
    loadedStructure.value = undefined;
  }
}

function handleUserUpdate(userID: string, field: string, value: any) {
  // Added safety checks
  if (userID === undefined || field === undefined) {
    console.error('Invalid parameters for user update:', {userID, field, value});
    return;
  }

  apiClient.updateUser(userID, {[field]: value, _id: userID})
      .then(() => {
        successfullySaved()
        fetchData().then(() => {
          handleUserSelected(userID);
        });
      })
      .catch(error => {
        console.error("Error updating user:", error);
        handleApiError(error, "updating user");

        if (loadedUser.value && loadedUser.value._id === userID) {
          const originalUser = userArray.value.find(u => u._id === userID);
          if (originalUser) {
            loadedUser.value = {...originalUser};
          }
        }

      });
}

function handleUserRemoved(userID: string) {
  apiClient.removeUser(userID)
      .then(() => {
        if (loadedUser.value && loadedUser.value._id === userID) {
          loadedUser.value = undefined;
          shownComponent.value = DisplayComponent.documentViewer;
        }
        fetchData();
      })
      .catch(error => {
        console.error("Error removing user:", error);
        handleApiError(error, "removing user");
      });
}

async function handleLogout() {
  // The OIDC logout flow preserves the local UI state (e.g. an "in
  // progress" indicator) until the user comes back from the OIDC
  // provider's confirmation page. We therefore:
  //
  //  - Mark the logout as in progress so wasJustLoggedOut() knows to
  //    act on the post-redirect URL.
  //  - Tell the apiClient to redirect to the OIDC end_session endpoint
  //    (or, for JWT, clear the JWT token client-side immediately).
  //  - Optimistically clear the in-memory UI state so any in-flight
  //    API calls fail and the spinner shows up while the OIDC redirect
  //    is being prepared.
  //
  // Critically, we do NOT clear docpouch_oidc_session or authMethod
  // from localStorage here. If the user clicks "No, stay signed in" on
  // the OIDC confirmation page, the OIDC session on the server is
  // preserved (see /oidc/cancel-logout in NetworkManager.ts) and we
  // need the local OIDC tokens intact so restoreOidcSession() can put
  // the user back where they were without a fresh login.
  //
  // If the user confirms the logout, the OIDC provider destroys the
  // server-side session and redirects back. wasJustLoggedOut() then
  // returns true and initAuth()/clearAuth() explicitly clears the OIDC
  // session from localStorage.
  sessionStorage.setItem('docpouch_logout_in_progress', 'true');
  apiClient.logout();
  authToken.value = null;
  setIsAdmin(false);
  userArray.value = [];
  docArray.value = [];
  structureArray.value = [];
  typeArray.value = [];
  loadedDocument.value = undefined;
  loadedUser.value = undefined;
  loadedStructure.value = undefined;
  shownComponent.value = DisplayComponent.documentViewer;
  showLoginDialog.value = true;
  loggedInUsername.value = '';
}

function handleApiError(error: unknown, context: string = "API operation") {
  console.error(`Error during ${context}:`, error);

  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('Unauthorized') ||
        error.message.includes('403') || error.message.includes('Forbidden')) {
      apiClient.logout();
      authToken.value = null;
      apiClient.clearPersistedAuthState();
      setIsAdmin(false);
      showLoginDialog.value = true;
    } else if (error.message.includes('204')) {
      if (context.includes("specific document")) {
        console.info("The requested document was not found.");
      } else {
        console.warn(`Endpoint not found during ${context}. This API feature might not be implemented yet.`);
      }
    }
  }
}

function successfullySaved() {
  snackBarMessage.value = 'Save successful!';
  snackBarVisible.value = true;
}

type ExportScope = 'all' | 'users' | 'documents' | 'structures';
type ExportFormat = 'zip' | 'json';

function getFilenameFromContentDisposition(headerValue: string | null, fallback: string): string {
  if (!headerValue) {
    return fallback;
  }

  const match = headerValue.match(/filename="?([^"]+)"?/i);
  return match && match[1] ? match[1] : fallback;
}

async function handleExportDatabase(scope: ExportScope = 'all', format: ExportFormat = 'zip') {
  try {
    const params = new URLSearchParams({
      scope,
      format
    });
    const exportUrl = `/database/export?${params.toString()}`;
    
    const token = authToken.value;
    if (!token) {
      snackBarMessage.value = 'You must be logged in to export the database.';
      snackBarVisible.value = true;
      return;
    }

    snackBarMessage.value = `Exporting ${scope} (${format.toUpperCase()}), please wait...`;
    snackBarVisible.value = true;

    const response = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401 || response.status === 403) {
      setToken(null);
      showLoginDialog.value = true;
      throw new Error(`Export failed: ${response.status} ${response.statusText}`);
    } else if (!response.ok) {
      throw new Error(`Export failed: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const fallbackFilename = scope === 'all'
        ? (format === 'zip' ? 'docpouch-database.zip' : 'docpouch-database.json')
        : `docpouch-${scope}.json`;
    const filename = getFilenameFromContentDisposition(response.headers.get('content-disposition'), fallbackFilename);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);

    snackBarMessage.value = `Export successful: ${filename}`;
    snackBarVisible.value = true;
  } catch (error: any) {
    console.error('Error exporting database:', error);
    snackBarMessage.value = `Error exporting database: ${error.message}`;
    snackBarVisible.value = true;
  }
}

async function migrateDatabase() {
  // pre-1.1.0
  console.log("Checking for database migration... (pre-1.1.0");
  for (const doc of docArray.value) {
    if (doc.public === undefined) {
      console.log(`Migrating document ${doc._id}: adding public: false`);
      doc.public = false;
      try {
        await apiClient.updateDocument(doc._id, doc);
      } catch (error) {
        console.error(`Error migrating document ${doc._id}:`, error);
      }
    }
  }

  // pre-1.3.4
  console.log("Checking for database migration... (pre-1.3.4");
  for (const struct of structureArray.value) {
    if (struct._id) {
      for (let field of struct.fields) {
        if (field.displayName === undefined) {
          console.log(`Migrating document ${struct._id}: adding displayName: ${field.name}`);
          field.displayName = field.name;
          try {
            await apiClient.updateStructure(struct._id, struct);
          } catch (error) {
            console.error(`Error migrating document ${struct._id}:`, error);
          }
        }
      }
    }
  }

  // pre-2.0.0
  console.log("Checking for database migration... (pre-2.0");
  let typeMap = new Map<string, string>()
  for (let type of typeArray.value) {
    const defaultStructureID = type.defaultStructureID ?? type.defaultStructure;
    const subType = type.subType ?? type.subtype;
    if (defaultStructureID !== undefined && subType !== undefined) {
      typeMap.set(defaultStructureID, `${type.type}-${subType}`)
    }
  }
  for (const struct of structureArray.value) {
    if (struct._id) {
      if (!struct.type || !struct.subType) {
        let typeString = typeMap.get(struct._id)
        if (typeString) {
          let [type, subType] = typeString.split("-");
          struct.type = Number(type);
          struct.subType = Number(subType);
          try {
            await apiClient.updateStructure(struct._id, struct);
          } catch (error) {
            console.error(`Error adding type-subtype to document ${struct._id}:`, error);
          }
        }
      }
    }
  }
}
</script>

<template>
  <v-app>
    <v-main>
      <v-app-bar color="primary" dark>
        <v-img
            :src="docPouchLogo"
            max-height="40"
            max-width="40"
            contain
            class="mr-2 ml-3"
            @click="showAboutDialog = true"
        ></v-img>

        <v-app-bar-title>DocPouch Administration <small>[User: {{ loggedInUsername }}]</small></v-app-bar-title>
        <v-spacer></v-spacer>
        <div v-if="isLoggedIn" class="d-flex align-center mr-4">
          <v-btn
              v-if="!realtimeUpdates"
              class="mr-2"
              color="white"
              icon
              title="Refresh data"
              variant="text"
              @click="fetchData"
          >
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
          <v-switch
              v-model="realtimeUpdates"
              color="white"
              hide-details
              density="compact"
              class="mt-0 pt-0"
          >
            <template v-slot:label>
              <span class="text-white">Realtime Updates</span>
            </template>
          </v-switch>
        </div>

        <!-- Replaced buttons with a dropdown menu -->
        <v-menu :close-on-content-click="false" location="end">
          <template v-slot:activator="{ props }">
            <v-btn v-if="isLoggedIn" class="mr-2" color="white" v-bind="props" variant="text">
              <v-icon start>mdi-dots-vertical</v-icon>
              Menu
            </v-btn>
          </template>

          <v-list>
            <v-list-item @click="handleExportDatabase('all', 'zip')">
              <v-list-item-icon>
                <v-icon>mdi-database-export</v-icon>
              </v-list-item-icon>
              <v-list-item-title>Export Database (ZIP)</v-list-item-title>
            </v-list-item>

            <v-list-item @click="handleExportDatabase('documents', 'json')">
              <v-list-item-icon>
                <v-icon>mdi-file-document-outline</v-icon>
              </v-list-item-icon>
              <v-list-item-title>Export Documents (JSON)</v-list-item-title>
            </v-list-item>

            <v-list-item @click="handleExportDatabase('users', 'json')">
              <v-list-item-icon>
                <v-icon>mdi-account-outline</v-icon>
              </v-list-item-icon>
              <v-list-item-title>Export Users (JSON)</v-list-item-title>
            </v-list-item>

            <v-list-item @click="handleExportDatabase('structures', 'json')">
              <v-list-item-icon>
                <v-icon>mdi-table</v-icon>
              </v-list-item-icon>
              <v-list-item-title>Export Structures (JSON)</v-list-item-title>
            </v-list-item>

            <v-list-item @click="showImportDialog = true">
              <v-list-item-icon>
                <v-icon>mdi-database-import</v-icon>
              </v-list-item-icon>
              <v-list-item-title>Import Database</v-list-item-title>
            </v-list-item>

            <v-list-item @click="showApiKeyDialog = true">
              <v-list-item-icon>
                <v-icon>mdi-key</v-icon>
              </v-list-item-icon>
              <v-list-item-title>API Keys</v-list-item-title>
            </v-list-item>

            <v-list-item @click="handleLogout">
              <v-list-item-icon>
                <v-icon>mdi-logout</v-icon>
              </v-list-item-icon>
              <v-list-item-title>Logout</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-app-bar>
      <v-alert v-if="showConsistencyAlert" class="ma-4" closable type="error" variant="tonal"
               @click:close="showConsistencyAlert = false">
        <strong>Database Inconsistency Detected!</strong>
        The following documents have invalid owners or structure references:
        <ul class="mt-2">
          <li v-for="doc in faultyDocuments" :key="doc._id">
            <strong>{{ doc.title }}</strong> (ID: {{ doc._id }}) - Owner: {{ doc.owner }}, Type: {{ doc.type }},
            Subtype: {{ doc.subType }}
          </li>
        </ul>
      </v-alert>

      <v-container class="h-100 px-4">
        <v-row class="mx-0">
          <v-col cols="6">
            <v-expansion-panels v-model="expandedPanel">
              <v-expansion-panel value="users">
                <v-expansion-panel-title>
                  <v-icon start>mdi-account-group</v-icon>
                  Users
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <UserPad
                      @user-selected="handleUserSelected"
                      :userlist="userArray"
                      :api-client="apiClient"
                      @user-list-changed="fetchData"
                      @user-removed="handleUserRemoved"
                      :department-list="userArray.map(user => user.department)"
                      :group-list="userArray.map(user => user.group)"
                      :is-admin="isAdmin"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel value="structures">
                <v-expansion-panel-title>
                  <v-icon start>mdi-table</v-icon>
                  Document Structures
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <StructurePad
                      @structure-selected="handleStructureSelected"
                      :structurelist="structureArray"
                      :api-client="apiClient"
                      :is-admin="isAdmin"
                      @structure-list-changed="fetchData"
                      @structure-removed="handleStructureRemoved"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel value="documents">
                <v-expansion-panel-title>
                  <v-icon start>mdi-file-document-multiple</v-icon>
                  Documents
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <DocumentPad
                      @document-selected="handleDocumentSelected"
                      :userlist="userArray"
                      :documentList="docArray"
                      :api-client="apiClient"
                      :document-structures="structureArray"
                      :is-admin="isAdmin"
                      @document-list-changed="fetchData"
                      @document-removed="handleDocumentRemoved"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-col>

          <v-col cols="6">
            <DocumentDisplay
                id="2"
                :object="loadedDocument"
                :structure-list="structureArray"
                :api-client="apiClient"
                v-show="shownComponent === DisplayComponent.documentViewer"
                @update:object="handleDocumentUpdate"
                @document-link-clicked="handleDocumentSelected"
                @structure-link-clicked="handleStructureSelected"
                @document-link-missing="handleDocumentLinkMissing"
            />
            <UserDisplay
                :user="loadedUser"
                :department-list="[...new Set(userArray.map(user => user.department))]"
                :group-list="[...new Set(userArray.map(user => user.group))]"
                @user-updated="handleUserUpdate"
                v-if="shownComponent === DisplayComponent.userViewer"
            />
            <StructureDisplay
                :displayStructure="loadedStructure"
                :structure-list="structureArray"
                :is-admin="isAdmin"
                :affected-documents-count="affectedDocumentsForLoadedStructure"
                @update:structure="handleStructureUpdate"
                @save-requested="handleStructureSaveRequested"
                v-if="shownComponent === DisplayComponent.structureViewer"
            />
          </v-col>
        </v-row>
      </v-container>
      <v-snackbar v-model="snackBarVisible" :timeout="3000" top right>
        {{ snackBarMessage }}
      </v-snackbar>
      <v-footer app class="bg-grey-lighten-3 px-4">
        <div class="text-center w-100">
          <div class="text-caption text-grey">
            DocPouch is provided under the MIT License. This software is provided "as is", without warranty of any kind.
            <v-btn
                variant="text"
                density="compact"
                color="primary"
                href="https://opensource.org/licenses/MIT"
                target="_blank"
            >
              View License
            </v-btn>
          </div>
        </div>
      </v-footer>
      <LoginDialog v-if="!authToken" v-model:show="showLoginDialog"
                   :api-client="apiClient" :show-oidc="showOidcLogin"
                   @login-success="handleLoginSuccess"
                   @oidc-login="startOidcLogin"
                   @update:show="handleDialogUpdate"/>
      <AboutDialog :show="showAboutDialog" @close="showAboutDialog = false"/>
      <ImportDatabaseDialog :api-client="apiClient" :show="showImportDialog" @close="showImportDialog = false"
                            @imported="handleImportCompleted" @logout="handleLogout"/>
      <UpdateAvailableDialog :show="showUpdateDialog" @close="showUpdateDialog = false"/>
      <ApiKeyManagementDialog :api-client="apiClient" :show="showApiKeyDialog"
                              @update:show="showApiKeyDialog = $event"/>
      <StructurePropagationDialog
          :affected-documents-count="pendingPropagation?.affectedDocumentsCount ?? 0"
          :new-structure="pendingPropagation?.newStructure"
          :old-structure="pendingPropagation?.previousStructure"
          :show="showPropagationDialog"
          @cancel="handlePropagationCancel"
          @save-structure-only="handlePropagationSaveStructureOnly"
          @save-and-propagate="handlePropagationSaveAndPropagate"
      />
    </v-main>
  </v-app>
</template>
