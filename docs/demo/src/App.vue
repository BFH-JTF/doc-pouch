<script lang="ts" setup>
import {ref, onMounted, computed} from 'vue';
import {
  initService,
  handleOidcCallback,
  loginWithOidc,
  logout,
  loadData,
  loadSettings,
  saveSettings,
  clearSettings,
  createDocument,
  updateDocument,
  removeDocument,
  createStructure,
  toggleRealtime,
  clearAuthError,
  isConfigured,
  isAuthenticated,
  authMethod,
  authError,
  loading,
  documents,
  structures,
  realtimeEnabled,
} from './composables/useDocPouch';
import type {DocumentEntry, DataStructure, ServerSettings} from './types';

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

const showConfigModal = ref(!isConfigured.value);
const showLoginModal = ref(false);
const showDocModal = ref(false);
const showStructureModal = ref(false);
const editingDoc = ref<DocumentEntry | null>(null);

const configUrl = ref('');
const configPort = ref('');
const configToken = ref('');

const docForm = ref<any>({
  title: '',
  description: '',
  type: 0,
  subType: 0,
  content: '{}',
  owner: '',
  shareWithGroup: false,
  shareWithDepartment: false,
  public: false,
});

const structureForm = ref<Partial<DataStructure>>({
  name: '',
  description: '',
  type: 0,
  subType: 0,
  fields: [],
});

const fieldForm = ref({name: '', displayName: '', type: 'string', items: ''});

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const sortedDocuments = computed(() =>
    [...documents.value].sort((a, b) => a.title.localeCompare(b.title))
);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  const settings = loadSettings();
  configUrl.value = settings.url;
  configPort.value = settings.port;
  configToken.value = settings.registrationToken;

  if (!isConfigured.value) {
    showConfigModal.value = true;
    return;
  }

  const authenticated = await initService();

  if (!authenticated) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code') && urlParams.has('state')) {
      const handled = await handleOidcCallback();
      if (handled) {
        showLoginModal.value = false;
        return;
      }
    }
    if (urlParams.has('error') || urlParams.has('logout')) {
      // wasJustLoggedOut handled inside initService
    }
    showLoginModal.value = true;
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

async function handleLogin() {
  try {
    await loginWithOidc(configToken.value);
  } catch {
    // error is captured in authError ref
  }
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
    content: '{}' as any,
    owner: '',
    shareWithGroup: false,
    shareWithDepartment: false,
    public: false,
  };
  showDocModal.value = true;
}

function editDocument(doc: DocumentEntry) {
  editingDoc.value = doc;
  docForm.value = {
    ...doc,
    content: typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content, null, 2),
  };
  showDocModal.value = true;
}

async function saveDocument() {
  try {
    if (editingDoc.value) {
      await updateDocument(editingDoc.value._id, docForm.value);
    } else {
      await createDocument(docForm.value as Omit<DocumentEntry, '_id'>);
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

// ---------------------------------------------------------------------------
// Structure CRUD
// ---------------------------------------------------------------------------

function openAddStructure() {
  structureForm.value = {name: '', description: '', type: 0, subType: 0, fields: []};
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
    await createStructure(structureForm.value as DataStructure);
    showStructureModal.value = false;
  } catch (err: any) {
    alert(err.message || 'Save failed');
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
            {{ authMethod }}
          </span>
          <button v-if="isAuthenticated" :title="realtimeEnabled ? 'Disable realtime sync' : 'Enable realtime sync'" class="icon-btn"
                  @click="toggleRealtime(!realtimeEnabled)">
            {{ realtimeEnabled ? '🔴' : '⚪' }}
          </button>
          <button class="icon-btn secondary" title="Settings" @click="openConfig">⚙️</button>
          <button v-if="isAuthenticated" class="secondary-text" @click="logout">Logout</button>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="main-content">
      <div v-if="isAuthenticated" class="card">
        <div class="card-header">
          <h2>Documents</h2>
          <div class="header-actions">
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

      <div v-if="isAuthenticated && structures.length > 0" class="card">
        <div class="card-header">
          <h2>Data Structures</h2>
        </div>
        <div class="table-container">
          <table>
            <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Fields</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="s in structures" :key="s._id">
              <td>{{ s.name }}</td>
              <td>{{ s.type }} / {{ s.subType }}</td>
              <td>{{ s.fields.length }} fields</td>
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
        <div class="modal-actions">
          <button v-if="isConfigured" class="secondary-btn" @click="showConfigModal = false">Cancel</button>
          <button class="primary-btn" @click="saveConfig">Save</button>
        </div>
      </div>
    </div>

    <!-- Login Modal -->
    <div v-if="showLoginModal && !showConfigModal" class="modal-overlay">
      <div class="modal card">
        <h2>Login</h2>
        <div v-if="authError" class="error-msg">{{ authError }}</div>
        <div class="modal-actions">
          <button class="secondary-btn" @click="openConfig">Server Settings</button>
          <button :disabled="!configToken" class="primary-btn" @click="handleLogin">Login with OIDC</button>
        </div>
        <div v-if="!configToken" class="info-msg">
          You need an OIDC registration token. Click <strong>Server Settings</strong> to enter one.
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
          <textarea v-model="docForm.content" placeholder="Enter valid JSON"
                    rows="4"/>
        </div>
        <div class="form-row checkboxes">
          <label><input v-model="docForm.shareWithGroup" type="checkbox"/> Share with Group</label>
          <label><input v-model="docForm.shareWithDepartment" type="checkbox"/> Share with Department</label>
          <label><input v-model="docForm.public" type="checkbox"/> Public</label>
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
        <h2>New Data Structure</h2>
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
}

.checkboxes label {
  display: flex;
  align-items: center;
  gap: 4px;
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

.doc-modal {
  max-width: 600px;
}

.structure-modal {
  max-width: 600px;
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
</style>
