<script setup lang="ts">
import UserPad from "./components/UserPad.vue";
import DocumentDisplay from "./components/DocumentDisplay.vue";
import LoginDialog from "./components/LoginDialog.vue";
import {ref, onMounted, computed} from "vue";
import DbPouchClient from "./DbPouchClient.ts";
import type { I_DocumentEntry, I_UserEntry, I_DataStructure, I_LoginResponse } from "./types.js";
import UserDisplay from "./components/UserDisplay.vue";
import StructurePad from "./components/StructurePad.vue";
import DocumentPad from "./components/DocumentPad.vue";
import StructureDisplay from "./components/StructureDisplay.vue";

enum DisplayComponent {
  documentViewer,
  userViewer,
  structureViewer
}

const authToken = ref<string | null>(null);
const expandedPanel = ref('documents'); // Default to users panel being open
const userArray = ref(<I_UserEntry[]>[]);
const docArray = ref(<I_DocumentEntry[]>[]);
const structureArray = ref(<I_DataStructure[]>[]);
let shownComponent = ref(DisplayComponent.documentViewer);
const apiClient = new DbPouchClient(window.location.href.slice(0, window.location.href.lastIndexOf('/')));
const isLoggedIn = computed(() => authToken.value !== null);
const isAdmin = ref(false);
const showLoginDialog = ref(true)
console.log(window.location.href.slice(0, window.location.href.lastIndexOf('/')));
let loadedDocument = ref<I_DocumentEntry | undefined>(undefined);
let loadedUser = ref<I_UserEntry | undefined>(undefined);
let loadedStructure = ref<I_DataStructure | undefined>(undefined);

function setToken(token: string | null) {
  console.log("Setting token:", token ? "token present" : "null");
  authToken.value = token;
  apiClient.setToken(token);
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
}

async function handleUserSelected(userID: string) {
  console.log("User selected:", userID);
  shownComponent.value = DisplayComponent.userViewer;
  console.log("Changed shown component to:", shownComponent.value, "DisplayComponent.userViewer =", DisplayComponent.userViewer);

  loadedUser.value = userArray.value.find(user => user._id === userID);
  console.log("Loaded user:", loadedUser.value);
}

async function handleDocumentSelected(documentID: string) {
  console.log("Document selected:", documentID);
  shownComponent.value = DisplayComponent.documentViewer;

  loadedDocument.value = docArray.value.find((document:I_DocumentEntry) => document._id === documentID)
  console.log("Loaded document:", loadedDocument.value);
}

async function handleStructureSelected(structureID: string) {
  console.log("Structure selected:", structureID);
  shownComponent.value = DisplayComponent.structureViewer;

  loadedStructure.value = structureArray.value.find(structure => structure._id?.toString() === structureID);
  console.log("Loaded structure:", loadedStructure.value);
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
}

function handleLoginSuccess(loginInformation : I_LoginResponse | null) {
  if (loginInformation !== null) {
    console.log("Login success, setting token");
    setToken(loginInformation.token);
    if (loginInformation.isAdmin !== undefined) {
      localStorage.setItem('isAdmin', String(loginInformation.isAdmin));
    }
    fetchData();
  }
  else {
    console.log("Login failed, token not set");
    setToken(null);
  }
}

onMounted(async () => {
  const storedToken = localStorage.getItem('authToken');
  const storedIsAdmin = localStorage.getItem('isAdmin');

  if (storedToken) {
    console.log("Found token in local storage. Setting it.");
    setToken(storedToken);
    if (storedIsAdmin !== null) {
      isAdmin.value = storedIsAdmin === 'true';
    }

    await fetchData();
  }
});

function handleDialogUpdate(isUnknown: boolean) {
  showLoginDialog.value = isUnknown;
  if (isUnknown) {
    // Clean all data from client
    userArray.value = [];
    docArray.value = [];
    structureArray.value = [];
    loadedDocument.value = undefined;
    loadedUser.value = undefined;
    loadedStructure.value = undefined;
  }
}

function handleUserUpdate(userID: string, field: string, value: any) {
  console.log(`App.vue - handleUserUpdate called with: ${userID}, ${field}, ${value}`);

  // Added safety checks
  if (userID === undefined || field === undefined) {
    console.error('Invalid parameters for user update:', {userID, field, value});
    return;
  }

  apiClient.updateUser(userID, {[field]: value})
    .then((response) => {
      console.log("User updated successfully, response:", response);
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
          loadedUser.value = { ...originalUser };
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

function handleLogout() {
  setToken(null);
  isAdmin.value = false;
  localStorage.removeItem('isAdmin');
  userArray.value = [];
  docArray.value = [];
  structureArray.value = [];
  loadedDocument.value = undefined;
  loadedUser.value = undefined;
  loadedStructure.value = undefined;
  shownComponent.value = DisplayComponent.documentViewer;
  showLoginDialog.value = true;
}

function handleApiError(error: unknown, context: string = "API operation") {
  console.error(`Error during ${context}:`, error);

  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('Unauthorized') || 
        error.message.includes('403') || error.message.includes('Forbidden')) {
      setToken(null);
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
</script>

<template>
  <v-app>
    <v-main>
      <v-app-bar color="primary" dark>
        <v-app-bar-title>DocPouch Administration</v-app-bar-title>
        <v-spacer></v-spacer>

        <v-btn v-if="isLoggedIn" @click="handleLogout" variant="text" color="white">
          <v-icon start>mdi-logout</v-icon>Logout
        </v-btn>
      </v-app-bar>
      <v-container class="fill-height">
        <v-row>
          <v-col cols="4">
            <!-- Replace the three individual rows with expansion panels -->
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
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel value="structures">
                <v-expansion-panel-title>
                  <v-icon start>mdi-table</v-icon>
                  Data Structures
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
                    :documentList="docArray"
                    :api-client="apiClient" 
                    @document-list-changed="fetchData"
                    @document-removed="handleDocumentRemoved"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-col>

          <v-col cols="8">
            <DocumentDisplay 
              id="2" 
              :object="loadedDocument" 
              v-show="shownComponent === DisplayComponent.documentViewer"
            />
            <UserDisplay
              :user="loadedUser" 
              @user-updated="handleUserUpdate"
              v-if="shownComponent === DisplayComponent.userViewer"
            />
            <StructureDisplay
              :structure="loadedStructure"
              :is-admin="isAdmin"
              v-if="shownComponent === DisplayComponent.structureViewer"
            />
          </v-col>
        </v-row>
      </v-container>

      <!-- Login Dialog -->
      <LoginDialog
        v-model:show="showLoginDialog"
        :api-client="apiClient"
        @login-success="handleLoginSuccess"
        @update:show="handleDialogUpdate"
      />
    </v-main>
  </v-app>
</template>
