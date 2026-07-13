<script lang="ts" setup>
import {ref, onMounted, computed} from 'vue';
import {
  initService,
  loginWithOidc,
  loginWithJwt,
  logout,
  loadData,
  loadAllDocuments,
  loadSettings,
  saveSettings,
  clearSettings,
  createDocument,
  updateDocument,
  removeDocument,
  createStructure,
  updateStructure,
  removeStructure,
  createUser,
  updateUser,
  removeUser,
  toggleRealtime,
  clearAuthError,
  setUseServerConfig,
  clearDbWarning,
  isConfigured,
  isAuthenticated,
  authMethod,
  authError,
  loading,
  isAdmin,
  userName,
  documents,
  structures,
  users,
  realtimeEnabled,
  useServerConfig,
  dbWarning,
} from './composables/useDocPouch';
import type {DocumentEntry, DocumentCreation, DataStructure, UserEntry, UserCreation, ServerSettings} from './types';

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

const showConfigModal = ref(!isConfigured.value);
const showLoginModal = ref(false);
const showDocModal = ref(false);
const showStructureModal = ref(false);
const showUserModal = ref(false);
const editingDoc = ref<DocumentEntry | null>(null);
const editingStructure = ref<DataStructure | null>(null);
const editingUser = ref<UserEntry | null>(null);
const loginTab = ref<'oidc' | 'jwt'>('oidc');
const docFilterMode = ref<'typed' | 'all'>('typed');

const configUrl = ref('');
const configPort = ref('');
const configToken = ref('');

// JWT login form
const jwtName = ref('');
const jwtPassword = ref('');

const docForm = ref<DocumentCreation & { content: any }>({
  title: '',
  description: '',
  type: 0,
  subType: 0,
  content: '{}',
  shareWithGroup: false,
  shareWithDepartment: false,
  public: false,
  anonymous: false,
});

const structureForm = ref<Partial<DataStructure>>({
  name: '',
  description: '',
  type: 0,
  subType: 0,
  fields: [],
});

const fieldForm = ref({name: '', displayName: '', type: 'string', items: ''});

const userForm = ref<UserCreation>({
  name: '',
  password: '',
  email: '',
  department: '',
  group: '',
  isAdmin: false,
});

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const sortedDocuments = computed(() =>
    [...documents.value].sort((a, b) => a.title.localeCompare(b.title))
);

const sortedUsers = computed(() =>
    [...users.value].sort((a, b) => a.name.localeCompare(b.name))
);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  const settings = loadSettings();
  configUrl.value = settings.url;
  configPort.value = settings.port;
  configToken.value = settings.registrationToken;

  // initService() → client.initAuth() handles every restore path:
  // OIDC logout redirect, OIDC callback (code+state), persisted OIDC
  // session, and JWT token. If it returns false we show the login modal
  // (or the config modal if the server isn't configured yet).
  const authenticated = await initService();

  if (!authenticated) {
    if (!isConfigured.value && !useServerConfig) {
      // No server config and no localStorage override — ask the user.
      showConfigModal.value = true;
    } else {
      showLoginModal.value = true;
    }
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function openConfig() {
  const settings = loadSettings();
  configUrl.value = settings.url;
  configPort.value = settings.port;
  configToken.value = settings.registrationToken;
  showConfigModal.value = true;
}

function saveConfig() {
  saveSettings({
    url: configUrl.value,
    port: configPort.value,
    registrationToken: configToken.value,
  });
  showConfigModal.value = false;
  initService();
}

function resetConfig() {
  clearSettings();
  configUrl.value = '';
  configPort.value = '';
  configToken.value = '';
  showConfigModal.value = true;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function handleOidcLogin() {
  try {
    await loginWithOidc(configToken.value);
  } catch {
    // error is captured in authError ref
  }
}

async function handleJwtLogin() {
  if (!jwtName.value || !jwtPassword.value) return;
  try {
    await loginWithJwt(jwtName.value, jwtPassword.value);
    jwtName.value = '';
    jwtPassword.value = '';
    showLoginModal.value = false;
  } catch {
    // error is captured in authError ref
  }
}

function switchLoginTab(tab: 'oidc' | 'jwt') {
  loginTab.value = tab;
  clearAuthError();
}

// ---------------------------------------------------------------------------
// Document CRUD
// ---------------------------------------------------------------------------

function openAddDocument() {
  editingDoc.value = null;
  docForm.value = {
    title: '',
    description: '',
    type: 0,
    subType: 0,
    content: '{}',
    shareWithGroup: false,
    shareWithDepartment: false,
    public: false,
    anonymous: false,
  };
  showDocModal.value = true;
}

function editDocument(doc: DocumentEntry) {
  editingDoc.value = doc;
  docForm.value = {
    title: doc.title,
    description: doc.description || '',
    type: doc.type,
    subType: doc.subType,
    content: typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content, null, 2),
    shareWithGroup: doc.shareWithGroup,
    shareWithDepartment: doc.shareWithDepartment,
    public: doc.public,
    anonymous: (doc as any).anonymous || false,
  };
  showDocModal.value = true;
}

function parseContent(raw: any): any {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    // If it's not valid JSON, send it as a plain string wrapped in an object
    // so it satisfies the server's "content must be object or array" rule.
    return {text: raw};
  }
}

async function saveDocument() {
  try {
    const payload: DocumentCreation = {
      ...docForm.value,
      content: parseContent(docForm.value.content),
    };
    if (editingDoc.value) {
      await updateDocument(editingDoc.value._id, payload);
    } else {
      await createDocument(payload);
    }
    showDocModal.value = false;
  } catch (err: any) {
    alert(err.message || 'Save failed');
  }
}

async function deleteDocument(id: string) {
  if (!confirm('Are you sure you want to delete this document?')) return;
  try {
    await removeDocument(id);
  } catch (err: any) {
    alert(err.message || 'Delete failed');
  }
}

async function switchDocFilter(mode: 'typed' | 'all') {
  docFilterMode.value = mode;
  if (mode === 'all') {
    await loadAllDocuments();
  } else {
    await loadData();
  }
}

// ---------------------------------------------------------------------------
// Structure CRUD
// ---------------------------------------------------------------------------

function openAddStructure() {
  editingStructure.value = null;
  structureForm.value = {name: '', description: '', type: 0, subType: 0, fields: []};
  fieldForm.value = {name: '', displayName: '', type: 'string', items: ''};
  showStructureModal.value = true;
}

function editStructure(structure: DataStructure) {
  editingStructure.value = structure;
  structureForm.value = {
    _id: structure._id,
    name: structure.name,
    description: structure.description,
    type: structure.type,
    subType: structure.subType,
    fields: [...(structure.fields || [])],
  };
  fieldForm.value = {name: '', displayName: '', type: 'string', items: ''};
  showStructureModal.value = true;
}

function addField() {
  if (!fieldForm.value.name || !fieldForm.value.displayName) return;
  const f = {...fieldForm.value};
  if (!f.items) delete (f as any).items;
  structureForm.value.fields = [...(structureForm.value.fields || []), f];
  fieldForm.value = {name: '', displayName: '', type: 'string', items: ''};
}

function removeField(index: number) {
  structureForm.value.fields = (structureForm.value.fields || []).filter((_, i) => i !== index);
}

async function saveStructure() {
  try {
    if (editingStructure.value && editingStructure.value._id) {
      await updateStructure(editingStructure.value._id, structureForm.value);
    } else {
      await createStructure(structureForm.value as DataStructure);
    }
    showStructureModal.value = false;
  } catch (err: any) {
    alert(err.message || 'Save failed');
  }
}

async function deleteStructure(id: string) {
  if (!confirm('Are you sure you want to delete this structure?')) return;
  try {
    await removeStructure(id);
  } catch (err: any) {
    alert(err.message || 'Delete failed');
  }
}

// ---------------------------------------------------------------------------
// User CRUD (admin only)
// ---------------------------------------------------------------------------

function openAddUser() {
  editingUser.value = null;
  userForm.value = {
    name: '',
    password: '',
    email: '',
    department: '',
    group: '',
    isAdmin: false,
  };
  showUserModal.value = true;
}

function editUser(user: UserEntry) {
  editingUser.value = user;
  userForm.value = {
    name: user.name,
    password: '',
    email: user.email || '',
    department: user.department,
    group: user.group,
    isAdmin: user.isAdmin,
  };
  showUserModal.value = true;
}

async function saveUser() {
  try {
    if (editingUser.value) {
      const updates: any = {
        name: userForm.value.name,
        email: userForm.value.email,
        department: userForm.value.department,
        group: userForm.value.group,
        isAdmin: userForm.value.isAdmin,
      };
      if (userForm.value.password) {
        updates.password = userForm.value.password;
      }
      await updateUser(editingUser.value._id, updates);
    } else {
      await createUser(userForm.value);
    }
    showUserModal.value = false;
  } catch (err: any) {
    alert(err.message || 'Save failed');
  }
}

async function deleteUser(id: string) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  try {
    await removeUser(id);
  } catch (err: any) {
    alert(err.message || 'Delete failed');
  }
}
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <header class="main-header">
      <div class="header-content">
        <h1>DocPouch RP Template</h1>
        <div class="header-actions">
          <span v-if="isAuthenticated" class="auth-badge">
            {{ authMethod }}{{ isAdmin ? ' · admin' : '' }}
          </span>
          <span v-if="isAuthenticated && userName" class="user-name">{{ userName }}</span>
          <button v-if="isAuthenticated" :title="realtimeEnabled ? 'Disable realtime sync' : 'Enable realtime sync'" class="icon-btn"
                  @click="toggleRealtime(!realtimeEnabled)">
            {{ realtimeEnabled ? '🔴' : '⚪' }}
          </button>
          <button class="icon-btn secondary" title="Settings" @click="openConfig">⚙️</button>
          <button v-if="isAuthenticated" class="secondary-text" @click="() => logout()">Logout</button>
        </div>
      </div>
    </header>

    <!-- Database inconsistency warning (admin-only, non-blocking) -->
    <div v-if="isAuthenticated && isAdmin && dbWarning" class="db-warning">
      <span>{{ dbWarning }}</span>
      <button class="icon-btn" title="Dismiss" @click="clearDbWarning">✕</button>
    </div>

    <!-- Main -->
    <main class="main-content">
      <!-- Documents card -->
      <div v-if="isAuthenticated" class="card">
        <div class="card-header">
          <h2>Documents</h2>
          <div class="header-actions">
            <div class="filter-toggle">
              <button :class="{active: docFilterMode === 'typed'}" @click="switchDocFilter('typed')">Typed (0/0)
              </button>
              <button :class="{active: docFilterMode === 'all'}" @click="switchDocFilter('all')">All</button>
            </div>
            <button class="secondary-btn" @click="openAddStructure">+ Structure</button>
            <button class="primary-btn" @click="openAddDocument">+ Document</button>
          </div>
        </div>

        <div v-if="loading" class="info-msg">Loading…</div>
        <div v-else-if="documents.length === 0" class="info-msg">No documents yet.</div>

        <div v-else class="table-container">
          <table>
            <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Owner</th>
              <th class="actions-col">Actions</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="doc in sortedDocuments" :key="doc._id">
              <td>{{ doc.title }}</td>
              <td>{{ doc.type }} / {{ doc.subType }}</td>
              <td>{{ doc.owner }}</td>
              <td class="actions-col">
                <button class="icon-btn" title="Edit" @click="editDocument(doc)">✏️</button>
                <button class="icon-btn" title="Delete" @click="deleteDocument(doc._id)">🗑️</button>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Data Structures card -->
      <div v-if="isAuthenticated && structures.length > 0" class="card">
        <div class="card-header">
          <h2>Data Structures</h2>
          <button class="secondary-btn" @click="openAddStructure">+ Structure</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Fields</th>
              <th class="actions-col">Actions</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="s in structures" :key="s._id">
              <td>{{ s.name }}</td>
              <td>{{ s.type }} / {{ s.subType }}</td>
              <td>{{ (s.fields || []).length }} fields</td>
              <td class="actions-col">
                <button class="icon-btn" title="Edit" @click="editStructure(s)">✏️</button>
                <button class="icon-btn" title="Delete" @click="deleteStructure(s._id!)">🗑️</button>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Users card (admin only) -->
      <div v-if="isAuthenticated && isAdmin" class="card">
        <div class="card-header">
          <h2>Users</h2>
          <button class="primary-btn" @click="openAddUser">+ User</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Group</th>
              <th>Admin</th>
              <th class="actions-col">Actions</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="u in sortedUsers" :key="u._id">
              <td>{{ u.name }}</td>
              <td>{{ u.email || '—' }}</td>
              <td>{{ u.department }}</td>
              <td>{{ u.group }}</td>
              <td>{{ u.isAdmin ? '✓' : '' }}</td>
              <td class="actions-col">
                <button class="icon-btn" title="Edit" @click="editUser(u)">✏️</button>
                <button class="icon-btn" title="Delete" @click="deleteUser(u._id)">🗑️</button>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Config Modal -->
    <div v-if="showConfigModal" class="modal-overlay" @click.self="showConfigModal = false">
      <div class="modal card">
        <h2>Server Configuration</h2>
        <p class="modal-hint">
          These values are used as a fallback when the server-provided
          <code>/api/oidc-client-config</code> endpoint is unavailable.
        </p>
        <div class="form-group">
          <label>DocPouch URL</label>
          <input v-model="configUrl" placeholder="e.g. localhost or https://example.com"/>
        </div>
        <div class="form-group">
          <label>DocPouch Port</label>
          <input v-model="configPort" placeholder="e.g. 3030"/>
        </div>
        <div class="form-group">
          <label>OIDC Registration Token</label>
          <input v-model="configToken" placeholder="Ask your DocPouch admin" type="password"/>
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input :checked="useServerConfig" type="checkbox"
                   @change="setUseServerConfig(($event.target as HTMLInputElement).checked)"/>
            Use server-provided config (<code>/api/oidc-client-config</code>) first
          </label>
        </div>
        <div class="modal-actions">
          <button v-if="isConfigured" class="secondary-btn" @click="showConfigModal = false">Cancel</button>
          <button class="primary-btn" @click="saveConfig">Save</button>
        </div>
      </div>
    </div>

    <!-- Login Modal (tabbed) -->
    <div v-if="showLoginModal && !showConfigModal" class="modal-overlay">
      <div class="modal card">
        <h2>Login</h2>
        <div v-if="authError" class="error-msg">{{ authError }}</div>

        <div class="tab-bar">
          <button :class="{active: loginTab === 'oidc'}" @click="switchLoginTab('oidc')">OIDC</button>
          <button :class="{active: loginTab === 'jwt'}" @click="switchLoginTab('jwt')">Username / Password</button>
        </div>

        <!-- OIDC tab -->
        <div v-if="loginTab === 'oidc'" class="login-tab">
          <div class="modal-actions">
            <button class="secondary-btn" @click="openConfig">Server Settings</button>
            <button :disabled="!configToken" class="primary-btn" @click="handleOidcLogin">Login with OIDC</button>
          </div>
          <div v-if="!configToken" class="info-msg">
            You need an OIDC registration token. Click <strong>Server Settings</strong> to enter one.
          </div>
        </div>

        <!-- JWT tab -->
        <div v-if="loginTab === 'jwt'" class="login-tab">
          <div class="form-group">
            <label>Username</label>
            <input v-model="jwtName" placeholder="e.g. admin" @keyup.enter="handleJwtLogin"/>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input v-model="jwtPassword" placeholder="Password" type="password" @keyup.enter="handleJwtLogin"/>
          </div>
          <div class="modal-actions">
            <button class="secondary-btn" @click="openConfig">Server Settings</button>
            <button :disabled="!jwtName || !jwtPassword" class="primary-btn" @click="handleJwtLogin">Login</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Document Modal -->
    <div v-if="showDocModal" class="modal-overlay" @click.self="showDocModal = false">
      <div class="modal card doc-modal">
        <h2>{{ editingDoc ? 'Edit Document' : 'New Document' }}</h2>
        <div class="form-group">
          <label>Title</label>
          <input v-model="docForm.title"/>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input v-model="docForm.description"/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Type</label>
            <input v-model.number="docForm.type" type="number"/>
          </div>
          <div class="form-group">
            <label>SubType</label>
            <input v-model.number="docForm.subType" type="number"/>
          </div>
        </div>
        <div class="form-group">
          <label>Content (JSON)</label>
          <textarea v-model="docForm.content" placeholder="Enter valid JSON" rows="4"/>
        </div>
        <div class="form-row checkboxes">
          <label><input v-model="docForm.shareWithGroup" type="checkbox"/> Share with Group</label>
          <label><input v-model="docForm.shareWithDepartment" type="checkbox"/> Share with Department</label>
          <label><input v-model="docForm.public" type="checkbox"/> Public</label>
          <label v-if="!editingDoc"><input v-model="docForm.anonymous" type="checkbox"/> Anonymous</label>
        </div>
        <div v-if="docForm.anonymous && !editingDoc" class="info-msg">
          Anonymous documents are owned by the admin user — the <code>owner</code> field is overridden server-side.
        </div>
        <div class="modal-actions">
          <button class="secondary-btn" @click="showDocModal = false">Cancel</button>
          <button class="primary-btn" @click="saveDocument">Save</button>
        </div>
      </div>
    </div>

    <!-- Structure Modal -->
    <div v-if="showStructureModal" class="modal-overlay" @click.self="showStructureModal = false">
      <div class="modal card structure-modal">
        <h2>{{ editingStructure ? 'Edit Structure' : 'New Data Structure' }}</h2>
        <div class="form-group">
          <label>Name</label>
          <input v-model="structureForm.name"/>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input v-model="structureForm.description"/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Type</label>
            <input v-model.number="structureForm.type" type="number"/>
          </div>
          <div class="form-group">
            <label>SubType</label>
            <input v-model.number="structureForm.subType" type="number"/>
          </div>
        </div>

        <h3>Fields</h3>
        <div class="field-row">
          <input v-model="fieldForm.name" placeholder="Name"/>
          <input v-model="fieldForm.displayName" placeholder="Display Name"/>
          <select v-model="fieldForm.type">
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="array">array</option>
            <option value="object">object</option>
          </select>
          <input v-if="fieldForm.type === 'array'" v-model="fieldForm.items" placeholder="Item type"/>
          <button class="primary-btn" @click="addField">Add</button>
        </div>
        <div v-if="structureForm.fields && structureForm.fields.length" class="field-list">
          <div v-for="(f, i) in structureForm.fields" :key="i" class="field-chip">
            <span>{{ f.name }} ({{ f.type }})</span>
            <button class="icon-btn" @click="removeField(i)">✕</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="secondary-btn" @click="showStructureModal = false">Cancel</button>
          <button class="primary-btn" @click="saveStructure">Save</button>
        </div>
      </div>
    </div>

    <!-- User Modal (admin) -->
    <div v-if="showUserModal" class="modal-overlay" @click.self="showUserModal = false">
      <div class="modal card user-modal">
        <h2>{{ editingUser ? 'Edit User' : 'New User' }}</h2>
        <div class="form-group">
          <label>Username</label>
          <input v-model="userForm.name" :disabled="!!editingUser"/>
        </div>
        <div class="form-group">
          <label>Password {{ editingUser ? '(leave blank to keep)' : '' }}</label>
          <input v-model="userForm.password" type="password"/>
        </div>
        <div class="form-group">
          <label>Email</label>
          <input v-model="userForm.email" placeholder="optional"/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Department</label>
            <input v-model="userForm.department"/>
          </div>
          <div class="form-group">
            <label>Group</label>
            <input v-model="userForm.group"/>
          </div>
        </div>
        <div class="form-group checkbox-group">
          <label><input v-model="userForm.isAdmin" type="checkbox"/> Administrator</label>
        </div>
        <div class="modal-actions">
          <button class="secondary-btn" @click="showUserModal = false">Cancel</button>
          <button class="primary-btn" @click="saveUser">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-header {
  background-color: var(--navy);
  color: white;
  padding: calc(2 * var(--spacing)) 5%;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-content h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing);
}

.auth-badge {
  background: rgba(255, 255, 255, 0.15);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.user-name {
  font-size: 0.85rem;
  opacity: 0.8;
}

.main-content {
  padding: calc(4 * var(--spacing)) 5%;
  flex: 1;
}

.card {
  background: var(--white);
  border-radius: var(--border-radius);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  padding: calc(3 * var(--spacing));
  margin-bottom: calc(3 * var(--spacing));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: calc(3 * var(--spacing));
}

.card-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.primary-btn {
  background-color: var(--purple);
  color: white;
  border: none;
  padding: var(--spacing) calc(2 * var(--spacing));
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.primary-btn:hover {
  background-color: var(--purple-hover);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-btn {
  background-color: #eee;
  color: #333;
  border: none;
  padding: var(--spacing) calc(2 * var(--spacing));
  border-radius: 4px;
  cursor: pointer;
}

.icon-btn {
  background: #eee;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--grey-text);
  margin-left: var(--spacing);
}

.icon-btn:hover {
  background: #e0e0e0;
}

.secondary-text {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  font-size: 0.9rem;
}

.secondary-text:hover {
  color: white;
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  background-color: var(--navy);
  color: white;
  text-align: left;
  padding: calc(1.5 * var(--spacing));
  font-weight: 500;
}

td {
  padding: calc(1.5 * var(--spacing));
  border-bottom: 1px solid #eee;
}

.actions-col {
  text-align: right;
  white-space: nowrap;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 100%;
  max-width: 500px;
}

.form-group {
  margin-bottom: calc(2 * var(--spacing));
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 0.9rem;
}

.form-group input, .form-group textarea, .form-group select {
  width: 100%;
  padding: var(--spacing);
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.form-group input:disabled {
  background: #f5f5f5;
  color: #888;
}

.form-row {
  display: flex;
  gap: calc(2 * var(--spacing));
}

.form-row .form-group {
  flex: 1;
}

.checkboxes {
  gap: calc(2 * var(--spacing));
  align-items: center;
  flex-wrap: wrap;
}

.checkboxes label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: normal;
  cursor: pointer;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing);
  margin-top: calc(3 * var(--spacing));
}

.error-msg {
  color: #d32f2f;
  background: #ffebee;
  padding: var(--spacing);
  border-radius: 4px;
  margin-bottom: var(--spacing);
  font-size: 0.9rem;
}

.info-msg {
  padding: var(--spacing);
  background-color: #e3f2fd;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #1976d2;
}

.db-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing);
  padding: var(--spacing) calc(2 * var(--spacing));
  background-color: #fff3e0;
  border-bottom: 1px solid #ffcc80;
  font-size: 0.85rem;
  color: #e65100;
}

.db-warning .icon-btn {
  width: 22px;
  height: 22px;
  margin-left: 0;
  background: transparent;
  color: #e65100;
}

.db-warning .icon-btn:hover {
  background: rgba(230, 81, 0, 0.12);
}

.modal-hint {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: calc(2 * var(--spacing));
}

.modal-hint code, .info-msg code {
  background: rgba(0, 0, 0, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.85em;
}

.doc-modal {
  max-width: 600px;
}

.structure-modal {
  max-width: 600px;
}

.user-modal {
  max-width: 500px;
}

.field-row {
  display: flex;
  gap: var(--spacing);
  align-items: flex-end;
  margin-bottom: var(--spacing);
  flex-wrap: wrap;
}

.field-row input, .field-row select {
  flex: 1;
  min-width: 100px;
}

.field-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing);
  margin-bottom: calc(2 * var(--spacing));
}

.field-chip {
  background: #f0f0f0;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid #ddd;
  margin-bottom: calc(2 * var(--spacing));
}

.tab-bar button {
  background: none;
  border: none;
  padding: calc(1.5 * var(--spacing)) calc(2 * var(--spacing));
  cursor: pointer;
  font-size: 0.9rem;
  color: #666;
  border-bottom: 2px solid transparent;
}

.tab-bar button.active {
  color: var(--purple);
  border-bottom-color: var(--purple);
  font-weight: 500;
}

.login-tab {
  min-height: 80px;
}

.filter-toggle {
  display: inline-flex;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}

.filter-toggle button {
  background: none;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.8rem;
  color: #666;
}

.filter-toggle button.active {
  background: var(--purple);
  color: white;
}
</style>